from __future__ import annotations

import json
import math
import os
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
from joblib import load as joblib_load

import risk  # risk.py

DEFAULT_CATEGORY_VOCAB = [
    "HOMICIDE",
    "CRIMINAL SEXUAL ASSAULT",
    "ROBBERY",
    "ASSAULT",
    "BATTERY",
    "BURGLARY",
    "MOTOR VEHICLE THEFT",
    "THEFT",
    "WEAPONS VIOLATION",
    "NARCOTICS",
    "OTHER OFFENSE",
    "CRIMINAL DAMAGE",
    "DECEPTIVE PRACTICE",
]


@dataclass
class AgentDecision:
    chosen_id: int
    predictions: List[Dict[str, Any]]  # per-route: id, pred_risk, features
    explanation: str
    explanation_factors: List[Dict[str, Any]]  # faithful factors


def _finite(x: Any, default: float = 0.0) -> float:
    try:
        v = float(x)
    except Exception:
        return float(default)
    if not math.isfinite(v):
        return float(default)
    return float(v)


def _teacher_proxy(fd: Dict[str, float]) -> float:
    """
    Stable risk-like proxy objective (lower = safer).
    Keep aligned with train_route_agent.py label_from_features().
    """
    nearby_per_km = _finite(fd.get("nearby_per_km", 0.0))
    high_sev = _finite(fd.get("high_severity_total", 0.0))
    is_late = _finite(fd.get("is_late", 0.0))
    length = _finite(fd.get("route_length_km", 0.0))

    y = (1.0 * nearby_per_km) + (2.5 * high_sev) + (0.15 * is_late) + (0.03 * length)
    return _finite(y, 0.0)


