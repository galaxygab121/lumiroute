from __future__ import annotations

import json
import os
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Tuple

import numpy as np
from joblib import dump
from sklearn.linear_model import Ridge
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

import risk


# -----------------------
# Config
# -----------------------

BASE_DIR = Path(__file__).parent
DEFAULT_MODEL_PATH = BASE_DIR / "models" / "route_agent.joblib"

# IMPORTANT: allow env override (you already used this)
DEFAULT_LOG_PATH_1 = BASE_DIR / "logs" / "agent_events.jsonl"
DEFAULT_LOG_PATH_2 = BASE_DIR / "data" / "agent_events.jsonl"


# -----------------------
# Training target (label)
# -----------------------

def label_from_features(fd: Dict[str, Any]) -> float:
    """
    Create a stable "risk-like" target.
    Lower => safer.
    This is the *teacher* for the initial ML agent.

    We combine:
      - nearby_per_km (main)
      - high_severity_total (stronger penalty)
      - is_late (slight penalty)
      - route_length_km (small penalty to avoid very long detours)

    This avoids needing user feedback at first.
    """
    nearby_per_km = float(fd.get("nearby_per_km", 0.0))
    high_sev = float(fd.get("high_severity_total", 0.0))
    is_late = float(fd.get("is_late", 0.0))
    length = float(fd.get("route_length_km", 0.0))

    y = (
        1.0 * nearby_per_km
        + 2.5 * high_sev
        + 0.15 * is_late
        + 0.03 * length
    )
    if not np.isfinite(y):
        y = 0.0
    return float(y)


# -----------------------
# Log reading
# -----------------------

def _resolve_log_path() -> Path:
    env = os.getenv("LUMIROUTE_AGENT_LOG_PATH")
    if env:
        return Path(env)

    # fallback
    if DEFAULT_LOG_PATH_1.exists():
        return DEFAULT_LOG_PATH_1
    return DEFAULT_LOG_PATH_2


def read_events(log_path: Path) -> List[Dict[str, Any]]:
    if not log_path.exists():
        raise RuntimeError(f"Agent event log not found: {log_path}")

    events: List[Dict[str, Any]] = []
    with open(log_path, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                events.append(json.loads(line))
            except Exception:
                # skip malformed lines
                continue
    return events


# -----------------------
# Build training data
# -----------------------

def build_training_from_decisions(events: List[Dict[str, Any]]) -> Tuple[np.ndarray, np.ndarray, List[str]]:
    """
    We train on all routes present in route_decision events:
      each event has: features: [ {feat...}, {feat...}, ...]
    We create one row per route.
    """
    rows: List[Dict[str, float]] = []

    for e in events:
        if e.get("type") != "route_decision":
            continue

        feats_list = e.get("features")
        if not isinstance(feats_list, list):
            continue

        for fd in feats_list:
            if not isinstance(fd, dict):
                continue
            # ensure numeric, finite
            clean: Dict[str, float] = {}
            for k, v in fd.items():
                try:
                    fv = float(v)
                except Exception:
                    fv = 0.0
                if not np.isfinite(fv):
                    fv = 0.0
                clean[k] = fv
            rows.append(clean)

    if not rows:
        raise RuntimeError("No route_decision events found. Run the app and generate a few routes first.")

    # feature order = stable sorted union of keys
    all_keys = sorted({k for r in rows for k in r.keys()})

    X = np.zeros((len(rows), len(all_keys)), dtype=np.float32)
    y = np.zeros((len(rows),), dtype=np.float32)

    for i, fd in enumerate(rows):
        for j, k in enumerate(all_keys):
            X[i, j] = float(fd.get(k, 0.0))
        y[i] = float(label_from_features(fd))

    # FINAL SAFETY: remove NaN/inf, clip extremes
    X = np.nan_to_num(X, nan=0.0, posinf=1e6, neginf=-1e6)
    X = np.clip(X, -1e6, 1e6)
    y = np.nan_to_num(y, nan=0.0, posinf=1e6, neginf=-1e6)
    y = np.clip(y, -1e6, 1e6)

    return X, y, all_keys


# -----------------------
# Train + Save
# -----------------------

def main() -> None:
    # load crimes once so overall environment matches runtime
    risk.load_crimes_once()

    log_path = _resolve_log_path()
    events = read_events(log_path)

    X, y, feature_order = build_training_from_decisions(events)

    pipe = Pipeline(
        steps=[
            ("scaler", StandardScaler()),
            ("reg", Ridge(alpha=1.0, random_state=0)),
        ]
    )

    pipe.fit(X, y)

    model_obj = {
        "feature_order": feature_order,
        "model": pipe,
        "meta": {
            "trained_rows": int(X.shape[0]),
            "log_path": str(log_path),
        },
    }

    DEFAULT_MODEL_PATH.parent.mkdir(parents=True, exist_ok=True)
    dump(model_obj, DEFAULT_MODEL_PATH)

    print(f"[Lumiroute] Saved route safety agent model to: {DEFAULT_MODEL_PATH}")
    print(f"[Lumiroute] Trained on rows: {X.shape[0]}")
    print(f"[Lumiroute] Feature count: {len(feature_order)}")


if __name__ == "__main__":
    main()