from __future__ import annotations

import csv
import math
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Iterable, List, Optional, Tuple

# -----------------------
# Globals / Config
# -----------------------

CRIMES: List[Dict[str, Any]] = []
_CRIMES_LOADED = False

DATA_DIR = os.path.join(os.path.dirname(__file__), "data")
CRIMES_CSV = os.path.join(DATA_DIR, "crimes.csv")

# A small vocab for features + explanations.
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

HIGH_SEVERITY = {
    "HOMICIDE",
    "CRIMINAL SEXUAL ASSAULT",
    "ROBBERY",
    "ASSAULT",
    "BATTERY",
    "WEAPONS VIOLATION",
}


# -----------------------
# Utilities
# -----------------------

def _parse_dt_any(s: str) -> Optional[datetime]:
    """
    Your CSV uses formats like: '02/21/2025 05:25:00 AM'
    We'll parse robustly. Return timezone-aware UTC.
    """
    if not s:
        return None
    s = s.strip()

    # Common Chicago data export format
    for fmt in (
        "%m/%d/%Y %I:%M:%S %p",
        "%m/%d/%Y %H:%M:%S",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%dT%H:%M:%S%z",
        "%Y-%m-%dT%H:%M:%S.%f%z",
    ):
        try:
            dt = datetime.strptime(s, fmt)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            else:
                dt = dt.astimezone(timezone.utc)
            return dt
        except Exception:
            pass
    return None


def _safe_float(x: Any) -> Optional[float]:
    try:
        if x is None:
            return None
        s = str(x).strip()
        if s == "":
            return None
        return float(s)
    except Exception:
        return None


def _norm_key(k: str) -> str:
    return (k or "").strip().upper()


def _haversine_m(a_lat: float, a_lng: float, b_lat: float, b_lng: float) -> float:
    """
    Great circle distance in meters.
    """
    R = 6371000.0
    dlat = math.radians(b_lat - a_lat)
    dlng = math.radians(b_lng - a_lng)
    lat1 = math.radians(a_lat)
    lat2 = math.radians(b_lat)

    x = (math.sin(dlat / 2) ** 2) + math.cos(lat1) * math.cos(lat2) * (math.sin(dlng / 2) ** 2)
    return 2 * R * math.asin(math.sqrt(x))


def _route_length_km(path: List[Dict[str, float]]) -> float:
    if not path or len(path) < 2:
        return 0.0
    total_m = 0.0
    prev = path[0]
    for cur in path[1:]:
        total_m += _haversine_m(prev["lat"], prev["lng"], cur["lat"], cur["lng"])
        prev = cur
    return total_m / 1000.0


def _tod_features(now: datetime) -> Tuple[float, float, float, float]:
    """
    Time-of-day features:
      hour (0-23)
      is_late (1 if after 10pm OR before 5am)
      sin/cos encoding
    """
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)
    now_utc = now.astimezone(timezone.utc)

    hour = float(now_utc.hour)
    is_late = 1.0 if (hour >= 22.0 or hour <= 4.0) else 0.0

    # sin/cos
    angle = 2.0 * math.pi * (hour / 24.0)
    return hour, is_late, math.sin(angle), math.cos(angle)


def _sanitize_feats(feats: Dict[str, Any]) -> Dict[str, float]:
    """
    Ensure every returned feature is a finite float.
    """
    out: Dict[str, float] = {}
    for k, v in feats.items():
        try:
            fv = float(v)
        except Exception:
            fv = 0.0
        if not math.isfinite(fv):
            fv = 0.0
        out[k] = fv
    return out


# -----------------------
# Loading / Filtering
# -----------------------