class RouteSafetyAgent:
    """
    Fully functional agent (works even without an ML model file):
      observe(routes, context)
      decide(ML if model exists; else fallback policy)
      explain(ML contributions if possible; else proxy-based explanation)
      learn(log for retrain)
    """

    def __init__(self, model_path: str, log_path: str):
        self.model_path = model_path
        self.log_path = log_path
        self._model = None

    # ---------------------------
    # Model loading
    # ---------------------------
    def _load_model(self):
        """
        Returns loaded model dict, or None if model file doesn't exist yet.
        This prevents /agent/route/choose from 500'ing before training.
        """
        if self._model is None:
            if not os.path.exists(self.model_path):
                return None
            self._model = joblib_load(self.model_path)
        return self._model

    # ---------------------------
    # Vectorization
    # ---------------------------
    def _vectorize(self, feat_dicts: List[Dict[str, float]], feature_order: List[str]) -> np.ndarray:
        X = np.zeros((len(feat_dicts), len(feature_order)), dtype=np.float32)
        for i, fd in enumerate(feat_dicts):
            for j, name in enumerate(feature_order):
                X[i, j] = _finite(fd.get(name, 0.0))
        # clamp to avoid any wild values
        X = np.nan_to_num(X, nan=0.0, posinf=1e6, neginf=-1e6)
        X = np.clip(X, -1e6, 1e6)
        return X

    # ---------------------------
    # Observation: build features
    # ---------------------------
    def observe(
        self,
        crimes: List[dict],
        routes: List[Dict[str, Any]],
        now: datetime,
        radius_km: float,
        window_days: int,
        category_vocab: Optional[List[str]] = None,
    ) -> Tuple[List[Dict[str, float]], List[int]]:
        vocab = category_vocab or DEFAULT_CATEGORY_VOCAB

        feat_dicts: List[Dict[str, float]] = []
        ids: List[int] = []

        for r in routes:
            rid = int(r["id"])
            path = r["path"]

            feats = risk.build_route_features(
                crimes=crimes,
                path=path,
                radius_km=radius_km,
                window_days=window_days,
                now=now,
                category_vocab=vocab,
            )

            # final sanitize: ensure finite floats
            clean: Dict[str, float] = {}
            for k, v in feats.items():
                clean[k] = _finite(v)
            feat_dicts.append(clean)
            ids.append(rid)

        return feat_dicts, ids

    # ---------------------------
    # Decision
    # ---------------------------
    def decide(self, feat_dicts: List[Dict[str, float]], ids: List[int]) -> Tuple[int, List[float]]:
        """
        If ML model exists:
          - predict risk-like value for each route; choose min
          - tie-break deterministically with teacher proxy

        If ML model missing (fallback):
          - use teacher proxy objective; choose min
        """
        model = self._load_model()

        # ---- Fallback mode (no trained model yet) ----
        if model is None:
            pred = [_teacher_proxy(fd) for fd in feat_dicts]
            best_idx = int(np.argmin(np.array(pred)))
            return ids[best_idx], pred

        # ---- ML mode ----
        feature_order = model["feature_order"]
        pipe = model["model"]  # sklearn Pipeline or estimator

        X = self._vectorize(feat_dicts, feature_order)

        pred_arr = pipe.predict(X).astype(float)
        pred_arr = np.nan_to_num(pred_arr, nan=0.0, posinf=1e6, neginf=-1e6)

        # tie-break with tiny epsilon * teacher proxy (deterministic)
        proxy = np.array([_teacher_proxy(fd) for fd in feat_dicts], dtype=float)
        proxy = np.nan_to_num(proxy, nan=0.0, posinf=1e6, neginf=-1e6)

        # Add a very small fraction so equal preds don't always pick index 0
        combined = pred_arr + (1e-6 * proxy)

        best_idx = int(np.argmin(combined))
        return ids[best_idx], pred_arr.tolist()

    # ---------------------------
    # Explanation
    # ---------------------------
    def explain(
        self,
        chosen_id: int,
        ids: List[int],
        feat_dicts: List[Dict[str, float]],
        pred: List[float],
    ) -> Tuple[str, List[Dict[str, Any]]]:
        """
        If ML model exists and is a Pipeline(StandardScaler + linear reg):
          - compute faithful contributions

        If model missing OR not linear:
          - proxy-based explanation with meaningful factors
        """
        model = self._load_model()

        chosen_idx = ids.index(chosen_id)

        # pick comparison route (second best by pred/proxy)
        pred_arr = np.array([_finite(x) for x in pred], dtype=float)
        order = np.argsort(pred_arr)
        alt_idx = int(order[1]) if len(order) > 1 else chosen_idx

        # ---- If model missing -> proxy explanation ----
        if model is None:
            c = feat_dicts[chosen_idx]
            a = feat_dicts[alt_idx]

            def diff(k: str) -> Dict[str, Any]:
                return {
                    "feature": k,
                    "alt_minus_chosen": _finite(a.get(k, 0.0)) - _finite(c.get(k, 0.0)),
                    "chosen_value": _finite(c.get(k, 0.0)),
                    "alt_value": _finite(a.get(k, 0.0)),
                }

            factors = [
                diff("nearby_per_km"),
                diff("high_severity_total"),
                diff("nearby_total"),
                diff("route_length_km"),
                diff("is_late"),
            ]

            explanation = (
                "I chose this route because it scores lower on my safety objective under your settings "
                "(fewer nearby incidents per km, fewer high-severity incidents, and reasonable detour length). "
                "This is the fallback policy while the ML model trains on your decisions."
            )
            return explanation, factors

        # ---- ML explanation if linear pipeline ----
        pipe = model["model"]
        feature_order = model["feature_order"]

        scaler = getattr(pipe, "named_steps", {}).get("scaler") if hasattr(pipe, "named_steps") else None
        reg = getattr(pipe, "named_steps", {}).get("reg") if hasattr(pipe, "named_steps") else None

        X = self._vectorize(feat_dicts, feature_order)

        # not a linear model we can decompose -> proxy explanation with model text
        if reg is None or not hasattr(reg, "coef_"):
            explanation = (
                "I chose this route because the ML safety model predicts lower risk given your settings. "
                "Train more data for richer explanations."
            )
            return explanation, []

        Xs = scaler.transform(X) if scaler is not None else X

        coefs = np.array(reg.coef_, dtype=float).reshape(-1)
        coefs = np.nan_to_num(coefs, nan=0.0, posinf=0.0, neginf=0.0)

        contrib = Xs * coefs  # (n_routes, n_features)
        contrib = np.nan_to_num(contrib, nan=0.0, posinf=0.0, neginf=0.0)

        # delta = how much each feature makes alt worse than chosen
        delta = contrib[alt_idx] - contrib[chosen_idx]

        # top positive deltas explain why chosen is safer than alt
        top_j = np.argsort(delta)[::-1][:6]

        factors: List[Dict[str, Any]] = []
        for j in top_j:
            name = feature_order[int(j)]
            factors.append(
                {
                    "feature": name,
                    "alt_minus_chosen_contribution": float(delta[int(j)]),
                    "chosen_value": float(_finite(feat_dicts[chosen_idx].get(name, 0.0))),
                    "alt_value": float(_finite(feat_dicts[alt_idx].get(name, 0.0))),
                }
            )

        def pretty(f: str) -> str:
            if f == "nearby_per_km":
                return "fewer nearby incidents per km"
            if f == "nearby_total":
                return "fewer nearby incidents overall"
            if f.startswith("cat__"):
                return f.replace("cat__", "").title()
            if f == "high_severity_total":
                return "fewer high-severity incidents"
            if f == "is_late":
                return "late-night weighting"
            if f == "route_length_km":
                return "a shorter detour"
            return f.replace("_", " ")

        bullets = [pretty(fx["feature"]) for fx in factors[:3] if "feature" in fx]
        while len(bullets) < 3:
            bullets.append("lower overall risk features")

        explanation = (
            "I chose this route because the ML safety model predicts lower risk given your settings. "
            f"The biggest drivers were {bullets[0]}, {bullets[1]}, and {bullets[2]} compared to the next-best option. "
            "If you want to bias more toward speed, reduce radius/window or category weights."
        )

        return explanation, factors

    # ---------------------------
    # Learning / logging
    # ---------------------------
    def learn_log(self, event: Dict[str, Any]) -> None:
        os.makedirs(os.path.dirname(self.log_path), exist_ok=True)
        with open(self.log_path, "a", encoding="utf-8") as f:
            f.write(json.dumps(event) + "\n")

    # ---------------------------
    # Full agent run
    # ---------------------------
    def run(
        self,
        crimes: List[dict],
        routes: List[Dict[str, Any]],
        now: datetime,
        radius_km: float,
        window_days: int,
        user_context: Optional[Dict[str, Any]] = None,
        category_vocab: Optional[List[str]] = None,
    ) -> AgentDecision:
        feat_dicts, ids = self.observe(crimes, routes, now, radius_km, window_days, category_vocab)
        chosen_id, pred = self.decide(feat_dicts, ids)
        explanation, factors = self.explain(chosen_id, ids, feat_dicts, pred)

        model_used = bool(self._load_model() is not None)

        self.learn_log(
            {
                "ts": datetime.now(timezone.utc).isoformat(),
                "type": "route_decision",
                "chosen_id": chosen_id,
                "pred": pred,
                "ids": ids,
                "features": feat_dicts,
                "context": user_context or {},
                "radius_km": radius_km,
                "window_days": window_days,
                "model_used": model_used,
            }
        )

        predictions: List[Dict[str, Any]] = []
        for i, rid in enumerate(ids):
            predictions.append(
                {
                    "id": rid,
                    "pred_risk": float(_finite(pred[i] if i < len(pred) else 0.0)),
                    "features": feat_dicts[i],
                }
            )

        return AgentDecision(
            chosen_id=chosen_id,
            predictions=predictions,
            explanation=explanation,
            explanation_factors=factors,
        )