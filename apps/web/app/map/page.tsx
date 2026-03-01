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

type RouteMeta = {
  samplepoints?: LatLng[];
  transitstops?: LatLng[];
};

type RouteAlt = {
  id: number;
  path: LatLng[];
  etaMin: number;
  distMi: number;
  meta?: RouteMeta;
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
  const SCALE = 75; // try 50–150 depending on your risk magnitudes
  const safety = 100 * Math.exp(-risk / SCALE);
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

function samplePath(path: LatLng[], everyN: number) {
  if (path.length <= everyN) return path;
  const out: LatLng[] = [];
  for (let i = 0; i < path.length; i += everyN) out.push(path[i]);
  // ensure last point included
  if (out[out.length - 1] !== path[path.length - 1]) out.push(path[path.length - 1]);
  return out;
}

function extractTransitStops(route: google.maps.DirectionsRoute): LatLng[] {
  const leg = route.legs?.[0];
  if (!leg?.steps) return [];

  const stops: LatLng[] = [];
  for (const step of leg.steps) {
    // In Google Directions, transit steps have transit_details
    const t = (step as google.maps.DirectionsStep).transit;
    if (!t) continue;

    const dep = t.departure_stop?.location;
    const arr = t.arrival_stop?.location;
    if (dep?.lat && dep?.lng) stops.push({ lat: dep.lat(), lng: dep.lng() });
    if (arr?.lat && arr?.lng) stops.push({ lat: arr.lat(), lng: arr.lng() });
  }

  // de-dupe
  const key = (p: LatLng) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`;
  return Array.from(new Map(stops.map((s) => [key(s), s])).values());
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
  animateMs = 450,
}: {
  path: LatLng[];
  color: string;
  zIndex?: number;
  weight?: number;
  opacity?: number;
  dashed?: boolean;
  animateMs?: number;
}) {
  const map = useMap();
  const currentRef = useRef<google.maps.Polyline | null>(null);
  const prevRef = useRef<google.maps.Polyline | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (!map) return;

    // Move current -> prev (so we can fade it out)
    if (currentRef.current) {
      if (prevRef.current) prevRef.current.setMap(null);
      prevRef.current = currentRef.current;
      prevRef.current.setOptions({ zIndex: zIndex - 1 });
      currentRef.current = null;
    }

    // If no path, just clear
    if (!path.length) {
      if (prevRef.current) {
        prevRef.current.setMap(null);
        prevRef.current = null;
      }
      return;
    }

    const baseOptions: google.maps.PolylineOptions = {
      path,
      geodesic: true,
      strokeColor: color,
      strokeOpacity: 0,
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
    };

    const line = new google.maps.Polyline(baseOptions);
    line.setMap(map);
    currentRef.current = line;

    // Animate crossfade
    const start = performance.now();

    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / animateMs);

      // fade in current
      if (currentRef.current) currentRef.current.setOptions({ strokeOpacity: opacity * p });

      // fade out previous
      if (prevRef.current) prevRef.current.setOptions({ strokeOpacity: opacity * (1 - p) });

      if (p < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        // remove previous once animation completes
        if (prevRef.current) {
          prevRef.current.setMap(null);
          prevRef.current = null;
        }
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [map, path, color, zIndex, weight, opacity, dashed, animateMs]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      if (currentRef.current) currentRef.current.setMap(null);
      if (prevRef.current) prevRef.current.setMap(null);
      currentRef.current = null;
      prevRef.current = null;
    };
  }, []);

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

  // Agent route choice (experimental)
  type TravelMode = "WALKING" | "TRANSIT" | "DRIVING" | "BICYCLING";
  const [travelMode, setTravelMode] = useState<TravelMode>("WALKING");


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
        
        const service = new google.maps.DirectionsService();
        const viaPts = buildViaCandidates(startLL, endLL);

        const mode = google.maps.TravelMode[travelMode];

const requests: google.maps.DirectionsRequest[] =
  mode === google.maps.TravelMode.TRANSIT
    ? [
        {
          origin: startLL,
          destination: endLL,
          travelMode: mode,
          provideRouteAlternatives: true,
          transitOptions: {
            departureTime: new Date(),
          },
        },
      ]
    : [
        {
          origin: startLL,
          destination: endLL,
          travelMode: mode,
          provideRouteAlternatives: true,
        },
        ...viaPts.map((via) => ({
          origin: startLL,
          destination: endLL,
          travelMode: mode,
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

          const sample_points = samplePath(path, 12); // tune: smaller = more precise, bigger = faster
          const transit_stops =
            travelMode === "TRANSIT" ? extractTransitStops(r) : [];

          const transitStops: LatLng[] = [];

          if (travelMode === "TRANSIT") {
            const leg = r.legs?.[0];
            const steps = leg?.steps ?? [];
            for (const s of steps) {
              const t = (s as google.maps.DirectionsStep).transit;
              const dep = t?.departure_stop?.location;
              const arr = t?.arrival_stop?.location;

              if (dep?.lat && dep?.lng) transitStops.push({ lat: dep.lat(), lng: dep.lng() });
              if (arr?.lat && arr?.lng) transitStops.push({ lat: arr.lat(), lng: arr.lng() });
            }
          }

          routes.push({
            id: routes.length,
            path,
            etaMin: secondsToMinutes(durationSec),
            distMi: Number(metersToMiles(distanceM).toFixed(2)),
            meta: transitStops.length ? { transitstops: transitStops } : undefined,
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
          routes: routes.map((r) => ({
            id: r.id,
            path: r.path,
            meta: r.meta?.transitstops
              ? { transitstops: r.meta.transitstops }
              : undefined,
          })),
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
            travel_mode: travelMode,
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
          routes: routes.map((r) => ({
            id: r.id,
            path: r.path,
            meta: r.meta?.transitstops
              ? { transitstops: r.meta.transitstops }
              : undefined,
          })),
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
            travel_mode: travelMode,
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
          const sorted = [...preds].sort((a, b) => a.pred_risk - b.pred_risk);
          const best = sorted[0];
          const second = sorted[1];

          const gap = second.pred_risk - best.pred_risk;          // how separated top 2 are
          const scale = Math.max(0.001, best.pred_risk);          // avoid divide-by-zero
          const gapPct = gap / scale;                             // relative separation

          // Map: 0% gap => 50%, 20% gap => 90% (tweak)
          const conf = 50 + Math.min(40, gapPct * 200);           // 0.2 * 200 = 40
          setAgentConfidence(Math.round(conf));
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
            travelMode,
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
  <div className="min-h-screen bg-gradient-to-br from-pink-50 via-violet-50 to-sky-50">
    <div className="mx-auto max-w-5xl p-6">
      {/* Header (Municipal portal style) */}
      <div className="mb-6 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold tracking-wide text-slate-700">
              CITY DASHBOARD • PEDESTRIAN ROUTING
            </div>

            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-slate-950">
              <span className="bg-gradient-to-r from-slate-900 via-violet-700 to-sky-600 bg-clip-text text-transparent">
                LUMIROUTE
              </span>
            </h1>

            <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
              Select a start and destination point to compare walking routes using incident-aware scoring and a
              learning-based recommendation model.
            </p>
          </div>

          <div className="flex gap-3">
            <button
              onClick={resetAll}
              className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </div>

        {/* Quick metrics strip */}
        <div className="mt-5 grid grid-cols-1 gap-3 md:grid-cols-4">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500">MODE</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{{
              WALKING: "Walking",
              TRANSIT: "Transit",
              DRIVING: "Driving",
              BICYCLING: "Bicycling",
            }[travelMode] ?? travelMode}
            </p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500">WINDOW</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{windowDays} days</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500">RADIUS</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">{Math.round(radiusKm * 1000)}m</p>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3">
            <p className="text-[11px] font-semibold tracking-wide text-slate-500">MODEL CONFIDENCE</p>
            <p className="mt-1 text-sm font-semibold text-slate-900">
              {agentConfidence === null ? "—" : `${agentConfidence}%`}
            </p>
          </div>
        </div>
      </div>

      {/* Safety Preferences */}
      <div className="rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-semibold text-black">Safety Preferences</h2>

          <label className="flex items-center gap-2 text-sm text-black">
            <input
              type="checkbox"
              checked={showHeat}
              onChange={(e) => setShowHeat(e.target.checked)}
              className="h-4 w-4 accent-violet-600"
            />
            Show heat overlay
          </label>
        </div>

        {/* Travel Mode */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-black">Travel mode</label>

          <div className="mt-2 flex flex-wrap gap-2">
            {[
              { label: "Walking", value: "WALKING" },
              { label: "Transit", value: "TRANSIT" },
              { label: "Driving", value: "DRIVING" },
              { label: "Bicycling", value: "BICYCLING" },
            ].map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => setTravelMode(mode.value as TravelMode)}
                className={`rounded-2xl border px-4 py-2 text-sm font-semibold transition ${
                  travelMode === mode.value
                    ? "border-violet-300 bg-violet-100 text-violet-800"
                    : "border-slate-200 bg-white text-black hover:bg-slate-50"
                }`}
              >
                {mode.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Radius */}
          <div>
            <label className="block text-sm font-medium text-black">Radius</label>
            <select
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
              value={radiusKm}
              onChange={(e) => setRadiusKm(Number(e.target.value))}
            >
              <option value={0.15}>150m</option>
              <option value={0.25}>250m</option>
              <option value={0.4}>400m</option>
            </select>
          </div>

          {/* Time Window */}
          <div>
            <label className="block text-sm font-medium text-black">Time window</label>
            <select
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
              value={windowDays}
              onChange={(e) => setWindowDays(Number(e.target.value))}
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
            </select>
          </div>

          {/* Category Weights */}
          <div>
            <label className="block text-sm font-medium text-black">Category weights</label>

            <div className="mt-3 space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-black">Robbery</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={weightRobbery}
                  onChange={(e) => setWeightRobbery(Number(e.target.value))}
                  className="w-24 rounded-2xl border border-slate-200 bg-white px-2 py-1 text-sm text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-black">Assault</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={weightAssault}
                  onChange={(e) => setWeightAssault(Number(e.target.value))}
                  className="w-24 rounded-2xl border border-slate-200 bg-white px-2 py-1 text-sm text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-black">Battery</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={weightBattery}
                  onChange={(e) => setWeightBattery(Number(e.target.value))}
                  className="w-24 rounded-2xl border border-slate-200 bg-white px-2 py-1 text-sm text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-black">Criminal Sexual Assault</span>
                <input
                  type="number"
                  min={0}
                  max={10}
                  value={weightCsa}
                  onChange={(e) => setWeightCsa(Number(e.target.value))}
                  className="w-24 rounded-2xl border border-slate-200 bg-white px-2 py-1 text-sm text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
                />
              </div>
            </div>
          </div>
        </div>

        <p className="mt-5 text-xs text-slate-600">
          Higher values increase how strongly routes avoid incidents in that category.
        </p>
      </div>

      {/* Map */}
      <div className="mt-4 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <APIProvider apiKey={googleKey} libraries={["places"]}>
          <div className="relative h-[580px] w-full">
            {/* Route Legend (portal style) */}
            <div className="absolute left-4 top-4 z-50 rounded-2xl border border-slate-200 bg-white/90 p-3 text-xs text-slate-800 shadow-sm backdrop-blur">
              <div className="flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-blue-600" />
                Fastest
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-green-600" />
                Safer
              </div>
              <div className="mt-1 flex items-center gap-2">
                <span className="h-3 w-3 rounded-full bg-purple-500" />
                Safe place
              </div>
            </div>

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

              {/* Floating "You" dot */}
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

              {safePlace && <Marker position={safePlace.location} title={safePlace.name} zIndex={9998} />}
            </GMap>
          </div>
        </APIProvider>
      </div>

      {/* Live Walk Mode (portal standard) */}
      <div className="mt-4 rounded-3xl border border-slate-200 bg-white/80 p-6 shadow-sm backdrop-blur">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-base font-semibold text-black">Live Walk Mode</h2>
            <span className={`rounded-full border px-3 py-1 text-xs font-semibold ${liveStatus.cls}`}>
              {liveStatus.label}
            </span>
          </div>

          <label className="flex items-center gap-2 text-sm text-black">
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => setDemoMode(e.target.checked)}
              className="h-4 w-4 accent-violet-600"
            />
            Demo mode
          </label>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-3">
          {/* Safe place type */}
          <div>
            <label className="block text-sm font-medium text-black">Safe place type</label>
            <select
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
              value={safePlaceCategory}
              onChange={(e) => setSafePlaceCategory(e.target.value as SafePlaceCategory)}
            >
              <option value="24hr_store">24hr store</option>
              <option value="police">Police station</option>
              <option value="hospital">Hospital</option>
            </select>

            <button
              type="button"
              onClick={triggerFindSafePlace}
              disabled={findingSafePlace}
              className="mt-3 inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800 disabled:opacity-50"
            >
              {findingSafePlace ? "Searching…" : "Find nearest open safe place"}
            </button>

            {safePlaceErr ? <p className="mt-2 text-sm text-red-600">{safePlaceErr}</p> : null}
          </div>

          {/* Trusted email */}
          <div>
            <label className="block text-sm font-medium text-black">Trusted email</label>
            <input
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-black shadow-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-violet-200"
              placeholder="trustedfriend@email.com"
              value={trustedEmail}
              onChange={(e) => setTrustedEmail(e.target.value)}
            />
            <p className="mt-2 text-xs text-slate-600">
              If you go off-route or miss a check-in, we’ll attempt to notify this contact.
            </p>
          </div>

          {/* Check-in + controls */}
          <div>
            <label className="block text-sm font-medium text-black">Check-in interval</label>
            <select
              className="mt-2 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm text-black shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-200"
              value={checkInSecs}
              onChange={(e) => setCheckInSecs(Number(e.target.value))}
            >
              <option value={30}>Every 30 sec (demo)</option>
              <option value={60}>Every 1 min</option>
              <option value={180}>Every 3 min</option>
              <option value={300}>Every 5 min</option>
              <option value={600}>Every 10 min</option>
            </select>

            <div className="mt-3 grid grid-cols-2 gap-3">
              {!liveActive ? (
                <button
                  type="button"
                  onClick={startLiveWalk}
                  className="rounded-2xl bg-gradient-to-r from-violet-600 to-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                >
                  Start
                </button>
              ) : (
                <button
                  type="button"
                  onClick={stopLiveWalk}
                  className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-black shadow-sm hover:bg-slate-50"
                >
                  Stop
                </button>
              )}

              <button
                type="button"
                onClick={checkInNow}
                disabled={!liveActive}
                className="rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-black shadow-sm hover:bg-slate-50 disabled:opacity-50"
              >
                I’m OK
              </button>
            </div>

            <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-800">
              <div className="flex items-center justify-between">
                <span className="text-slate-600">Status</span>
                <span className="font-semibold text-black">
                  {!liveActive ? "Not active" : escalated ? "Escalated" : "Active"}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between">
                <span className="text-slate-600">Next check-in</span>
                <span className="font-semibold text-black">
                  {secondsLeft === null ? "—" : `${Math.max(0, secondsLeft)}s`}
                </span>
              </div>

              {offRouteMeters !== null && liveActive ? (
                <div className="mt-2 flex items-center justify-between">
                  <span className="text-slate-600">Off-route distance</span>
                  <span className={`font-semibold ${offRoute ? "text-red-600" : "text-black"}`}>
                    {offRouteMeters}m {offRoute ? "(off route)" : "(on route)"}
                  </span>
                </div>
              ) : null}
            </div>
          </div>
        </div>

        {/* Safe place result */}
        {safePlace ? (
          <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-sm font-semibold text-black">{safePlace.name}</p>
                {safePlace.address ? <p className="mt-1 text-sm text-slate-700">{safePlace.address}</p> : null}
                {typeof safePlace.rating === "number" ? (
                  <p className="mt-1 text-xs text-slate-600">
                    Rating: {safePlace.rating}
                    {typeof safePlace.userRatingsTotal === "number" ? ` (${safePlace.userRatingsTotal})` : ""}
                  </p>
                ) : null}
              </div>

              <a
                className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                href={`https://www.google.com/maps/dir/?api=1&destination_place_id=${encodeURIComponent(
                  safePlace.placeId
                )}&travelmode=walking`}
                target="_blank"
                rel="noreferrer"
              >
                Open directions
              </a>
            </div>
          </div>
        ) : null}

        {/* Share link */}
        {shareToken ? (
          <div className="mt-4 text-sm text-slate-700">
            <span className="text-slate-600">Share link: </span>
            <a
              className="font-semibold text-violet-700 underline decoration-violet-300 underline-offset-4 hover:text-violet-800"
              href={`/share/${encodeURIComponent(shareToken)}`}
              target="_blank"
              rel="noreferrer"
            >
              Open live safety view
            </a>
          </div>
        ) : null}
      </div>

      {/* Status (loading/errors) */}
      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="text-sm text-slate-700">
          {loading ? "Scoring routes…" : null}
          {!loading && errorMsg ? <span className="text-red-600">{errorMsg}</span> : null}
        </div>
      </div>

      {/* Route cards */}
      <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Fastest */}
        <div className="rounded-3xl border border-blue-200 bg-white/85 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-950">Fastest Route</h2>
            <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
              Fastest
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">ETA</span>
              <span className="font-semibold text-slate-950">{fastEtaMin ?? "—"} min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Distance</span>
              <span className="font-semibold text-slate-950">{fastDistMi ?? "—"} mi</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Safety score</span>
              <span className="font-semibold text-slate-950">{fastSafety ?? "—"} / 100</span>
            </div>
          </div>

          {agentChosenId !== null && fastestId !== null && agentChosenId !== fastestId && (
            <button
              onClick={() => sendAgentFeedback(fastestId)}
              className="mt-5 w-full rounded-2xl border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 shadow-sm hover:bg-blue-100"
            >
              Choose Fastest Instead
            </button>
          )}
        </div>

        {/* Safer */}
        <div className="rounded-3xl border border-green-200 bg-white/85 p-6 shadow-sm backdrop-blur">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-950">Safer Route</h2>
            <span className="rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700">
              Recommended
            </span>
          </div>

          <div className="mt-4 space-y-2 text-sm text-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-slate-600">ETA</span>
              <span className="font-semibold text-slate-950">{safeEtaMin ?? "—"} min</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Distance</span>
              <span className="font-semibold text-slate-950">{safeDistMi ?? "—"} mi</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-600">Safety score</span>
              <span className="font-semibold text-slate-950">{safeSafety ?? "—"} / 100</span>
            </div>
          </div>

          {/* ML confidence bar */}
          {agentConfidence !== null ? (
            <div className="mt-4">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span>Model confidence</span>
                <span className="font-semibold text-slate-950">{agentConfidence}%</span>
              </div>
              <div className="mt-2 h-2 w-full rounded-full bg-green-100">
                <div
                  className="h-2 rounded-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
                  style={{ width: `${agentConfidence}%` }}
                />
              </div>
            </div>
          ) : null}

          {/* Why this route */}
          <div className="mt-5 rounded-2xl border border-green-100 bg-white p-4 text-sm text-slate-800">
            <p className="font-semibold text-slate-950">Why this route</p>
            <p className="mt-1 text-sm text-slate-700">
              {safeReason || "Pick a start and end point to see an explanation."}
            </p>
          </div>
        </div>
      </div>

      {/* Tradeoff summary (full width) */}
      <div className="mt-6 rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold text-slate-950">Tradeoff Summary</h3>
        </div>

        {deltaEtaMin === null || deltaDistanceMi === null ? (
          <p className="mt-2 text-sm text-slate-600">Select start and destination to compare routes.</p>
        ) : (
          <div className="mt-4 space-y-3 text-sm text-slate-800">
            <p>
              The safer route is{" "}
              <span className="font-semibold text-slate-950">
                {deltaEtaMin >= 0 ? `+${deltaEtaMin}` : deltaEtaMin} minutes
              </span>{" "}
              and{" "}
              <span className="font-semibold text-slate-950">
                {deltaDistanceMi >= 0 ? `+${deltaDistanceMi}` : deltaDistanceMi} miles
              </span>{" "}
              compared to the fastest route.
            </p>

            <p>
              Nearby incidents:{" "}
              <span className="font-semibold text-slate-950">{safeNearbyCount ?? "—"}</span> (Safer) vs{" "}
              <span className="font-semibold text-slate-950">{fastNearbyCount ?? "—"}</span> (Fastest)
              {deltaNearbyPct !== null ? (
                <>
                  {" "}
                  → <span className="font-semibold text-slate-950">{deltaNearbyPct}% fewer</span> near-route reports.
                </>
              ) : null}
            </p>

            <p className="text-xs text-slate-500">
              “Nearby” is computed using your selected radius and time window.
            </p>
          </div>
        )}
      </div>
    </div>
  </div>
);
}