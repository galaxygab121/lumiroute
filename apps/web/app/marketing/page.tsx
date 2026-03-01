"use client";

import React, { useEffect, useMemo, useState } from "react";

function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
}

export default function LandingPage() {
  const [progress, setProgress] = useState(12); // 0..100
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    if (!auto) return;
    const id = window.setInterval(() => {
      setProgress((p) => {
        const next = p + 0.35;
        return next >= 100 ? 100 : next;
      });
    }, 30);
    return () => window.clearInterval(id);
  }, [auto]);

  // Map progress to x-position along the "road"
  const x = useMemo(() => {
    // SVG track from 80 -> 920
    const startX = 90;
    const endX = 910;
    return startX + ((endX - startX) * clamp(progress)) / 100;
  }, [progress]);

  // Make the flashlight cone grow/shift slightly with progress
  const coneLen = 170 + (progress / 100) * 80; // 170..250
  const coneOpacity = 0.28 + (progress / 100) * 0.08; // 0.28..0.36

  return (
    <div className="min-h-screen bg-[#070A12] text-white">
      {/* Top bar */}
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-2xl bg-white/10 ring-1 ring-white/15 flex items-center justify-center">
            <span className="text-sm font-semibold">L</span>
          </div>
          <div>
            <div className="text-sm font-semibold tracking-wide">Lumiroute</div>
            <div className="text-xs text-white/60">Safer routes. Live check-ins.</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAuto((v) => !v)}
            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/90 hover:bg-white/10"
          >
            {auto ? "Pause demo" : "Play demo"}
          </button>

          <button
            onClick={() => setProgress(12)}
            className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/90 hover:bg-white/10"
          >
            Reset
          </button>

          <button className="rounded-2xl bg-white px-4 py-2 text-xs font-semibold text-black hover:bg-white/90">
            Try Lumiroute
          </button>
        </div>
      </header>

      {/* Hero */}
      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 pb-14 pt-6 md:grid-cols-2 md:items-center">
        {/* Copy */}
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/80">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            Live Safety View + Route Risk Scoring
          </div>

          <h1 className="mt-4 text-4xl font-semibold leading-tight md:text-5xl">
            Walk together. <span className="text-white/70">Feel safer.</span>
          </h1>

          <p className="mt-4 max-w-xl text-sm leading-relaxed text-white/70">
            Lumiroute helps you choose safer routes and share a live safety view with check-ins.
            As you move, your progress updates — and your people can see you’re okay.
          </p>

          {/* Controls */}
          <div className="mt-6 rounded-3xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold text-white/80">Demo progress</div>
              <div className="text-xs text-white/60">{Math.round(progress)}%</div>
            </div>

            <input
              type="range"
              min={0}
              max={100}
              value={progress}
              onChange={(e) => setProgress(Number(e.target.value))}
              className="mt-3 w-full accent-violet-400"
            />

            <div className="mt-4 flex flex-wrap gap-3">
              <button
                onClick={() => setProgress((p) => clamp(p - 10))}
                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/90 hover:bg-white/10"
              >
                -10%
              </button>
              <button
                onClick={() => setProgress((p) => clamp(p + 10))}
                className="rounded-2xl border border-white/15 bg-white/5 px-4 py-2 text-xs font-semibold text-white/90 hover:bg-white/10"
              >
                +10%
              </button>
              <div className="ml-auto flex items-center gap-2 text-xs text-white/70">
                <span className={`h-2 w-2 rounded-full ${progress >= 100 ? "bg-emerald-400" : "bg-yellow-300"}`} />
                {progress >= 100 ? "Arrived safely" : "On route"}
              </div>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button className="rounded-2xl bg-violet-400 px-5 py-3 text-sm font-semibold text-black hover:bg-violet-300">
              Start a walk
            </button>
            <button className="rounded-2xl border border-white/15 bg-white/5 px-5 py-3 text-sm font-semibold text-white/90 hover:bg-white/10">
              See live view
            </button>
          </div>
        </div>

        {/* Visual */}
        <div className="relative">
          {/* Glow */}
          <div className="pointer-events-none absolute -inset-6 rounded-[2.25rem] bg-gradient-to-br from-violet-500/20 via-cyan-400/10 to-emerald-400/10 blur-2xl" />

          <div className="relative overflow-hidden rounded-[2.25rem] border border-white/10 bg-white/5 p-4 shadow-[0_20px_60px_rgba(0,0,0,0.35)]">
            <div className="flex items-center justify-between px-2 pb-3">
              <div>
                <div className="text-sm font-semibold">Night Walk Demo</div>
                <div className="text-xs text-white/60">Flashlights + progress-road</div>
              </div>

              <div className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-semibold text-white/80">
                {progress >= 100 ? "Safe" : "Walking"}
              </div>
            </div>

            <svg viewBox="0 0 1000 520" className="h-[360px] w-full md:h-[420px]">
              <defs>
                {/* Background gradient */}
                <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0b1024" />
                  <stop offset="55%" stopColor="#070A12" />
                  <stop offset="100%" stopColor="#06121a" />
                </linearGradient>

                {/* Road gradient */}
                <linearGradient id="road" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#0f172a" />
                  <stop offset="100%" stopColor="#0b1224" />
                </linearGradient>

                {/* Lit road overlay */}
                <linearGradient id="lit" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="rgba(167,139,250,0)" />
                  <stop offset="60%" stopColor="rgba(167,139,250,0.22)" />
                  <stop offset="100%" stopColor="rgba(99,102,241,0.30)" />
                </linearGradient>

                {/* Flashlight cone */}
                <radialGradient id="cone" cx="35%" cy="50%" r="70%">
                  <stop offset="0%" stopColor={`rgba(255,255,255,${coneOpacity})`} />
                  <stop offset="60%" stopColor={`rgba(255,255,255,${coneOpacity * 0.6})`} />
                  <stop offset="100%" stopColor="rgba(255,255,255,0)" />
                </radialGradient>

                {/* Progress clip for lit road */}
                <clipPath id="progressClip">
                  <rect x="60" y="300" width={(880 * progress) / 100} height="90" rx="40" />
                </clipPath>

                {/* Tiny glow */}
                <filter id="softGlow" x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="6" result="blur" />
                  <feMerge>
                    <feMergeNode in="blur" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              </defs>

              {/* Background */}
              <rect x="0" y="0" width="1000" height="520" fill="url(#bg)" />

              {/* Stars */}
              {Array.from({ length: 30 }).map((_, i) => {
                const sx = (i * 73) % 980;
                const sy = 30 + ((i * 41) % 180);
                const r = 1 + ((i * 7) % 2);
                return (
                  <circle key={i} cx={sx + 10} cy={sy} r={r} fill="rgba(255,255,255,0.25)" />
                );
              })}

              {/* Moon */}
              <circle cx="890" cy="90" r="34" fill="rgba(255,255,255,0.10)" />
              <circle cx="900" cy="84" r="34" fill="rgba(255,255,255,0.06)" />

              {/* Road container */}
              <g>
                {/* Road base */}
                <rect x="60" y="300" width="880" height="90" rx="45" fill="url(#road)" />
                {/* dashed center line */}
                {Array.from({ length: 18 }).map((_, i) => (
                  <rect
                    key={i}
                    x={100 + i * 45}
                    y={343}
                    width={22}
                    height={6}
                    rx={3}
                    fill="rgba(255,255,255,0.20)"
                  />
                ))}

                {/* Lit part of road (clipped by progress) */}
                <g clipPath="url(#progressClip)">
                  <rect x="60" y="300" width="880" height="90" rx="45" fill="url(#lit)" />
                  {/* subtle sheen */}
                  <rect x="60" y="308" width="880" height="18" rx="9" fill="rgba(255,255,255,0.06)" />
                </g>

                {/* Finish beacon */}
                <g filter="url(#softGlow)">
                  <circle cx="940" cy="345" r={progress > 70 ? 18 : 12} fill="rgba(52,211,153,0.35)" />
                  <circle cx="940" cy="345" r={progress > 95 ? 28 : 18} fill="rgba(52,211,153,0.18)" />
                  <circle cx="940" cy="345" r="6" fill="rgba(52,211,153,0.9)" />
                </g>
              </g>

              {/* Two characters group (moves along x) */}
              <g
                style={{
                  transform: `translateX(${x - 90}px)`,
                  transition: "transform 250ms ease-out",
                }}
              >
                {/* Flashlight cones (two overlapping cones) */}
                <g opacity={1}>
                  <path
                    d={`M 120 305 L ${120 + coneLen} 275 Q ${120 + coneLen + 40} 345 ${120 + coneLen} 415 L 120 385 Z`}
                    fill="url(#cone)"
                  />
                  <path
                    d={`M 80 305 L ${80 + coneLen * 0.92} 285 Q ${80 + coneLen * 0.92 + 35} 345 ${
                      80 + coneLen * 0.92
                    } 405 L 80 385 Z`}
                    fill="url(#cone)"
                  />
                </g>

                {/* Girl 1 (light skin, brunette straight hair) */}
                <g>
                  {/* body */}
                  <circle cx="90" cy="265" r="16" fill="#f2d6c9" />
                  {/* hair */}
                  <path
                    d="M 75 262 Q 90 235 106 262 L 106 274 Q 90 282 75 274 Z"
                    fill="#3a2a22"
                    opacity={0.95}
                  />
                  {/* torso */}
                  <rect x="78" y="282" width="24" height="34" rx="10" fill="rgba(255,255,255,0.14)" />
                  {/* legs */}
                  <path d="M 84 316 L 76 344" stroke="rgba(255,255,255,0.60)" strokeWidth="5" strokeLinecap="round" />
                  <path d="M 96 316 L 104 344" stroke="rgba(255,255,255,0.60)" strokeWidth="5" strokeLinecap="round" />
                  {/* flashlight */}
                  <rect x="104" y="300" width="16" height="7" rx="3" fill="rgba(255,255,255,0.70)" />
                </g>

                {/* Girl 2 (dark skin, dark brown curly hair) */}
                <g>
                  {/* head */}
                  <circle cx="130" cy="265" r="16" fill="#5b3a2b" />
                  {/* curls */}
                  {Array.from({ length: 8 }).map((_, i) => (
                    <circle
                      key={i}
                      cx={120 + (i % 4) * 8}
                      cy={248 + Math.floor(i / 4) * 10}
                      r="6"
                      fill="#2a1b16"
                      opacity={0.95}
                    />
                  ))}
                  {/* torso */}
                  <rect x="118" y="282" width="24" height="34" rx="10" fill="rgba(255,255,255,0.12)" />
                  {/* legs */}
                  <path d="M 124 316 L 116 344" stroke="rgba(255,255,255,0.60)" strokeWidth="5" strokeLinecap="round" />
                  <path d="M 136 316 L 144 344" stroke="rgba(255,255,255,0.60)" strokeWidth="5" strokeLinecap="round" />
                  {/* flashlight */}
                  <rect x="146" y="304" width="16" height="7" rx="3" fill="rgba(255,255,255,0.70)" />
                </g>

                {/* Floating progress bubble */}
                <g filter="url(#softGlow)">
                  <rect x="58" y="215" width="120" height="34" rx="17" fill="rgba(255,255,255,0.08)" />
                  <text x="118" y="238" textAnchor="middle" fill="rgba(255,255,255,0.82)" fontSize="12" fontWeight="600">
                    {Math.round(progress)}% lit
                  </text>
                </g>
              </g>
            </svg>

            {/* Bottom mini legend */}
            <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-white/60">Live check-ins</div>
                <div className="mt-1 font-semibold">Visible progress</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-white/60">Route risk</div>
                <div className="mt-1 font-semibold">Safer suggestions</div>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="text-white/60">Shareable view</div>
                <div className="mt-1 font-semibold">Peace of mind</div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="mx-auto max-w-6xl px-6 pb-10 text-xs text-white/50">
        Landing page
      </footer>
    </div>
  );
}