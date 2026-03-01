import datetime as dt

from fastapi.responses import JSONResponse

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from datetime import datetime, timezone
from fastapi.responses import JSONResponse
import os

from pydantic import BaseModel
from typing import Any, Dict, List, Optional

import risk
from agent_route import RouteSafetyAgent

from risk import filter_crimes_in_box, score_route
from mailer import send_email

import secrets
from typing import Dict, Any, Optional

from pathlib import Path

app = FastAPI()
WALKS: Dict[str, Dict[str, Any]] = {}

BASE_DIR = Path(__file__).parent

AGENT_MODEL_PATH = str(BASE_DIR / "models" / "route_agent.joblib")
AGENT_LOG_PATH = str(BASE_DIR / "data" / "agent_events.jsonl")


route_agent = RouteSafetyAgent(
    model_path=AGENT_MODEL_PATH,
    log_path=AGENT_LOG_PATH,
)

print("[Lumiroute] RouteSafetyAgent model:", AGENT_MODEL_PATH)
print("[Lumiroute] RouteSafetyAgent log:", AGENT_LOG_PATH)

route_agent = RouteSafetyAgent(
    model_path=str(Path(__file__).parent / "models" / "route_agent.joblib"),
    log_path=str(Path(__file__).parent / "data" / "agent_events.jsonl"),
)

# ---- CORS (allow your local Next.js dev server) ----
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------
# Models
# ---------------------------

class LatLng(BaseModel):
    lat: float
    lng: float


class RoutePayload(BaseModel):
    id: int
    path: List[LatLng]


class Preferences(BaseModel):
    # Option 4 controls
    radius_km: float = 0.75
    window_days: int = 90
    weights: Dict[str, float] = {}


class ScoreRequest(BaseModel):
    datetime_iso: str
    routes: List[RoutePayload]
    preferences: Optional[Preferences] = None


class HeatRequest(BaseModel):
    datetime_iso: str
    min_lat: float
    min_lng: float
    max_lat: float
    max_lng: float
    window_days: int = 30
    cell_km: float = 0.25  # grid size in km (smaller = more detailed but more points)

class EscalateRequest(BaseModel):
    to_email: str
    user_label: str = "Lumiroute user"
    reason: str
    lat: float
    lng: float
    last_checkin_iso: str
    safe_route_summary: str = ""

class WalkStartRequest(BaseModel):
    user_label: str = "Lumiroute user"

class WalkStartResponse(BaseModel):
    token: str

class WalkUpdateRequest(BaseModel):
    token: str
    live_active: bool
    escalated: bool
    off_route: bool
    seconds_left: Optional[int] = None
    last_checkin_iso: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None

class WalkStateResponse(BaseModel):
    token: str
    user_label: str
    live_active: bool
    escalated: bool
    off_route: bool
    seconds_left: Optional[int]
    last_checkin_iso: Optional[str]
    lat: Optional[float]
    lng: Optional[float]
    updated_at_iso: str

class AgentChooseReq(BaseModel):
    datetime_iso: str
    routes: List[Dict[str, Any]]  # [{id:int, path:[{lat,lng},...]}, ...]
    preferences: Dict[str, Any]   # {radius_km, window_days, ...}
    context: Optional[Dict[str, Any]] = None

class AgentFeedbackReq(BaseModel):
    token: Optional[str] = None
    chosen_id: int
    user_selected_id: int
    rating: Optional[int] = None   # 1-5
    felt_safe: Optional[bool] = None
    notes: Optional[str] = None


# ---------------------------
# Routes
# ---------------------------

@app.get("/health")
def health():
    return {"ok": True}


@app.post("/risk/score")
def risk_score(req: ScoreRequest):
    """
    Given multiple route alternatives (each with a polyline decoded into points),
    compute a risk_score for each route using local CSV crime data.
    Also returns details for your "agent explanation".
    """

    # Parse time
    now = dt.datetime.fromisoformat(req.datetime_iso.replace("Z", "+00:00"))

    # Preferences (Option 4)
    prefs = req.preferences or Preferences()
    radius_km = float(prefs.radius_km)
    window_days = int(prefs.window_days)
    weights = dict(prefs.weights or {})

    start_time = now - dt.timedelta(days=window_days)
    end_time = now

    # Build a single bounding box around ALL routes (faster than per-route filtering)
    lats = [p.lat for r in req.routes for p in r.path]
    lngs = [p.lng for r in req.routes for p in r.path]

    # Simple padding so we don't miss crimes slightly off the line
    pad = 0.01
    min_lat, max_lat = min(lats) - pad, max(lats) + pad
    min_lng, max_lng = min(lngs) - pad, max(lngs) + pad

    crimes = filter_crimes_in_box(min_lat, min_lng, max_lat, max_lng, start_time, end_time)

    results = []
    for r in req.routes:
        path = [{"lat": p.lat, "lng": p.lng} for p in r.path]

        score, details = score_route(
            path,
            crimes,
            radius_km=radius_km,
            now=now,
            window_days=window_days,
            weights=weights,
        )

        results.append({
            "id": r.id,
            "risk_score": score,
            "details": details,
        })

    return {"results": results, "crime_points_used": len(crimes)}


