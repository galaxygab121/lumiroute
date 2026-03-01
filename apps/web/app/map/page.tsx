"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  APIProvider,
  Map as GMap,
  Marker,
  useMap,
  type MapMouseEvent,
} from "@vis.gl/react-google-maps";

/**
 * -----------------------
 * Types
 * -----------------------
 */
type LatLng = google.maps.LatLngLiteral;

type RouteAlt = {
  id: number;
  path: LatLng[];
  etaMin: number;
  distMi: number;
};

type ScoredRouteDetails = {
  nearby_count: number;
  top_categories: Array<{ category: string; count: number }>;
  radius_km: number;
  window_days: number;
};

type ScoredRoute = {
  id: number;
  risk_score: number;
  details: ScoredRouteDetails;
};

type HeatPoint = { lat: number; lng: number; count: number };

type AgentChooseResponse = {
  chosen_id: number;
  explanation: string;
  explanation_factors?: Array<{
    feature: string;
    alt_minus_chosen_contribution: number;
    chosen_value: number;
    alt_value: number;
  }>;
  predictions: Array<{
    id: number;
    pred_risk: number;
    features?: Record<string, number>;
  }>;
};
type SafePlace = {
  placeId: string;
  name: string;
  location: LatLng;
  address?: string;
  rating?: number;
  userRatingsTotal?: number;
  types?: string[];
  category?: SafePlaceCategory;
};

type SafePlaceCategory = "police" | "hospital" | "24hr_store";
type PlacesType = "police" | "hospital" | "convenience_store";

function NearestSafePlaceController({
  location,
  category,
  onResult,
  onError,
  exposeFindFn,
}: {
  location: LatLng | null;
  category: SafePlaceCategory;
  onResult: (p: SafePlace | null) => void;
  onError: (msg: string) => void;
  exposeFindFn: (fn: (() => void) | null) => void;
}) {
  const map = useMap();

  useEffect(() => {
    if (!map) {
      exposeFindFn(null);
      return;
    }

    let cancelled = false;

    const find = () => {
      if (!location) {
        onError("No location available to search around yet.");
        return;
      }

      if (!google?.maps?.places) {
        onError("Google Places library not loaded. Make sure APIProvider has libraries={['places']}.");
        return;
      }

      try {
        const svc = new google.maps.places.PlacesService(map);

        let type: PlacesType | undefined;
        let keyword: string | undefined;

        if (category === "police") type = "police";
        if (category === "hospital") type = "hospital";
        if (category === "24hr_store") {
          type = "convenience_store";
          keyword = "24 hour";
        }

        const req: google.maps.places.PlaceSearchRequest = {
          location,
          rankBy: google.maps.places.RankBy.DISTANCE,
          openNow: true,
          type,
          keyword,
        };

        svc.nearbySearch(req, (results, status) => {
          if (cancelled) return;

          if (status !== google.maps.places.PlacesServiceStatus.OK || !results?.length) {
            onError("No open safe places found nearby.");
            onResult(null);
            return;
          }

          const best = results[0];
          if (!best.place_id || !best.geometry?.location) {
            onError("Places result missing details.");
            onResult(null);
            return;
          }

          const sp: SafePlace = {
            placeId: best.place_id,
            name: best.name ?? "Safe place",
            address: best.vicinity ?? "",
            location: {
              lat: best.geometry.location.lat(),
              lng: best.geometry.location.lng(),
            },
            rating: typeof best.rating === "number" ? best.rating : undefined,
            userRatingsTotal:
              typeof best.user_ratings_total === "number" ? best.user_ratings_total : undefined,
            category,
          };

          onError("");
          onResult(sp);
        });
      } catch (e) {
        onError(e instanceof Error ? e.message : "Safe place search failed.");
        onResult(null);
      }
    };

    exposeFindFn(() => find());

    return () => {
      cancelled = true;
      exposeFindFn(null);
    };
  }, [map, location, category]);

  return null;
}


/**
 * -----------------------
 * Helpers 
 * -----------------------
 */

// meters -> miles
function metersToMiles(m: number) {
  return m / 1609.344;
}

// seconds -> minutes (rounded, min 1)
function secondsToMinutes(s: number) {
  return Math.max(1, Math.round(s / 60));
}

// risk -> safety score (0–100)
function riskToSafety(risk: number): number {
  const safety = 100 * Math.exp(-risk / 5);
  return Math.max(0, Math.min(100, Math.round(safety)));
}

// array of {id} -> map of id -> item
function byId<T extends { id: number }>(arr: T[]) {
  const m = new Map<number, T>();
  for (const x of arr) m.set(x.id, x);
  return m;
}

// decode Google encoded polyline -> LatLng[]
function decodePolyline(encoded: string): LatLng[] {
  let index = 0;
  const len = encoded.length;
  let lat = 0;
  let lng = 0;
  const coordinates: LatLng[] = [];

  while (index < len) {
    let b: number;
    let shift = 0;
    let result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += deltaLat;

    shift = 0;
    result = 0;

    do {
      b = encoded.charCodeAt(index++) - 63;
      result |= (b & 0x1f) << shift;
      shift += 5;
    } while (b >= 0x20);

    const deltaLng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += deltaLng;

    coordinates.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return coordinates;
}

// safely get overview polyline string from a DirectionsRoute
function getEncodedOverviewPolyline(route: google.maps.DirectionsRoute): string {
  const op = route.overview_polyline;

  // some environments expose this as a string
  if (typeof op === "string") return op;

  // standard: { points: string }
  if (op && typeof (op as { points?: unknown }).points === "string") {
    return (op as { points: string }).points;
  }

  return "";
}

// distance between two points (meters)
function haversineMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) *
      Math.cos(lat2) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);

  return 2 * R * Math.asin(Math.sqrt(x));
}

// approximate “how far from route” (meters) by sampling points
function minDistanceToPathMeters(point: LatLng, path: LatLng[]): number {
  if (!path.length) return Number.POSITIVE_INFINITY;

  // sample fewer points if huge route
  const step = path.length > 400 ? 8 : path.length > 150 ? 4 : 1;

  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < path.length; i += step) {
    const d = haversineMeters(point, path[i]);
    if (d < best) best = d;
  }
  return best;
}

