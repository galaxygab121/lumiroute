// apps/web/app/marketing/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import Link from "next/link";

/**
 * Marketing page for Lumiroute.
 * - Fully connected navigation
 * - Primary CTA ("Try Lumiroute") routes to /map
 * - Secondary CTA can open /map with optional query params if you later add parsing
 *
 * Drop this file at: apps/web/app/marketing/page.tsx
 * Then make app/page.tsx redirect to /marketing (optional).
 */

type FAQItem = {
  q: string;
  a: string;
};

type Feature = {
  title: string;
  desc: string;
  bullets: string[];
  badge?: string;
};

type Step = {
  title: string;
  desc: string;
};

function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

function Pill({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: "neutral" | "violet" | "sky" | "green" | "red";
}) {
  const cls =
    tone === "violet"
      ? "border-violet-200 bg-violet-50 text-violet-700"
      : tone === "sky"
      ? "border-sky-200 bg-sky-50 text-sky-700"
      : tone === "green"
      ? "border-green-200 bg-green-50 text-green-700"
      : tone === "red"
      ? "border-red-200 bg-red-50 text-red-700"
      : "border-slate-200 bg-white text-slate-700";

  return (
    <span className={cx("inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold", cls)}>
      {children}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/85 p-5 shadow-sm backdrop-blur">
      <p className="text-[11px] font-semibold tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-slate-950">{value}</p>
    </div>
  );
}

function SectionTitle({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      {eyebrow ? (
        <div className="mb-3 flex justify-center">
          <Pill tone="violet">{eyebrow}</Pill>
        </div>
      ) : null}
      <h2 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">{title}</h2>
      {subtitle ? <p className="mt-3 text-sm leading-6 text-slate-700">{subtitle}</p> : null}
    </div>
  );
}

function Divider() {
  return <div className="my-10 h-px w-full bg-gradient-to-r from-transparent via-slate-200 to-transparent" />;
}