def load_crimes_once(csv_path: str = CRIMES_CSV) -> None:
    global CRIMES, _CRIMES_LOADED

    if _CRIMES_LOADED:
        return

    if not os.path.exists(csv_path):
        print(f"[Lumiroute] Crimes CSV not found at: {csv_path}")
        CRIMES = []
        _CRIMES_LOADED = True
        return

    rows: List[Dict[str, Any]] = []

    with open(csv_path, newline="", encoding="utf-8-sig") as f:
        r = csv.DictReader(f)
        headers = r.fieldnames or []
        hdr_map = {_norm_key(h): h for h in headers}

        # Common variants in your file
        date_key = hdr_map.get("DATE  OF OCCURRENCE") or hdr_map.get("DATE OF OCCURRENCE") or hdr_map.get("DATE")
        lat_key = hdr_map.get("LATITUDE")
        lng_key = hdr_map.get("LONGITUDE")
        prim_key = hdr_map.get("PRIMARY DESCRIPTION") or hdr_map.get(" PRIMARY DESCRIPTION")
        sec_key = hdr_map.get("SECONDARY DESCRIPTION") or hdr_map.get(" SECONDARY DESCRIPTION")
        block_key = hdr_map.get("BLOCK")
        case_key = hdr_map.get("CASE#") or hdr_map.get("CASE #") or hdr_map.get("CASE")

        for row in r:
            lat = _safe_float(row.get(lat_key) if lat_key else None)
            lng = _safe_float(row.get(lng_key) if lng_key else None)
            if lat is None or lng is None:
                continue

            dt = _parse_dt_any(row.get(date_key, "") if date_key else "")
            if dt is None:
                # if no date parse, keep but mark unknown
                dt = datetime(1970, 1, 1, tzinfo=timezone.utc)

            primary = (row.get(prim_key, "") if prim_key else "").strip().upper()
            secondary = (row.get(sec_key, "") if sec_key else "").strip()

            rows.append(
                {
                    "lat": float(lat),
                    "lng": float(lng),
                    "dt": dt,
                    "primary": primary,
                    "secondary": secondary,
                    "block": (row.get(block_key, "") if block_key else "").strip(),
                    "case": (row.get(case_key, "") if case_key else "").strip(),
                }
            )

    CRIMES = rows
    _CRIMES_LOADED = True
    print(f"[Lumiroute] Loaded {len(CRIMES)} crime rows from CSV.")


def filter_crimes_in_box(
    min_lat: float,
    min_lng: float,
    max_lat: float,
    max_lng: float,
    start_time: datetime,
    end_time: datetime,
) -> List[Dict[str, Any]]:
    """
    Filter global CRIMES into bbox + time window.
    """
    load_crimes_once()
    if start_time.tzinfo is None:
        start_time = start_time.replace(tzinfo=timezone.utc)
    if end_time.tzinfo is None:
        end_time = end_time.replace(tzinfo=timezone.utc)

    out: List[Dict[str, Any]] = []
    for c in CRIMES:
        lat = c["lat"]
        lng = c["lng"]
        if lat < min_lat or lat > max_lat or lng < min_lng or lng > max_lng:
            continue
        dt = c["dt"]
        if dt < start_time or dt > end_time:
            continue
        out.append(c)
    return out


# -----------------------
# Core scoring / features
# -----------------------

def _count_near_route(
    crimes: List[Dict[str, Any]],
    path: List[Dict[str, float]],
    radius_km: float,
    sample_step: int = 4,
) -> Tuple[int, Dict[str, int]]:
    """
    Counts crimes within radius_km of any sampled path point.
    Returns (total_count, counts_by_primary_category).
    """
    if not crimes or not path:
        return 0, {}

    radius_m = float(radius_km) * 1000.0
    step = max(1, int(sample_step))

    # sample points on route to reduce cost
    sampled = path[::step]
    if sampled[-1] != path[-1]:
        sampled.append(path[-1])

    total = 0
    by_cat: Dict[str, int] = {}

    for c in crimes:
        clat = c["lat"]
        clng = c["lng"]
        # quick min distance to sampled points
        best = float("inf")
        for p in sampled:
            d = _haversine_m(clat, clng, p["lat"], p["lng"])
            if d < best:
                best = d
            if best <= radius_m:
                break

        if best <= radius_m:
            total += 1
            cat = c.get("primary", "") or ""
            by_cat[cat] = by_cat.get(cat, 0) + 1

    return total, by_cat


def build_route_features(
    crimes: List[Dict[str, Any]],
    path: List[Dict[str, float]],
    radius_km: float,
    window_days: int,
    now: datetime,
    category_vocab: Optional[List[str]] = None,
) -> Dict[str, float]:
    """
    Features used by the RouteSafetyAgent.
    MUST return finite floats only.
    """
    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    vocab = category_vocab or DEFAULT_CATEGORY_VOCAB

    # route length
    length_km = _route_length_km(path)

    # IMPORTANT: floor the length to avoid div-by-zero explosions
    length_floor_km = max(float(length_km), 0.05)  # 50 meters

    nearby_total, by_cat = _count_near_route(crimes, path, radius_km=radius_km)

    # safe ratio
    nearby_per_km = float(nearby_total) / length_floor_km

    # severity counts
    high_sev_total = 0.0
    for cat, cnt in by_cat.items():
        if cat in HIGH_SEVERITY:
            high_sev_total += float(cnt)

    hour, is_late, tod_sin, tod_cos = _tod_features(now)

    feats: Dict[str, Any] = {
        "route_length_km": float(length_km),
        "nearby_total": float(nearby_total),
        "nearby_per_km": float(nearby_per_km),
        "radius_km": float(radius_km),
        "window_days": float(window_days),
        "tod_sin": float(tod_sin),
        "tod_cos": float(tod_cos),
        "is_late": float(is_late),
        "hour": float(hour),
        "high_severity_total": float(high_sev_total),
    }

    # one-hot-ish counts for category vocab
    for cat in vocab:
        feats[f"cat__{cat}"] = float(by_cat.get(cat, 0))

    # sanitize (no NaN/inf)
    return _sanitize_feats(feats)