// live status pill
function getLiveStatus(opts: {
  liveActive: boolean;
  escalated: boolean;
  secondsLeft: number | null;
  offRoute: boolean;
}) {
  const { liveActive, escalated, secondsLeft, offRoute } = opts;

  if (!liveActive)
    return { label: "Not active", cls: "bg-gray-100 text-gray-800 border-gray-200" };
  if (escalated)
    return { label: "Escalated", cls: "bg-red-100 text-red-800 border-red-200" };
  if (offRoute)
    return { label: "Off route", cls: "bg-orange-100 text-orange-800 border-red-200" };
  if (secondsLeft !== null && secondsLeft <= 10)
    return { label: "Check-in due", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" };
  return { label: "On route", cls: "bg-green-100 text-green-800 border-green-200" };
}

function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

// Rough conversions (fine for Chicago MVP)
function metersToLatDeg(m: number) {
  return m / 111_000;
}
function metersToLngDeg(m: number, atLat: number) {
  return m / (111_000 * Math.cos((atLat * Math.PI) / 180));
}

/**
 * Builds "via" points around the midpoint of the trip.
 * These force Google to create alternative routes.
 */
function buildViaCandidates(start: LatLng, end: LatLng) {
  const mid: LatLng = {
    lat: lerp(start.lat, end.lat, 0.5),
    lng: lerp(start.lng, end.lng, 0.5),
  };

  // meters to nudge (try multiple magnitudes + both directions)
  const offsetsM = [120, 220, 350, -120, -220, -350];

  return offsetsM.map((m) => ({
    lat: mid.lat + metersToLatDeg(m),
    lng: mid.lng + metersToLngDeg(m, mid.lat),
  }));
}


function routeSignature(path: LatLng[]) {
  const n = path.length;
  if (n === 0) return "";
  const samples = 10;
  const pts: string[] = [];
  for (let i = 0; i < samples; i++) {
    const idx = Math.floor((i / (samples - 1)) * (n - 1));
    const p = path[idx];
    pts.push(`${p.lat.toFixed(4)},${p.lng.toFixed(4)}`);
  }
  return pts.join("|");
}

function arePathsVerySimilar(a: LatLng[], b: LatLng[]) {
  if (!a.length || !b.length) return false;
  const samples = 10;
  let close = 0;
  for (let i = 0; i < samples; i++) {
    const ia = Math.floor((i / (samples - 1)) * (a.length - 1));
    const ib = Math.floor((i / (samples - 1)) * (b.length - 1));
    if (haversineMeters(a[ia], b[ib]) < 25) close++;
  }
  return close >= 8;
}

function offsetPath(path: LatLng[], dLat: number, dLng: number) {
  return path.map((p) => ({ lat: p.lat + dLat, lng: p.lng + dLng }));
}




/**
 * -----------------------
 * Map overlays
 * -----------------------
 */

// Draw ONE polyline (the one passed in)
function RouteLine({
  path,
  color,
  zIndex = 1,
  weight = 6,
  opacity = 0.9,
  dashed = false,
}: {
  path: LatLng[];
  color: string;
  zIndex?: number;
  weight?: number;
  opacity?: number;
  dashed?: boolean;
}) {
  const map = useMap();
  const lineRef = useRef<google.maps.Polyline | null>(null);

  useEffect(() => {
    if (!map) return;

    // cleanup old
    if (lineRef.current) {
      lineRef.current.setMap(null);
      lineRef.current = null;
    }

    if (!path.length) return;

    const line = new google.maps.Polyline({
      path,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: opacity,
      strokeWeight: weight,
      zIndex,
      ...(dashed
        ? {
            icons: [
              {
                icon: { path: "M 0,-1 0,1", strokeOpacity: 1, scale: 4 },
                offset: "0",
                repeat: "18px",
              },
            ],
          }
        : {}),
    });

    line.setMap(map);
    lineRef.current = line;

    return () => {
      line.setMap(null);
      lineRef.current = null;
    };
  }, [map, path, color, zIndex, weight, opacity, dashed]);

  return null;
}

// Faint heat circles
function HeatLayer({ points, baseRadiusM = 140 }: { points: HeatPoint[]; baseRadiusM?: number }) {
  const map = useMap();
  const circlesRef = useRef<google.maps.Circle[]>([]);

  useEffect(() => {
    if (!map) return;

    // clear old circles
    circlesRef.current.forEach((c) => c.setMap(null));
    circlesRef.current = [];

    if (!points.length) return;

    const max = Math.max(...points.map((p) => p.count));
    points.forEach((p) => {
      const intensity = max > 0 ? p.count / max : 0;
      const radius = baseRadiusM + intensity * 220;
      const fillOpacity = 0.08 + intensity * 0.22;

      const circle = new google.maps.Circle({
        map,
        center: { lat: p.lat, lng: p.lng },
        radius,
        strokeOpacity: 0,
        fillOpacity,
        fillColor: "#ef4444",
        clickable: false,
      });

      circlesRef.current.push(circle);
    });

    return () => {
      circlesRef.current.forEach((c) => c.setMap(null));
      circlesRef.current = [];
    };
  }, [map, points, baseRadiusM]);

  return null;
}

/**
 * -----------------------
 * Page
 * -----------------------
 */
export default function MapPage() {
  // Env
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID ?? ""; // optional (removes “invalid Map ID” warning)
  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

  // Map click selection
  const [start, setStart] = useState<LatLng | null>(null);
  const [end, setEnd] = useState<LatLng | null>(null);

  // Routes
  const [fastPath, setFastPath] = useState<LatLng[]>([]);
  const [safePath, setSafePath] = useState<LatLng[]>([]);

  // Safe place routing (purple line)
const [safePlacePath, setSafePlacePath] = useState<LatLng[]>([]);
const [safePlaceEtaMin, setSafePlaceEtaMin] = useState<number | null>(null);
const [safePlaceDistMi, setSafePlaceDistMi] = useState<number | null>(null);
const [safePlaceRouteErr, setSafePlaceRouteErr] = useState<string>("");

// Safe place search
const [safePlaceCategory, setSafePlaceCategory] = useState<SafePlaceCategory>("24hr_store");

  // Fastest stats
  const [fastEtaMin, setFastEtaMin] = useState<number | null>(null);
  const [fastDistMi, setFastDistMi] = useState<number | null>(null);
  const [fastSafety, setFastSafety] = useState<number | null>(null);

  // Safer stats
  const [safeEtaMin, setSafeEtaMin] = useState<number | null>(null);
  const [safeDistMi, setSafeDistMi] = useState<number | null>(null);
  const [safeSafety, setSafeSafety] = useState<number | null>(null);
  const [safeReason, setSafeReason] = useState<string>("");

  // UI state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Tradeoff summary
  const [deltaEtaMin, setDeltaEtaMin] = useState<number | null>(null);
  const [deltaDistanceMi, setDeltaDistanceMi] = useState<number | null>(null);
  const [deltaNearbyPct, setDeltaNearbyPct] = useState<number | null>(null);
  const [fastNearbyCount, setFastNearbyCount] = useState<number | null>(null);
  const [safeNearbyCount, setSafeNearbyCount] = useState<number | null>(null);

  // Preferences
  const [radiusKm, setRadiusKm] = useState(0.25);
  const [windowDays, setWindowDays] = useState(30);
  const [weightRobbery, setWeightRobbery] = useState(3);
  const [weightAssault, setWeightAssault] = useState(2);
  const [weightBattery, setWeightBattery] = useState(2);
  const [weightCsa, setWeightCsa] = useState(5);


  // Heat overlay
  const [heatPoints, setHeatPoints] = useState<HeatPoint[]>([]);
  const [showHeat, setShowHeat] = useState(true);

  // Agent route choice (experimental)
  const [agentPredById, setAgentPredById] = useState<Map<number, number>>(new Map());
  const [agentChosenId, setAgentChosenId] = useState<number | null>(null);
  const [fastestId, setFastestId] = useState<number | null>(null);

  const [safePlace, setSafePlace] = useState<SafePlace | null>(null);
  const [safePlaceErr, setSafePlaceErr] = useState<string>("");
  const [findingSafePlace, setFindingSafePlace] = useState(false);

  const findSafePlaceRef = useRef<(() => void) | null>(null);

  // agent ml confidence 
  const [agentConfidence, setAgentConfidence] = useState<number | null>(null); // 0-100

  /**
   * -----------------------
   * Live Walk Mode
   * -----------------------
   */
  const [liveActive, setLiveActive] = useState(false);
  const [trustedEmail, setTrustedEmail] = useState("");
  const [checkInSecs, setCheckInSecs] = useState(30); // demo default
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  const [lastCheckInIso, setLastCheckInIso] = useState<string | null>(null);

  const [currentPos, setCurrentPos] = useState<LatLng | null>(null);
  const [escalated, setEscalated] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);

  const [offRouteMeters, setOffRouteMeters] = useState<number | null>(null);
  const [offRoute, setOffRoute] = useState(false);

  const [demoMode, setDemoMode] = useState(false);
  const demoIdxRef = useRef(0);

  const walkTimerRef = useRef<number | null>(null);
  const geoWatchRef = useRef<number | null>(null);
  const demoTimerRef = useRef<number | null>(null);
  const offRouteSinceRef = useRef<number | null>(null);

  const liveStatus = getLiveStatus({ liveActive, escalated, secondsLeft, offRoute });

  // Default center (Chicago)
  const center = useMemo<LatLng>(() => ({ lat: 41.8781, lng: -87.6298 }), []);
  // choose a location to search around (prefer live GPS, else start, else center)
  const searchAround = currentPos ?? start ?? center;

  // Map click handler
  const onMapClick = (e: MapMouseEvent) => {
    const ll = e.detail.latLng;
    if (!ll) return;

    const clicked: LatLng = { lat: ll.lat, lng: ll.lng };
    setErrorMsg(null);

    if (!start) {
      setStart(clicked);
      return;
    }
    if (!end) {
      setEnd(clicked);
      return;
    }

    // third click resets
    resetAll();
    setStart(clicked);
  };

  // Reset everything
  function resetAll() {
    setStart(null);
    setEnd(null);

    setFastPath([]);
    setSafePath([]);

    setFastEtaMin(null);
    setFastDistMi(null);
    setFastSafety(null);

    setSafeEtaMin(null);
    setSafeDistMi(null);
    setSafeSafety(null);
    setSafeReason("");

    setDeltaEtaMin(null);
    setDeltaDistanceMi(null);
    setDeltaNearbyPct(null);
    setFastNearbyCount(null);
    setSafeNearbyCount(null);

    setHeatPoints([]);

    // live walk bits (don’t auto-stop, but clear UI-safe parts)
    setOffRouteMeters(null);
    setOffRoute(false);

    setErrorMsg(null);

    setSafePlace(null);
    setSafePlaceErr("");
    setFindingSafePlace(false);

    setSafePlacePath([]);
    setSafePlaceEtaMin(null);
    setSafePlaceDistMi(null);
    setSafePlaceRouteErr("");
    // optional:
    setSafePlace(null);
    setSafePlaceErr("");
    setFindingSafePlace(false);

  }

  /**
   * -----------------------
   * Live Walk: start/stop/check-in
   * -----------------------
   */
  async function startLiveWalk() {
    if (!safePath.length) {
      setErrorMsg("Generate a safer route first (pick start + destination).");
      return;
    }
    if (!trustedEmail.trim()) {
      setErrorMsg("Enter a trusted email for escalation alerts.");
      return;
    }

    setErrorMsg(null);

    // Create share token
    try {
      const res = await fetch(`${apiBase}/walk/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_label: "Lumiroute user" }),
      });
      const data: { token?: string } = await res.json();

      if (res.ok && data.token) {
        setShareToken(String(data.token));
      } else {
        console.error("walk/start did not return token:", data);
        setShareToken(null);
      }
    } catch (e) {
      console.error("walk/start failed:", e);
      setShareToken(null);
    }

    setLiveActive(true);
    setEscalated(false);

    const nowIso = new Date().toISOString();
    setLastCheckInIso(nowIso);
    setSecondsLeft(checkInSecs);
  }

  async function sendAgentFeedback(userSelectedId: number) {
    if (agentChosenId == null) return;

    try {
      await fetch(`${apiBase}/agent/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chosen_id: agentChosenId,
          user_selected_id: userSelectedId,
          rating: null,
          felt_safe: null,
          notes: "",
        }),
      });
    } catch (err) {
      console.error("Agent feedback failed", err);
    }
  }

  async function routeToSafePlace(placeId: string) {
  try {
    setSafePlaceRouteErr("");

    const origin = searchAround; // currentPos ?? start ?? center
    const service = new google.maps.DirectionsService();

    const res = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
      service.route(
        {
          origin,
          destination: { placeId },
          travelMode: google.maps.TravelMode.WALKING,
        },
        (result, status) => {
          if (status === "OK" && result) resolve(result);
          else reject(new Error(String(status)));
        }
      );
    });

    const r = res.routes?.[0];
    if (!r) throw new Error("No safe-place route returned.");

    const leg = r.legs?.[0];
    const durationSec = leg?.duration?.value ?? 0;
    const distanceM = leg?.distance?.value ?? 0;

    const encoded = getEncodedOverviewPolyline(r);
    const path = encoded ? decodePolyline(String(encoded)) : [];
    if (!path.length) throw new Error("Could not decode safe-place route.");

    setSafePlacePath(path);
    setSafePlaceEtaMin(secondsToMinutes(durationSec));
    setSafePlaceDistMi(Number(metersToMiles(distanceM).toFixed(2)));
  } catch (e) {
    setSafePlacePath([]);
    setSafePlaceEtaMin(null);
    setSafePlaceDistMi(null);
    setSafePlaceRouteErr(e instanceof Error ? e.message : "Failed to build route to safe place.");
  }
}

  function stopLiveWalk() {
    setLiveActive(false);
    setSecondsLeft(null);
    setEscalated(false);
    setShareToken(null);

    setOffRoute(false);
    setOffRouteMeters(null);
    offRouteSinceRef.current = null;

    // stop geolocation
    if (geoWatchRef.current !== null) {
      navigator.geolocation.clearWatch(geoWatchRef.current);
      geoWatchRef.current = null;
    }
    // stop countdown
    if (walkTimerRef.current !== null) {
      window.clearInterval(walkTimerRef.current);
      walkTimerRef.current = null;
    }
    // stop demo
    if (demoTimerRef.current !== null) {
      window.clearInterval(demoTimerRef.current);
      demoTimerRef.current = null;
    }
  }

  function checkInNow() {
    const nowIso = new Date().toISOString();
    setLastCheckInIso(nowIso);
    setSecondsLeft(checkInSecs);
    setEscalated(false);
  }

  function triggerFindSafePlace() {
  setFindingSafePlace(true);
  setSafePlaceErr("");
  setSafePlace(null);
  setSafePlace(null);
  setSafePlaceErr("");
  setFindingSafePlace(true);

  setSafePlacePath([]);
  setSafePlaceEtaMin(null);
  setSafePlaceDistMi(null);
  setSafePlaceRouteErr("");

  const fn = findSafePlaceRef.current;
  if (!fn) {
    setFindingSafePlace(false);
    setSafePlaceErr("Map not ready yet. Try again in a second.");
    return;
  }
  fn();
}

  /**
   * Live Walk: push updates to backend (so share page can see it)
   */
  useEffect(() => {
    if (!liveActive) return;
    if (!shareToken) return;

    const id = window.setInterval(() => {
      const pos = currentPos;

      fetch(`${apiBase}/walk/update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          token: shareToken,
          live_active: liveActive,
          escalated,
          off_route: offRoute,
          seconds_left: secondsLeft,
          last_checkin_iso: lastCheckInIso,
          lat: pos?.lat ?? null,
          lng: pos?.lng ?? null,
        }),
      }).catch(() => {});
    }, 2000);

    return () => window.clearInterval(id);
  }, [
    apiBase,
    liveActive,
    shareToken,
    currentPos,
    escalated,
    offRoute,
    secondsLeft,
    lastCheckInIso,
  ]);

  /**
   * Live Walk: off-route detection
   */
  useEffect(() => {
    if (!liveActive) return;
    if (!currentPos) return;
    if (!safePath.length) return;

    const d = minDistanceToPathMeters(currentPos, safePath);
    setOffRouteMeters(Math.round(d));

    const threshold = 60; // meters
    setOffRoute(d > threshold);
  }, [liveActive, currentPos, safePath]);

  /**
   * Live Walk: if off-route for too long, force escalation sooner
   */
  useEffect(() => {
    if (!liveActive) return;
    if (!currentPos) return;

    if (offRoute) {
      if (offRouteSinceRef.current === null) offRouteSinceRef.current = Date.now();
      const elapsedSec = (Date.now() - offRouteSinceRef.current) / 1000;

      // 90s off route -> force countdown to 0
      if (elapsedSec > 90 && !escalated) {
        setSecondsLeft(0);
      }
    } else {
      offRouteSinceRef.current = null;
    }
  }, [liveActive, offRoute, currentPos, escalated]);

  /**
   * Live Walk: countdown tick
   */
  useEffect(() => {
    if (!liveActive) return;

    if (walkTimerRef.current !== null) window.clearInterval(walkTimerRef.current);

    walkTimerRef.current = window.setInterval(() => {
      setSecondsLeft((prev) => (prev === null ? null : prev - 1));
    }, 1000);

    return () => {
      if (walkTimerRef.current !== null) {
        window.clearInterval(walkTimerRef.current);
        walkTimerRef.current = null;
      }
    };
  }, [liveActive]);

  /**
   * Live Walk: escalation email if timer hits 0
   */
  useEffect(() => {
    if (!liveActive) return;
    if (secondsLeft === null) return;
    if (secondsLeft > 0) return;
    if (escalated) return;

    async function escalate() {
      setEscalated(true);

      const pos = currentPos ?? safePath[0];
      const label = "Lumiroute user";

      const safeSummary = `Safer route active. Radius=${Math.round(
        radiusKm * 1000
      )}m, Window=${windowDays}d.`;

      try {
        const res = await fetch(`${apiBase}/alert/escalate`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            to_email: trustedEmail.trim(),
            user_label: label,
            reason: "Missed scheduled check-in",
            lat: pos.lat,
            lng: pos.lng,
            last_checkin_iso: lastCheckInIso ?? new Date().toISOString(),
            safe_route_summary: safeSummary,
          }),
        });

        if (!res.ok) {
          const txt = await res.text();
          console.error("Escalation failed:", txt);
        }
      } catch (e) {
        console.error("Escalation error:", e);
      }
    }

    escalate();
  }, [
    liveActive,
    secondsLeft,
    escalated,
    apiBase,
    trustedEmail,
    currentPos,
    safePath,
    radiusKm,
    windowDays,
    lastCheckInIso,
  ]);

  /**
   * Live Walk: real GPS tracking (disabled when demo mode ON)
   */
  useEffect(() => {
    if (!liveActive) return;
    if (demoMode) return;

    if (!navigator.geolocation) {
      setErrorMsg("Geolocation not supported in this browser.");
      return;
    }

    const id = navigator.geolocation.watchPosition(
      (pos) => {
        setCurrentPos({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
        });
      },
      (err) => {
        console.error(err);
        setErrorMsg("Could not access your location. Allow location permissions.");
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 10000 }
    );

    geoWatchRef.current = id;

    return () => {
      navigator.geolocation.clearWatch(id);
      geoWatchRef.current = null;
    };
  }, [liveActive, demoMode]);

  /**
   * Live Walk: demo mode (walk along safe path)
   */
  useEffect(() => {
    if (!liveActive) return;
    if (!demoMode) return;
    if (!safePath.length) return;

    if (demoTimerRef.current !== null) window.clearInterval(demoTimerRef.current);

    demoIdxRef.current = 0;
    setCurrentPos(safePath[0]);

    demoTimerRef.current = window.setInterval(() => {
      const next = Math.min(demoIdxRef.current + 1, safePath.length - 1);
      demoIdxRef.current = next;
      setCurrentPos(safePath[next]);

      if (next >= safePath.length - 1 && demoTimerRef.current !== null) {
        window.clearInterval(demoTimerRef.current);
        demoTimerRef.current = null;
      }
    }, 900);

    return () => {
      if (demoTimerRef.current !== null) {
        window.clearInterval(demoTimerRef.current);
        demoTimerRef.current = null;
      }
    };
  }, [liveActive, demoMode, safePath]);

  /**
   * -----------------------
   * ROUTE COMPARE: Google Directions -> Backend Risk Score
   * -----------------------
   */
  useEffect(() => {
    if (!start || !end) return;
    const startLL: LatLng = start;
    const endLL: LatLng = end;

    if (!googleKey) {
      setErrorMsg("Missing NEXT_PUBLIC_GOOGLE_MAPS_API_KEY");
      return;
    }

    let cancelled = false;

    async function run() {
      setLoading(true);
      setErrorMsg(null);

      try {
        // 1) Directions (alternatives with forced via waypoints)
        const service = new google.maps.DirectionsService();
        const viaPts = buildViaCandidates(startLL, endLL);

        const requests: google.maps.DirectionsRequest[] = [
          {
            origin: startLL,
            destination: endLL,
            travelMode: google.maps.TravelMode.WALKING,
            provideRouteAlternatives: true,
          },
          ...viaPts.map((via) => ({
            origin: startLL,
            destination: endLL,
            travelMode: google.maps.TravelMode.WALKING,
            provideRouteAlternatives: false,
            waypoints: [{ location: via, stopover: false }],
          })),
        ];

        const allGoogleRoutes: google.maps.DirectionsRoute[] = [];

        for (const req of requests) {
          try {
            const res = await new Promise<google.maps.DirectionsResult>((resolve, reject) => {
              service.route(req, (result, status) => {
                if (status === "OK" && result) resolve(result);
                else reject(new Error(status));
              });
            });

            allGoogleRoutes.push(...(res.routes ?? []));
          } catch {
            // ignore failures
          }
        }

        if (!allGoogleRoutes.length) {
          throw new Error("No routes returned by Google.");
        }

        const seen = new Set<string>();
        const routes: RouteAlt[] = [];

        allGoogleRoutes.forEach((r) => {
          const leg = r.legs?.[0];
          const durationSec = leg?.duration?.value ?? 0;
          const distanceM = leg?.distance?.value ?? 0;

          const encoded = getEncodedOverviewPolyline(r);
          const path = encoded ? decodePolyline(String(encoded)) : [];
          if (!path.length) return;

          const sig = routeSignature(path);
          if (seen.has(sig)) return;
          seen.add(sig);

          routes.push({
            id: routes.length,
            path,
            etaMin: secondsToMinutes(durationSec),
            distMi: Number(metersToMiles(distanceM).toFixed(2)),
          });
        });

        if (!routes.length) {
          throw new Error("No decodable routes returned by Google.");
        }

        //  Pick fastest route ONCE (fixes 'fastest' scope + TS errors)
        const fastest = routes.reduce(
          (best, cur) => (cur.etaMin < best.etaMin ? cur : best),
          routes[0]
        );
        setFastestId(fastest.id);

        // 2) Backend risk scoring
        const scoreRes = await fetch(`${apiBase}/risk/score`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            datetime_iso: new Date().toISOString(),
            routes: routes.map((r) => ({ id: r.id, path: r.path })),
            preferences: {
              radius_km: radiusKm,
              window_days: windowDays,
              weights: {
                ROBBERY: weightRobbery,
                ASSAULT: weightAssault,
                BATTERY: weightBattery,
                "CRIMINAL SEXUAL ASSAULT": weightCsa,
              },
            },
          }),
        });

        if (!scoreRes.ok) {
          const text = await scoreRes.text();
          throw new Error(`Risk scoring failed (${scoreRes.status}): ${text}`);
        }

        const data: { results: ScoredRoute[] } = await scoreRes.json();
        const scored = data.results ?? [];

        // map id -> risk + details
        const routeRiskById = new Map<number, { risk: number; details: ScoredRouteDetails }>();
        scored.forEach((s) =>
          routeRiskById.set(s.id, { risk: s.risk_score, details: s.details })
        );

        // 3) Agent chooses the safer route (ML decision)
        const agentRes = await fetch(`${apiBase}/agent/route/choose`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            datetime_iso: new Date().toISOString(),
            routes: routes.map((r) => ({ id: r.id, path: r.path })),
            preferences: {
              radius_km: radiusKm,
              window_days: windowDays,
              weights: {
                ROBBERY: weightRobbery,
                ASSAULT: weightAssault,
                BATTERY: weightBattery,
                "CRIMINAL SEXUAL ASSAULT": weightCsa,
              },
            },
            context: {
              travel_mode: "WALKING",
            },
          }),
        });

        if (!agentRes.ok) {
          const text = await agentRes.text();
          throw new Error(`Agent choose failed (${agentRes.status}): ${text}`);
        }

        const agentData: AgentChooseResponse = await agentRes.json();

        // chosen route id (ML)
        const chosenId = agentData.chosen_id;
        setAgentChosenId(chosenId);

        const preds = agentData.predictions ?? [];
        const chosenPred = preds.find((p) => p.id === chosenId)?.pred_risk;

        if (chosenPred == null || preds.length < 2) {
          setAgentConfidence(null);
        } else {
          const sorted = [...preds].sort((a, b) => a.pred_risk - b.pred_risk); // lower risk = safer
          const best = sorted[0];
          const second = sorted[1];

          // If chosen is best, margin = second-best - chosen. If not best, margin is negative.
          const margin =
            best.id === chosenId ? (second.pred_risk - chosenPred) : (best.pred_risk - chosenPred);

          // Convert margin to 0..100 with a smooth curve (tweak 0.15 if needed)
          const conf = 1 / (1 + Math.exp(-margin / 0.15));
          setAgentConfidence(Math.round(conf * 100));
        }

        // Save agent predictions (optional)
        setAgentPredById(new Map(agentData.predictions.map((p) => [p.id, p.pred_risk])));

        // Find that route in the Google routes
        const chosenRoute = routes.find((r) => r.id === chosenId) ?? routes[0];

        //  SAFEST route declared ONCE (fixes redeclare)
        let safest: RouteAlt = chosenRoute;

        // If agent chose fastest and we have another option, pick the best non-fastest by risk
        if (safest.id === fastest.id && routes.length > 1) {
          const nonFast = routes.filter((r) => r.id !== fastest.id);

          if (nonFast.length) {
            safest = nonFast.reduce((best, cur) => {
              const cr = routeRiskById.get(cur.id)?.risk ?? Number.POSITIVE_INFINITY;
              const br = routeRiskById.get(best.id)?.risk ?? Number.POSITIVE_INFINITY;
              return cr < br ? cur : best;
            }, nonFast[0]);
          }
        }

        // set route lines
        setFastPath(fastest.path);

        // If the two routes overlap heavily, apply a tiny VISUAL offset to safe path
        const overlap = arePathsVerySimilar(fastest.path, safest.path);
        const safeViz = overlap ? offsetPath(safest.path, 0.00008, 0.00008) : safest.path;
        setSafePath(safeViz);

        // set stats
        setFastEtaMin(fastest.etaMin);
        setFastDistMi(fastest.distMi);

        setSafeEtaMin(safest.etaMin);
        setSafeDistMi(safest.distMi);

        const fastRisk = routeRiskById.get(fastest.id)?.risk ?? 0;
        const safeRisk = routeRiskById.get(safest.id)?.risk ?? 0;

        setFastSafety(riskToSafety(fastRisk));
        setSafeSafety(riskToSafety(safeRisk));

        // tradeoff summary
        const fastDetails = routeRiskById.get(fastest.id)?.details;
        const safeDetails = routeRiskById.get(safest.id)?.details;

        const fastNearby = fastDetails?.nearby_count ?? 0;
        const safeNearby = safeDetails?.nearby_count ?? 0;

        setFastNearbyCount(fastNearby);
        setSafeNearbyCount(safeNearby);

        setDeltaEtaMin(safest.etaMin - fastest.etaMin);
        setDeltaDistanceMi(Number((safest.distMi - fastest.distMi).toFixed(2)));

        const pct =
          fastNearby > 0 ? Math.round(((fastNearby - safeNearby) / fastNearby) * 100) : null;
        setDeltaNearbyPct(pct);

        // “Why this route” (2–3 sentences)
        const d = safeDetails;
        const radiusM = d ? Math.round(d.radius_km * 1000) : Math.round(radiusKm * 1000);
        const wd = d?.window_days ?? windowDays;

        const top = d?.top_categories ?? [];
        const topText =
          top.length > 0
            ? top
                .slice(0, 2)
                .map((x) => `${x.category.toLowerCase()} (${x.count})`)
                .join(" and ")
            : "lower incident density";

        const complianceAddOn = ` Nearby scan: top categories were ${topText} within ~${radiusM}m over the last ${wd} days.`;
        setSafeReason((agentData.explanation || "") + complianceAddOn);

        if (!cancelled) setLoading(false);
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        if (!cancelled) {
          setErrorMsg(msg);
          setLoading(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, [
    start,
    end,
    apiBase,
    googleKey,
    radiusKm,
    windowDays,
    weightRobbery,
    weightAssault,
    weightBattery,
    weightCsa,
  ]);

  /**
   * -----------------------
   * Heat overlay fetch (bbox around start/end)
   * -----------------------
   */
  useEffect(() => {
    if (!start || !end) return;
    const startLL: LatLng = start;
    const endLL: LatLng = end;

    let cancelled = false;

    async function loadHeat() {
      const pad = 0.01;
      const min_lat = Math.min(startLL.lat, endLL.lat) - pad;
      const max_lat = Math.max(startLL.lat, endLL.lat) + pad;
      const min_lng = Math.min(startLL.lng, endLL.lng) - pad;
      const max_lng = Math.max(startLL.lng, endLL.lng) + pad;

      try {
        const res = await fetch(`${apiBase}/risk/heat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            datetime_iso: new Date().toISOString(),
            min_lat,
            min_lng,
            max_lat,
            max_lng,
            window_days: windowDays,
            cell_km: 0.25,
          }),
        });

        if (!res.ok) {
          if (!cancelled) setHeatPoints([]);
          return;
        }

        const data: { points: HeatPoint[] } = await res.json();
        if (!cancelled) setHeatPoints(data.points ?? []);
      } catch {
        if (!cancelled) setHeatPoints([]);
      }
    }

    loadHeat();

    return () => {
      cancelled = true;
    };
  }, [start, end, apiBase, windowDays]);

  /**
   * -----------------------
   * Render
   * -----------------------
   */
  return (
    <div className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold">Lumiroute</h1>
      <p className="mt-1 text-sm text-gray-600">
        Click once to set <b>Start</b>, click again to set <b>Destination</b>. Click a third time to
        start over.
      </p>

      {/* Preferences */}
      <div className="mt-4 rounded-2xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="font-semibold">Safety Preferences</h3>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showHeat}
              onChange={(e) => setShowHeat(e.target.checked)}
            />
            Show heat overlay
          </label>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium">Radius</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
            >
              <option value={0.15}>150m</option>
              <option value={0.25}>250m</option>
              <option value={0.4}>400m</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Time window</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>

          <div>
            <label className="text-sm font-medium">Category emphasis</label>
            <div className="mt-2 space-y-2 text-sm">
              <div className="flex items-center justify-between">
                <span>Robbery</span>
                <input
                  className="w-20 rounded-lg border px-2 py-1"
                  type="number"
                  min={0}
                  max={10}
                  value={weightRobbery}
                  onChange={(e) => setWeightRobbery(Number(e.target.value))}
                />
              </div>

              <div className="flex items-center justify-between">
                <span>Assault</span>
                <input
                  className="w-20 rounded-lg border px-2 py-1"
                  type="number"
                  min={0}
                  max={10}
                  value={weightAssault}
                  onChange={(e) => setWeightAssault(Number(e.target.value))}
                />
              </div>

              <div className="flex items-center justify-between">
                <span>Battery</span>
                <input
                  className="w-20 rounded-lg border px-2 py-1"
                  type="number"
                  min={0}
                  max={10}
                  value={weightBattery}
                  onChange={(e) => setWeightBattery(Number(e.target.value))}
                />
              </div>

              <div className="flex items-center justify-between">
                <span>Criminal Sexual Assault</span>
                <input
                  className="w-20 rounded-lg border px-2 py-1"
                  type="number"
                  min={0}
                  max={10}
                  value={weightCsa}
                  onChange={(e) => setWeightCsa(Number(e.target.value))}
                />
              </div>
            </div>
          </div>
        </div>

        <p className="mt-3 text-xs text-gray-500">
          Higher numbers make Lumiroute avoid that category more aggressively.
        </p>
      </div>

      {/* Map */}
      <div className="mt-4 overflow-hidden rounded-2xl border">
        <APIProvider apiKey={googleKey} libraries={["places"]}>
          <div className="h-[520px] w-full">
            <GMap
              defaultCenter={center}
              defaultZoom={12}
              gestureHandling="greedy"
              disableDefaultUI={false}
              onClick={onMapClick}
              mapId={mapId || undefined}
            >
              {start && <Marker position={start} />}
              {end && <Marker position={end} />}

              {/* Floating blue "You" dot */}
              {currentPos && liveActive && (
                <Marker
                  position={currentPos}
                  icon={{
                    path: google.maps.SymbolPath.CIRCLE,
                    scale: 7,
                    fillColor: "#2563eb",
                    fillOpacity: 1,
                    strokeColor: "white",
                    strokeWeight: 2,
                  }}
                  zIndex={9999}
                />
              )}

              {/* Heat overlay */}
              {showHeat && heatPoints.length > 0 && <HeatLayer points={heatPoints} />}

              {/* Routes */}
              {fastPath.length > 0 && (
                  <RouteLine path={fastPath} color="#2563eb" dashed zIndex={10} weight={5} opacity={0.95} />
              )}
              {safePath.length > 0 && (
                  <RouteLine path={safePath} color="#16a34a" zIndex={20} weight={7} opacity={0.95} />
              )}

              {safePlacePath.length > 0 && (
                  <RouteLine path={safePlacePath} color="#a855f7" zIndex={30} weight={7} opacity={0.95} />
              )}
              <NearestSafePlaceController
                location={searchAround}
                category={safePlaceCategory} 
                exposeFindFn={(fn) => {
                  findSafePlaceRef.current = () => {
                    // wrap so we can stop loading when results arrive
                    fn?.();
                  };
                }}
                onError={(msg) => {
                  setFindingSafePlace(false);
                  setSafePlaceErr(msg);
                }}
                onResult={(p) => {
                  setFindingSafePlace(false);
                  setSafePlace(p);
                  if (p) routeToSafePlace(p.placeId);
                }}
              />

              {safePlace && (
                <Marker
                  position={safePlace.location}
                  title={safePlace.name}
                  zIndex={9998}
                />
              )}
            </GMap>
          </div>
        </APIProvider>
      </div>

      {/* Live Walk Mode */}
      <div className="mt-4 rounded-2xl border p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <h3 className="font-semibold">Live Walk Mode</h3>
            <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${liveStatus.cls}`}>
              {liveStatus.label}
            </div>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => setDemoMode(e.target.checked)}
            />
            Demo mode
          </label>
        </div>

        <div>
          <label className="text-sm font-medium">Safe place type</label>
          <select
            className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
            value={safePlaceCategory}
            onChange={(e) => setSafePlaceCategory(e.target.value as SafePlaceCategory)}
          >
            <option value="24hr_store">24hr store</option>
            <option value="police">Police station</option>
            <option value="hospital">Hospital</option>
          </select>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-3">
          <button
            type="button"
            onClick={triggerFindSafePlace}
            className="rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-gray-50 disabled:opacity-50"
            disabled={findingSafePlace}
          >
            {findingSafePlace ? "Searching…" : "Find nearest open safe place"}
          </button>
        </div>

        {safePlaceErr ? (
          <p className="mt-2 text-sm text-red-600">{safePlaceErr}</p>
        ) : null}

        {safePlace ? (
          <div className="mt-3 rounded-2xl border bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold">{safePlace.name}</p>
                {safePlace.address ? <p className="mt-1 text-xs text-gray-600">{safePlace.address}</p> : null}
                {safePlace.rating ? (
                  <p className="mt-1 text-xs text-gray-600">
                    Rating: {safePlace.rating} {safePlace.userRatingsTotal ? `(${safePlace.userRatingsTotal})` : ""}
                  </p>
                ) : null}
              </div>

              <a
                className="rounded-xl bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-gray-800"
                href={`https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(
                  safePlace.placeId
                )}&travelmode=walking`}
                target="_blank"
                rel="noreferrer"
              >
                Directions
              </a>
            </div>
          </div>
        ) : null}

        {shareToken ? (
          <div className="mt-2 text-sm">
            <span className="text-gray-600">Share link: </span>
            <a
              className="font-semibold underline"
              href={`/share/${encodeURIComponent(shareToken)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open live safety view
            </a>
          </div>
        ) : null}

        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-sm font-medium">Trusted email</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="trustedfriend@email.com"
              value={trustedEmail}
              onChange={(e) => setTrustedEmail(e.target.value)}
            />
          </div>

          <div>
            <label className="text-sm font-medium">Check-in interval</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              value={checkInSecs}
              onChange={(e) => setCheckInSecs(Number(e.target.value))}
            >
              <option value={30}>Every 30 sec (demo)</option>
              <option value={60}>Every 1 min</option>
              <option value={180}>Every 3 min</option>
              <option value={300}>Every 5 min</option>
              <option value={600}>Every 10 min</option>
            </select>
          </div>

          <div className="flex items-end gap-2">
            {!liveActive ? (
              <button
                type="button"
                onClick={startLiveWalk}
                className="w-full rounded-xl bg-black px-3 py-2 text-sm font-semibold text-white hover:bg-gray-800"
              >
                Start Safe Walk
              </button>
            ) : (
              <button
                type="button"
                onClick={stopLiveWalk}
                className="w-full rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-gray-50"
              >
                Stop
              </button>
            )}

            <button
              type="button"
              onClick={checkInNow}
              disabled={!liveActive}
              className="w-full rounded-xl border px-3 py-2 text-sm font-semibold disabled:opacity-50 hover:bg-gray-50"
            >
              I’m OK
            </button>
          </div>
        </div>

        <div className="mt-3 text-sm text-gray-700">
          <p>
            Status:{" "}
            <b>{!liveActive ? "Not active" : escalated ? "Escalated (email sent/attempted)" : "Active"}</b>
          </p>

          <p>
            Next check-in: <b>{secondsLeft === null ? "—" : `${Math.max(0, secondsLeft)}s`}</b>
          </p>

          {offRouteMeters !== null && liveActive ? (
            <p className={offRoute ? "text-red-600" : ""}>
              Off-route distance: <b>{offRouteMeters}m</b> {offRoute ? "(off route)" : "(on route)"}
            </p>
          ) : null}
        </div>
      </div>

      {/* Status + reset */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          {loading ? "Scoring routes…" : null}
          {!loading && errorMsg ? <span className="text-red-600">{errorMsg}</span> : null}
        </div>

        <button onClick={resetAll} className="rounded-xl border px-3 py-2 text-sm hover:bg-gray-50">
          Reset
        </button>
      </div>

      {/* Route cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-2xl border p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Fastest Route</h2>
            <span className="text-xs text-gray-500">Blue</span>
          </div>

          <div className="mt-3 space-y-1 text-sm text-gray-700">
            <p>
              ETA: <b>{fastEtaMin ?? "—"}</b> min
            </p>
            <p>
              Distance: <b>{fastDistMi ?? "—"}</b> mi
            </p>
            <p>
              Safety score: <b>{fastSafety ?? "—"}</b> / 100
            </p>
          </div>
        </div>

        {agentChosenId !== null && fastestId !== null && agentChosenId !== fastestId && (
          <button
            onClick={() => sendAgentFeedback(fastestId)}
            className="mt-3 w-full rounded-xl border px-3 py-2 text-sm font-semibold hover:bg-gray-50"
          >
            Choose Fastest Instead
          </button>
        )}

        <div className="rounded-2xl border p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Safer Route</h2>
            <span className="text-xs text-gray-500">Green</span>
          </div>

          <div className="mt-3 space-y-1 text-sm text-gray-700">
            <p>
              ETA: <b>{safeEtaMin ?? "—"}</b> min
            </p>
            <p>
              Distance: <b>{safeDistMi ?? "—"}</b> mi
            </p>
            <p>
              Safety score: <b>{safeSafety ?? "—"}</b> / 100
            </p>
            {agentConfidence !== null ? (
              <p>
                ML confidence: <b>{agentConfidence}%</b>
              </p>
            ) : null}

            <div className="mt-3 rounded-xl bg-gray-50 p-3 text-sm text-gray-700">
              <p className="font-medium">Why this route</p>
              <p className="mt-1 text-sm">{safeReason || "Pick a start and end point to see an explanation."}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tradeoff summary */}
      <div className="mt-6 rounded-2xl border bg-white p-4 shadow-sm">
        <h3 className="text-lg font-semibold">Tradeoff Summary</h3>

        {deltaEtaMin === null || deltaDistanceMi === null ? (
          <p className="mt-2 text-sm text-gray-500">Select start and destination to compare routes.</p>
        ) : (
          <div className="mt-3 space-y-2 text-sm text-gray-700">
            <p>
              Safer route is <b>{deltaEtaMin >= 0 ? `+${deltaEtaMin}` : deltaEtaMin}</b> minutes and{" "}
              <b>{deltaDistanceMi >= 0 ? `+${deltaDistanceMi}` : deltaDistanceMi}</b> miles compared to fastest.
            </p>

            <p>
              Nearby incidents: <b>{safeNearbyCount ?? "—"}</b> (Safer) vs <b>{fastNearbyCount ?? "—"}</b> (Fastest)
              {deltaNearbyPct !== null ? (
                <>
                  {" "}
                  → <b>{deltaNearbyPct}% fewer</b> near-route reports.
                </>
              ) : null}
            </p>

            <p className="text-xs text-gray-500">“Nearby” uses your selected radius and time window.</p>
          </div>
        )}
      </div>
    </div>
  );
}