function TopNav() {
  return (
    <div className="sticky top-0 z-50 border-b border-slate-200 bg-white/60 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
        <Link href="/marketing" className="group inline-flex items-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-sky-600 text-sm font-black text-white shadow-sm">
            L
          </span>
          <div className="leading-tight">
            <div className="text-sm font-semibold tracking-tight text-slate-950 group-hover:text-slate-900">
              Lumiroute
            </div>
            <div className="text-[11px] font-semibold text-slate-500">Incident-aware routing</div>
          </div>
        </Link>

        <div className="hidden items-center gap-6 md:flex">
          <a href="#features" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            Features
          </a>
          <a href="#how" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            How it works
          </a>
          <a href="#safety" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            Safety
          </a>
          <a href="#faq" className="text-sm font-semibold text-slate-700 hover:text-slate-900">
            FAQ
          </a>
        </div>

        <div className="flex items-center gap-3">
          <Link
            href="/map"
            className="hidden rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 md:inline-flex"
          >
            Open Map
          </Link>
          <Link
            href="/map"
            className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:opacity-95"
          >
            Try Lumiroute
          </Link>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ f }: { f: Feature }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-950">{f.title}</h3>
        {f.badge ? <Pill tone="sky">{f.badge}</Pill> : null}
      </div>
      <p className="mt-2 text-sm leading-6 text-slate-700">{f.desc}</p>
      <ul className="mt-4 space-y-2 text-sm text-slate-800">
        {f.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2">
            <span className="mt-1 inline-block h-2 w-2 rounded-full bg-slate-900/20" />
            <span className="leading-6">{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StepCard({ idx, s }: { idx: number; s: Step }) {
  return (
    <div className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="inline-flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-900 text-sm font-black text-white shadow-sm">
          {idx}
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-950">{s.title}</p>
          <p className="mt-1 text-sm leading-6 text-slate-700">{s.desc}</p>
        </div>
      </div>
    </div>
  );
}

function MiniCallout({
  title,
  desc,
  tone = "neutral",
}: {
  title: string;
  desc: string;
  tone?: "neutral" | "green" | "violet" | "sky" | "red";
}) {
  const bg =
    tone === "green"
      ? "border-green-200 bg-green-50"
      : tone === "violet"
      ? "border-violet-200 bg-violet-50"
      : tone === "sky"
      ? "border-sky-200 bg-sky-50"
      : tone === "red"
      ? "border-red-200 bg-red-50"
      : "border-slate-200 bg-slate-50";
  return (
    <div className={cx("rounded-3xl border p-5", bg)}>
      <p className="text-sm font-semibold text-slate-950">{title}</p>
      <p className="mt-1 text-sm leading-6 text-slate-700">{desc}</p>
    </div>
  );
}

function FaqItem({
  item,
  open,
  onToggle,
}: {
  item: FAQItem;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full rounded-3xl border border-slate-200 bg-white/85 p-5 text-left shadow-sm backdrop-blur transition hover:bg-white"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-slate-950">{item.q}</p>
          <p className={cx("mt-2 text-sm leading-6 text-slate-700", open ? "block" : "hidden")}>{item.a}</p>
        </div>
        <span className="mt-0.5 inline-flex h-8 w-8 items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 text-sm font-black text-slate-900">
          {open ? "–" : "+"}
        </span>
      </div>
    </button>
  );
}

function Footer() {
  return (
    <footer className="mt-12 border-t border-slate-200 bg-white/60 backdrop-blur">
      <div className="mx-auto grid max-w-6xl grid-cols-1 gap-8 px-6 py-10 md:grid-cols-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-600 to-sky-600 text-sm font-black text-white shadow-sm">
              L
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-950">Lumiroute</p>
              <p className="text-xs text-slate-600">Incident-aware routing + live safety checks</p>
            </div>
          </div>
          <p className="mt-4 text-sm leading-6 text-slate-700">
            Built for demos and hackathons: compare route options, explain why, and enable a lightweight “Live Walk”
            check-in flow.
          </p>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-950">Product</p>
          <div className="mt-3 space-y-2 text-sm">
            <Link href="/map" className="block text-slate-700 hover:text-slate-900">
              Open Map
            </Link>
            <Link href="/marketing" className="block text-slate-700 hover:text-slate-900">
              Marketing Home
            </Link>
            <a href="#features" className="block text-slate-700 hover:text-slate-900">
              Features
            </a>
            <a href="#faq" className="block text-slate-700 hover:text-slate-900">
              FAQ
            </a>
          </div>
        </div>

        <div>
          <p className="text-sm font-semibold text-slate-950">Notes</p>
          <p className="mt-3 text-sm leading-6 text-slate-700">
            Lumiroute is a decision-support tool. Always use your judgment and follow local safety guidance.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Pill tone="neutral">Demo-ready</Pill>
            <Pill tone="sky">Next.js</Pill>
            <Pill tone="violet">FastAPI</Pill>
          </div>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-6 py-6 text-xs text-slate-600 md:flex-row md:items-center md:justify-between">
          <p>© {new Date().getFullYear()} Lumiroute.</p>
          <p className="text-slate-500">Built by galaxygab121 • Chicago-first MVP</p>
        </div>
      </div>
    </footer>
  );
}

export default function MarketingPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const features: Feature[] = useMemo(
    () => [
      {
        title: "Fastest vs. Safer route comparison",
        desc: "Select a start and destination to compare multiple Google Directions alternatives with incident-aware scoring.",
        bullets: [
          "Fastest route shown in blue (dashed).",
          "Recommended safer route shown in green.",
          "Tradeoff summary: ETA, distance, and near-route incidents.",
        ],
        badge: "Routing",
      },
      {
        title: "Explainable “Why this route”",
        desc: "Generate a short explanation describing the nearby incident density and the categories that contributed most.",
        bullets: [
          "Includes radius + time window used for scanning.",
          "Surface top incident categories (e.g., robbery, assault).",
          "Supports adjustable per-category weights.",
        ],
        badge: "Explainable",
      },
      {
        title: "Live Walk Mode with check-ins",
        desc: "Start a safer route, set a check-in interval, and track whether you’re on route. Great for demos.",
        bullets: [
          "Countdown timer + “I’m OK” check-in.",
          "Off-route detection with meter distance.",
          "Escalation hook (backend alert) when check-in missed.",
        ],
        badge: "Live",
      },
      {
        title: "Nearest open safe place",
        desc: "Find the nearest open police station, hospital, or 24-hour store using Google Places and route to it in purple.",
        bullets: [
          "Uses Places library via APIProvider libraries={['places']}.",
          "Routes from live position (or start) to safe place.",
          "One-click “Open directions” external link.",
        ],
        badge: "Places",
      },
      {
        title: "Heat overlay (quick situational awareness)",
        desc: "Fetch a small grid of incident density and render faint heat circles on the map.",
        bullets: [
          "Toggle overlay on/off anytime.",
          "Window-controlled (last 7/14/30 days).",
          "Nice visual for demos and stakeholder storytelling.",
        ],
        badge: "Overlay",
      },
      {
        title: "Monorepo-friendly deployment",
        desc: "Works well with Vercel (web) + Render (API). Environment variables keep wiring simple.",
        bullets: [
          "NEXT_PUBLIC_API_BASE_URL points web → API.",
          "Separate services scale independently.",
          "Safe to demo with free tiers (with cold starts).",
        ],
        badge: "Deploy",
      },
    ],
    []
  );

  const how: Step[] = useMemo(
    () => [
      {
        title: "Pick start + destination",
        desc: "Click on the map: first click sets start, second sets destination. Third click resets and starts again.",
      },
      {
        title: "Compare route options",
        desc: "Lumiroute fetches route alternatives and scores them based on nearby incident density (your radius + time window).",
      },
      {
        title: "Start Live Walk Mode",
        desc: "Enable check-ins, optionally demo mode, and track off-route distance while walking the safer route.",
      },
    ],
    []
  );

  const faqs: FAQItem[] = useMemo(
    () => [
      {
        q: "Where does incident data come from?",
        a: "In this MVP, the backend scores routes using a dataset you provide (e.g., a CSV). The web app sends route paths and preferences to /risk/score and /risk/heat for scoring and overlays.",
      },
      {
        q: "Is Lumiroute guaranteed to be “safe”?",
        a: "No. Lumiroute is a decision-support tool. It can reduce exposure to areas with higher incident density, but it cannot predict the future or account for every local factor. Always use judgment.",
      },
      {
        q: "Why do I sometimes see a delay on first load?",
        a: "If you’re using free tiers (Render/Vercel), services can “sleep” and need a cold-start. Refreshing after a short moment usually fixes it. Upgrading reduces cold starts.",
      },
      {
        q: "How do I wire the marketing page to the app?",
        a: "This page already links to /map via Next.js <Link>. Make sure your map route exists at apps/web/app/map/page.tsx and that Vercel is deploying the web app root correctly.",
      },
      {
        q: "How do I change the API URL for production?",
        a: "Set NEXT_PUBLIC_API_BASE_URL in Vercel Project Settings → Environment Variables to your Render API URL (e.g., https://lumiroute.onrender.com). Then redeploy.",
      },
    ],
    []
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-violet-50 to-sky-50">
      <TopNav />

      {/* HERO */}
      <div className="mx-auto max-w-6xl px-6 pt-12">
        <div className="rounded-[2.25rem] border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur md:p-10">
          <div className="flex flex-col gap-8 md:flex-row md:items-start md:justify-between">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="violet">CITY DASHBOARD • PEDESTRIAN SAFETY</Pill>
                <Pill tone="sky">Hackathon Demo Ready</Pill>
                <Pill tone="green">Live Walk Mode</Pill>
              </div>

              <h1 className="mt-4 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                Walk smarter with{" "}
                <span className="bg-gradient-to-r from-slate-900 via-violet-700 to-sky-600 bg-clip-text text-transparent">
                  incident-aware routing
                </span>
                .
              </h1>

              <p className="mt-4 text-sm leading-6 text-slate-700 md:text-base md:leading-7">
                Lumiroute compares route alternatives and recommends paths with lower near-route incident density.
                It pairs routing with a lightweight Live Walk experience—check-ins, off-route detection, and a nearest
                open safe place button.
              </p>

              <div className="mt-6 flex flex-col gap-3 sm:flex-row">
                {/* ✅ Main CTA goes to /map */}
                <Link
                  href="/map"
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                >
                  Try Lumiroute
                </Link>

                {/* Secondary CTA: also /map (kept simple) */}
                <Link
                  href="/map"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                >
                  Open Map Dashboard
                </Link>

                <a
                  href="#how"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  How it works
                </a>
              </div>

              <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
                <StatCard label="ROUTES" value="Fastest + Safer" />
                <StatCard label="OVERLAY" value="Heat grid" />
                <StatCard label="LIVE MODE" value="Check-ins" />
              </div>
            </div>

            {/* RIGHT PANEL */}
            <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm font-semibold text-slate-950">Quick start</p>

              <div className="mt-4 space-y-3">
                <MiniCallout
                  tone="sky"
                  title="1) Open the map"
                  desc="Click “Try Lumiroute” to launch the dashboard at /map."
                />
                <MiniCallout
                  tone="violet"
                  title="2) Click start + destination"
                  desc="First click sets start, second click sets destination. Routes score automatically."
                />
                <MiniCallout
                  tone="green"
                  title="3) Start Live Walk Mode"
                  desc="Pick check-in interval, enable demo mode if desired, and watch off-route distance update."
                />
              </div>

              <Divider />

              <p className="text-xs text-slate-600">
                Tip: If the API is on a free tier, the first request may take a moment to wake up. Refresh if needed.
              </p>

              <div className="mt-4 flex flex-col gap-2">
                <Link
                  href="/map"
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  Launch /map
                </Link>
                <Link
                  href="/marketing#faq"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                >
                  Read FAQ
                </Link>
              </div>
            </div>
          </div>
        </div>

        {/* TRUST / DISCLAIMER STRIP */}
        <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
            <Pill tone="neutral">Decision support</Pill>
            <p className="mt-3 text-sm font-semibold text-slate-950">Not a guarantee</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Lumiroute helps compare alternatives. It cannot predict real-time events. Use judgment.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
            <Pill tone="violet">Explainable</Pill>
            <p className="mt-3 text-sm font-semibold text-slate-950">Why this route</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              The dashboard provides a short explanation of nearby incidents within your selected scan radius.
            </p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
            <Pill tone="green">Live walk</Pill>
            <p className="mt-3 text-sm font-semibold text-slate-950">Check-ins + off-route</p>
            <p className="mt-2 text-sm leading-6 text-slate-700">
              Demonstrate a safety check-in flow and show route adherence with an off-route distance meter.
            </p>
          </div>
        </div>

        <Divider />

        {/* FEATURES */}
        <section id="features" className="scroll-mt-24">
          <SectionTitle
            eyebrow="WHAT YOU GET"
            title="A complete demo loop: route → reason → live walk"
            subtitle="Designed for quick wiring: Vercel hosts the UI, Render hosts the API, and one env var connects them."
          />

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2">
            {features.map((f) => (
              <FeatureCard key={f.title} f={f} />
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">Ready to test it?</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Jump into the dashboard and click two points to generate route comparisons.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/map"
                  className="inline-flex items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                >
                  Try Lumiroute → /map
                </Link>
                <a
                  href="#how"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                >
                  See workflow
                </a>
              </div>
            </div>
          </div>
        </section>

        <Divider />

        {/* HOW IT WORKS */}
        <section id="how" className="scroll-mt-24">
          <SectionTitle
            eyebrow="WORKFLOW"
            title="How Lumiroute works (in 30 seconds)"
            subtitle="From map clicks to scored alternatives to live walk check-ins."
          />

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            {how.map((s, i) => (
              <StepCard key={s.title} idx={i + 1} s={s} />
            ))}
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
              <p className="text-sm font-semibold text-slate-950">Under the hood</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                The UI requests route alternatives, then posts the route paths to your API:
                <span className="font-semibold text-slate-900"> /risk/score</span> and{" "}
                <span className="font-semibold text-slate-900">/agent/route/choose</span>.
              </p>
              <ul className="mt-4 space-y-2 text-sm text-slate-800">
                <li className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-2 w-2 rounded-full bg-violet-600/50" />
                  <span>Radius + window define “near route” scanning.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-2 w-2 rounded-full bg-sky-600/50" />
                  <span>Weights tune how strongly you avoid certain categories.</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 inline-block h-2 w-2 rounded-full bg-green-600/50" />
                  <span>Explanation combines model output + top nearby categories.</span>
                </li>
              </ul>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
              <p className="text-sm font-semibold text-slate-950">Deployment wiring</p>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                On Vercel, set <span className="font-semibold text-slate-900">NEXT_PUBLIC_API_BASE_URL</span> to your
                Render URL. Then redeploy.
              </p>

              <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
                <p className="font-semibold text-slate-900">Vercel Environment Variables</p>
                <p className="mt-2">
                  <span className="font-mono">NEXT_PUBLIC_API_BASE_URL</span> ={" "}
                  <span className="font-mono">https://lumiroute.onrender.com</span>
                </p>
                <p className="mt-1 text-slate-600">
                  (Plus your Google Maps keys: NEXT_PUBLIC_GOOGLE_MAPS_API_KEY, optional NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID)
                </p>
              </div>

              <div className="mt-4 flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/map"
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  Open /map
                </Link>
                <a
                  href="#faq"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                >
                  Troubleshooting
                </a>
              </div>
            </div>
          </div>
        </section>

        <Divider />

        {/* SAFETY SECTION */}
        <section id="safety" className="scroll-mt-24">
          <SectionTitle
            eyebrow="SAFETY UX"
            title="Designed for clarity, not fear"
            subtitle="A calm dashboard style: clear tradeoffs, visual context, and a simple live walk loop."
          />

          <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-3">
            <MiniCallout
              tone="violet"
              title="Tradeoff summary"
              desc="Show what safety costs: extra minutes, extra distance, fewer near-route incidents."
            />
            <MiniCallout
              tone="sky"
              title="Heat overlay"
              desc="A light situational overlay to discuss trends without overwhelming the map."
            />
            <MiniCallout
              tone="green"
              title="Nearest safe place"
              desc="One action to find an open safe place nearby and route to it immediately."
            />
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
              <div className="max-w-3xl">
                <p className="text-sm font-semibold text-slate-950">Live Walk Mode philosophy</p>
                <p className="mt-2 text-sm leading-6 text-slate-700">
                  Live Walk is intentionally minimal: it gives you a timer, a check-in button, and route adherence info.
                  It’s meant to be demo-friendly and easy to wire into escalation workflows.
                </p>

                <ul className="mt-4 space-y-2 text-sm text-slate-800">
                  <li className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-slate-900/20" />
                    <span>Demo mode allows simulated walking along the safer route for presentations.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-slate-900/20" />
                    <span>Off-route detection uses a simple distance-to-path calculation (meters).</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="mt-1 inline-block h-2 w-2 rounded-full bg-slate-900/20" />
                    <span>Escalation can trigger when check-ins are missed or prolonged off-route occurs.</span>
                  </li>
                </ul>
              </div>

              <div className="w-full max-w-sm rounded-3xl border border-slate-200 bg-slate-50 p-5">
                <p className="text-xs font-semibold tracking-wide text-slate-500">TRY IT NOW</p>
                <p className="mt-2 text-sm font-semibold text-slate-950">Open the dashboard</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Click two points and start Live Walk Mode to see the check-in loop.
                </p>
                <Link
                  href="/map"
                  className="mt-4 inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-95"
                >
                  Try Lumiroute (go to /map)
                </Link>
              </div>
            </div>
          </div>
        </section>

        <Divider />

        {/* FAQ */}
        <section id="faq" className="scroll-mt-24">
          <SectionTitle
            eyebrow="FAQ"
            title="Common questions"
            subtitle="Quick answers for deployment, data, and how the demo behaves."
          />

          <div className="mt-8 space-y-3">
            {faqs.map((item, idx) => (
              <FaqItem
                key={item.q}
                item={item}
                open={openFaq === idx}
                onToggle={() => setOpenFaq((cur) => (cur === idx ? null : idx))}
              />
            ))}
          </div>

          <div className="mt-6 rounded-3xl border border-slate-200 bg-white/85 p-6 shadow-sm backdrop-blur">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-semibold text-slate-950">Still want a one-click path?</p>
                <p className="mt-1 text-sm leading-6 text-slate-700">
                  Go straight into the dashboard and start clicking.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/map"
                  className="inline-flex items-center justify-center rounded-2xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white shadow-sm hover:bg-slate-800"
                >
                  Open /map
                </Link>
                <Link
                  href="/marketing"
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50"
                >
                  Back to top
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FINAL CTA */}
        <div className="mt-10 rounded-[2.25rem] border border-slate-200 bg-white/85 p-8 shadow-sm backdrop-blur md:p-10">
          <div className="flex flex-col items-start justify-between gap-6 md:flex-row md:items-center">
            <div className="max-w-2xl">
              <div className="flex flex-wrap items-center gap-2">
                <Pill tone="violet">Ready for demo</Pill>
                <Pill tone="sky">Vercel + Render</Pill>
              </div>
              <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
                Launch the Lumiroute dashboard
              </h3>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Click two points. Compare fastest vs safer. Start Live Walk Mode. Find the nearest open safe place.
              </p>
            </div>

            <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
              <Link
                href="/map"
                className="inline-flex w-full items-center justify-center rounded-2xl bg-gradient-to-r from-violet-600 to-sky-600 px-6 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-95 sm:w-auto"
              >
                Try Lumiroute
              </Link>
              <Link
                href="/map"
                className="inline-flex w-full items-center justify-center rounded-2xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-slate-50 sm:w-auto"
              >
                Open Map
              </Link>
            </div>
          </div>
        </div>

        <Footer />
      </div>
    </div>
  );
}