def score_route(
    path: List[Dict[str, float]],
    crimes: List[Dict[str, Any]],
    radius_km: float,
    now: datetime,
    window_days: int,
    weights: Optional[Dict[str, float]] = None,
) -> Tuple[float, Dict[str, Any]]:
    """
    Returns:
      (risk_score, details)
    risk_score: higher = riskier
    """
    weights = weights or {}

    nearby_total, by_cat = _count_near_route(crimes, path, radius_km=radius_km)
    length_km = _route_length_km(path)
    length_floor_km = max(float(length_km), 0.05)

    # weighted category sum
    weighted = 0.0
    for cat, cnt in by_cat.items():
        w = float(weights.get(cat, 1.0))
        weighted += w * float(cnt)

    # normalize by length
    risk = weighted / length_floor_km

    # details: top categories
    top = sorted(by_cat.items(), key=lambda x: x[1], reverse=True)[:6]
    details = {
        "nearby_count": int(nearby_total),
        "top_categories": [{"category": k, "count": int(v)} for k, v in top],
        "radius_km": float(radius_km),
        "window_days": int(window_days),
    }

    # final safety guard
    if not math.isfinite(risk):
        risk = 0.0

    return float(risk), details

def score_route_by_mode(
    *,
    path: List[Dict[str, float]],
    crimes: List[Dict[str, Any]],
    radius_km: float,
    now: datetime,
    window_days: int,
    weights: Optional[Dict[str, float]] = None,
    travel_mode: str = "WALKING",
    transit_stops: Optional[List[Dict[str, float]]] = None,
) -> Tuple[float, Dict[str, Any]]:
    """
    Mode-aware scoring wrapper.

    WALKING/BICYCLING:
      - Score along the full polyline (mid-block exposure).
    DRIVING:
      - Same as walking but downweighted (less exposure time).
    TRANSIT:
      - Mix:
          (A) stop exposure near stations/stops (dominant)
          (B) small walking exposure (first/last mile)
    """
    weights = weights or {}
    travel_mode = (travel_mode or "WALKING").upper()

    # base score from the full path (works for walking/biking/driving too)
    base_risk, base_details = score_route(
        path=path,
        crimes=crimes,
        radius_km=radius_km,
        now=now,
        window_days=window_days,
        weights=weights,
    )

    # ---- TRANSIT: focus near stops/stations ----
    if travel_mode == "TRANSIT":
        stops = transit_stops or []

        # If we have stops, score them as a tiny "path"
        if len(stops) > 0:
            stop_risk, stop_details = score_route(
                path=stops,
                crimes=crimes,
                radius_km=radius_km,
                now=now,
                window_days=window_days,
                weights=weights,
            )

            # Mix weights (tweakable): stops dominate, walking component smaller
            walk_w = 0.35
            stops_w = 0.65

            risk = (base_risk * walk_w) + (stop_risk * stops_w)

            details = {
                "nearby_count": int((base_details.get("nearby_count", 0) or 0) + (stop_details.get("nearby_count", 0) or 0)),
                "top_categories": (stop_details.get("top_categories") or base_details.get("top_categories") or []),
                "radius_km": float(radius_km),
                "window_days": int(window_days),
                "mode_breakdown": {
                    "mode": "TRANSIT",
                    "walk_component": float(base_risk),
                    "stop_component": float(stop_risk),
                    "walk_weight": walk_w,
                    "stop_weight": stops_w,
                    "stops_count": len(stops),
                },
            }
            return float(risk), details

        # fallback: no stops => just use base
        base_details["mode_breakdown"] = {"mode": "TRANSIT", "fallback": "no_stops"}
        return float(base_risk), base_details

    # ---- DRIVING: downweight exposure ----
    if travel_mode == "DRIVING":
        risk = base_risk * 0.70
        base_details["mode_breakdown"] = {"mode": "DRIVING", "weight": 0.70}
        return float(risk), base_details

    # ---- BICYCLING: slightly higher exposure than walking (optional) ----
    if travel_mode == "BICYCLING":
        risk = base_risk * 1.10
        base_details["mode_breakdown"] = {"mode": "BICYCLING", "weight": 1.10}
        return float(risk), base_details

    # ---- WALKING (default) ----
    base_details["mode_breakdown"] = {"mode": "WALKING", "weight": 1.0}
    return float(base_risk), base_details

    