@app.post("/risk/heat")
def risk_heat(req: HeatRequest):
    """
    Option 3 Heat Overlay:
    Return binned "density points" (lat/lng + count) for a bounding box
    so the frontend can render red heat circles.
    """

    now = dt.datetime.fromisoformat(req.datetime_iso.replace("Z", "+00:00"))
    start_time = now - dt.timedelta(days=req.window_days)
    end_time = now

    crimes = filter_crimes_in_box(
        req.min_lat,
        req.min_lng,
        req.max_lat,
        req.max_lng,
        start_time,
        end_time,
    )

    # Convert km -> degrees (rough but good enough for Chicago MVP)
    cell_deg = req.cell_km / 111.0

    # Bin crimes into grid cells
    bins: Dict[tuple, int] = {}
    for c in crimes:
        gx = int((c["lat"] - req.min_lat) / cell_deg)
        gy = int((c["lng"] - req.min_lng) / cell_deg)
        key = (gx, gy)
        bins[key] = bins.get(key, 0) + 1

    # Return center point of each cell + count
    points = []
    for (gx, gy), count in bins.items():
        lat = req.min_lat + (gx + 0.5) * cell_deg
        lng = req.min_lng + (gy + 0.5) * cell_deg
        points.append({"lat": lat, "lng": lng, "count": count})

    return {"points": points, "used": len(crimes)}

@app.post("/alert/escalate")
def alert_escalate(req: EscalateRequest):
    subject = f"[Lumiroute] Check-in missed: {req.user_label}"

    maps_link = f"https://www.google.com/maps?q={req.lat},{req.lng}"
    body = (
        f"{req.user_label} missed a check-in.\n\n"
        f"Reason: {req.reason}\n"
        f"Last check-in: {req.last_checkin_iso}\n"
        f"Last known location: {req.lat}, {req.lng}\n"
        f"Map link: {maps_link}\n\n"
        f"Route context:\n{req.safe_route_summary}\n"
    )

    send_email(req.to_email, subject, body)
    return {"ok": True}

@app.post("/walk/start", response_model=WalkStartResponse)
def walk_start(req: WalkStartRequest):
    token = secrets.token_urlsafe(16)
    WALKS[token] = {
        "user_label": req.user_label,
        "live_active": True,
        "escalated": False,
        "off_route": False,
        "seconds_left": None,
        "last_checkin_iso": None,
        "lat": None,
        "lng": None,
        "updated_at_iso": datetime.utcnow().isoformat() + "Z",
    }
    return {"token": token}


@app.post("/walk/update")
def walk_update(req: WalkUpdateRequest):
    s = WALKS.get(req.token)
    if not s:
        return JSONResponse(status_code=404, content={"error": "Unknown token"})

    s["live_active"] = req.live_active
    s["escalated"] = req.escalated
    s["off_route"] = req.off_route
    s["seconds_left"] = req.seconds_left
    s["last_checkin_iso"] = req.last_checkin_iso
    s["lat"] = req.lat
    s["lng"] = req.lng
    s["updated_at_iso"] = datetime.utcnow().isoformat() + "Z"
    return {"ok": True}


@app.get("/walk/{token}", response_model=WalkStateResponse)
def walk_get(token: str):
    s = WALKS.get(token)
    if not s:
        return JSONResponse(status_code=404, content={"error": "Unknown token"})

    return {"token": token, **s}

@app.post("/agent/route/choose")
def agent_route_choose(req: AgentChooseReq):
    risk.load_crimes_once()
    crimes = risk.CRIMES  # or however you store loaded crimes

    now = datetime.fromisoformat(req.datetime_iso.replace("Z", "+00:00"))
    radius_km = float(req.preferences.get("radius_km", 0.25))
    window_days = int(req.preferences.get("window_days", 30))

    decision = route_agent.run(
        crimes=crimes,
        routes=req.routes,
        now=now,
        radius_km=radius_km,
        window_days=window_days,
        user_context=req.context or {},
    )

    return {
        "chosen_id": decision.chosen_id,
        "explanation": decision.explanation,
        "explanation_factors": decision.explanation_factors,
        "predictions": decision.predictions,
    }

@app.post("/agent/feedback")
def agent_feedback(req: AgentFeedbackReq):
    route_agent.learn_log({
        "ts": datetime.now(timezone.utc).isoformat(),
        "type": "route_feedback",
        "chosen_id": req.chosen_id,
        "user_selected_id": req.user_selected_id,
        "rating": req.rating,
        "felt_safe": req.felt_safe,
        "notes": req.notes or "",
        "token": req.token,
    })
    return {"ok": True}