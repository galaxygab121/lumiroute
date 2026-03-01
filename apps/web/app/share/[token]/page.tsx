"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { APIProvider, Map as GMap, AdvancedMarker } from "@vis.gl/react-google-maps";

type WalkState = {
  token: string;
  user_label: string;
  live_active: boolean;
  escalated: boolean;
  off_route: boolean;
  seconds_left: number | null;
  last_checkin_iso: string | null;
  lat: number | null;
  lng: number | null;
  updated_at_iso: string;
};

function formatCountdown(secs: number | null): string {
  if (secs === null) return "—";
  const s = Math.max(0, secs);
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  return mm > 0 ? `${mm}:${String(ss).padStart(2, "0")}` : `${ss}s`;
}

function getBadge(state: WalkState | null) {
  if (!state || !state.live_active)
    return { label: "Not active", cls: "bg-gray-100 text-gray-800 border-gray-200" };

  if (state.escalated)
    return { label: "Escalated", cls: "bg-red-100 text-red-800 border-red-200" };

  if (state.off_route)
    return { label: "Off route", cls: "bg-orange-100 text-orange-800 border-orange-200" };

  if (state.seconds_left !== null && state.seconds_left <= 10)
    return { label: "Check-in due", cls: "bg-yellow-100 text-yellow-800 border-yellow-200" };

  return { label: "On route", cls: "bg-green-100 text-green-800 border-green-200" };
}

export default function ShareWalkPage() {
  const params = useParams<{ token?: string | string[] }>();
  const tokenRaw = params?.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  const validToken = token && token !== "undefined" ? token : null;

  const apiBase =
    process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";

  const googleKey =
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

  const [state, setState] = useState<WalkState | null>(null);

  // Poll backend every 2 seconds
  useEffect(() => {
  if (!validToken) return;

  let alive = true;

  async function poll() {
    try {
      const res = await fetch(`${apiBase}/walk/${validToken}`, { cache: "no-store" });
      const data = await res.json();
      if (!alive) return;
      if (res.ok) setState(data);
    } catch (err) {
      console.error("Polling error:", err);
    }
  }

  poll();
  const id = window.setInterval(poll, 2000);

  return () => {
    alive = false;
    window.clearInterval(id);
  };
}, [apiBase, validToken]);

  const center =
    state?.lat != null && state?.lng != null
      ? { lat: state.lat, lng: state.lng }
      : { lat: 41.8781, lng: -87.6298 }; // fallback Chicago

  const badge = getBadge(state);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">
          Lumiroute — Live Safety View
        </h1>

        <div
          className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.cls}`}
        >
          {badge.label}
        </div>
      </div>

      <div className="mt-3 text-sm text-gray-700 space-y-1">
        <div>
          <b>User:</b> {state?.user_label ?? "—"}
        </div>
        <div>
          <b>Next check-in:</b>{" "}
          {formatCountdown(state?.seconds_left ?? null)}
        </div>
        <div>
          <b>Last update:</b>{" "}
          {state?.updated_at_iso ?? "—"}
        </div>
      </div>

      <div className="mt-4 h-[520px] w-full overflow-hidden rounded-2xl border">
        <APIProvider apiKey={googleKey}>
          <GMap
            center={center}
            zoom={14}
            mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
            gestureHandling="greedy"
            disableDefaultUI={true}
          >
            {state?.lat != null && state?.lng != null && (
              <AdvancedMarker
                position={{ lat: state.lat, lng: state.lng }}
              >
                <div className="h-4 w-4 rounded-full bg-blue-500 shadow-lg ring-4 ring-blue-200 animate-pulse" />
              </AdvancedMarker>
            )}
          </GMap>
        </APIProvider>
      </div>

      <p className="mt-3 text-xs text-gray-500">
        This live safety view updates approximately every 2 seconds.
      </p>
    </div>
  );
}