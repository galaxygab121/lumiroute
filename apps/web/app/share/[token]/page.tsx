"use client";

import { useEffect, useMemo, useState } from "react";
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

function prettyTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { hour: "numeric", minute: "2-digit", month: "short", day: "numeric" });
}

function getBadge(state: WalkState | null) {
  if (!state || !state.live_active)
    return { label: "Not active", cls: "bg-slate-100 text-slate-700 border-slate-200" };

  if (state.escalated)
    return { label: "Escalated", cls: "bg-red-50 text-red-700 border-red-200" };

  if (state.off_route)
    return { label: "Off route", cls: "bg-orange-50 text-orange-700 border-orange-200" };

  if (state.seconds_left !== null && state.seconds_left <= 10)
    return { label: "Check-in due", cls: "bg-yellow-50 text-yellow-800 border-yellow-200" };

  return { label: "On route", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" };
}

export default function ShareWalkPage() {
  const params = useParams<{ token?: string | string[] }>();
  const tokenRaw = params?.token;
  const token = Array.isArray(tokenRaw) ? tokenRaw[0] : tokenRaw;
  const validToken = token && token !== "undefined" ? token : null;

  const apiBase = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8000";
  const googleKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

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
      : { lat: 41.8781, lng: -87.6298 };

  const badge = getBadge(state);

  const isLive = !!state?.live_active && !state?.escalated;
  const headline = useMemo(() => {
    if (!validToken) return "Missing or invalid link";
    if (!state) return "Connecting…";
    if (!state.live_active) return "Session not active";
    if (state.escalated) return "Escalation triggered";
    if (state.off_route) return "Off-route detected";
    return "Live safety tracking";
  }, [state, validToken]);

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Top bar */}
      <div className="mx-auto max-w-6xl px-5 pt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-lg font-semibold text-white">Lumiroute — Live Safety View</h1>
            <p className="mt-1 text-sm text-slate-300">{headline}</p>
          </div>

          <div className="flex items-center gap-2">
            {isLive && (
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200/30 bg-emerald-500/10 px-3 py-1 text-xs font-semibold text-emerald-200">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
                </span>
                Live
              </span>
            )}

            <div className={`rounded-full border px-3 py-1 text-xs font-semibold ${badge.cls}`}>
              {badge.label}
            </div>
          </div>
        </div>

        {/* Metrics */}
        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white shadow-sm">
            <p className="text-[11px] font-semibold tracking-wide text-slate-300">USER</p>
            <p className="mt-1 text-sm font-semibold text-white">{state?.user_label ?? "—"}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white shadow-sm">
            <p className="text-[11px] font-semibold tracking-wide text-slate-300">NEXT CHECK-IN</p>
            <p className="mt-1 text-sm font-semibold text-white">{formatCountdown(state?.seconds_left ?? null)}</p>
            <p className="mt-1 text-xs text-slate-400">Updates ~every 2 seconds</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-white shadow-sm">
            <p className="text-[11px] font-semibold tracking-wide text-slate-300">LAST UPDATE</p>
            <p className="mt-1 text-sm font-semibold text-white">{prettyTime(state?.updated_at_iso)}</p>
            <p className="mt-1 text-xs text-slate-400">{state?.updated_at_iso ?? "—"}</p>
          </div>
        </div>

        {/* Map Card */}
        <div className="mt-4 overflow-hidden rounded-3xl border border-white/10 bg-white/5 shadow-sm ring-1 ring-black/30">
          <div className="relative h-[70vh] min-h-[520px] w-full md:h-[74vh]">
            {/* HUD overlay */}
            <div className="absolute left-4 top-4 z-50 rounded-2xl border border-white/15 bg-slate-900/60 p-3 text-xs text-slate-100 shadow-md backdrop-blur supports-[backdrop-filter]:bg-slate-900/40">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full bg-blue-400" />
                You (live location)
              </div>
              <div className="mt-1 text-[11px] text-slate-300">
                {state?.lat != null && state?.lng != null ? `${state.lat.toFixed(5)}, ${state.lng.toFixed(5)}` : "—"}
              </div>
            </div>

            <APIProvider apiKey={googleKey}>
              <GMap
                center={center}
                zoom={14}
                mapId={process.env.NEXT_PUBLIC_GOOGLE_MAP_ID}
                gestureHandling="greedy"
                disableDefaultUI={false}
              >
                {state?.lat != null && state?.lng != null && (
                  <AdvancedMarker position={{ lat: state.lat, lng: state.lng }}>
                    <div className="relative">
                      <div className="h-3.5 w-3.5 rounded-full bg-blue-400 shadow-lg ring-4 ring-blue-200/60" />
                      <div className="absolute inset-0 -m-2 rounded-full bg-blue-400/20 blur-md" />
                    </div>
                  </AdvancedMarker>
                )}
              </GMap>
            </APIProvider>
          </div>

          {/* Footer (attached to map) */}
          <div className="border-t border-white/10 bg-slate-900/40 px-5 py-4 text-xs text-slate-300 backdrop-blur">
            This link shows live location + status updates approximately every 2 seconds.
          </div>
        </div>

        {/* Token error */}
        {!validToken && (
          <div className="mt-4 rounded-2xl border border-red-200/20 bg-red-500/10 p-4 text-sm text-red-100">
            This link is missing a valid token.
          </div>
        )}

        <div className="h-10" />
      </div>
    </div>
  );
}