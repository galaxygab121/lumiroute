# Lumiroute Web App

This is the frontend application for **Lumiroute** — a safety-aware walking route optimizer that compares the fastest route vs a safer alternative using real crime data and a machine learning route agent.

Built with:

-  Next.js (App Router)
-  Google Maps JavaScript API
-  Tailwind CSS
-  Custom ML route agent (via backend API)

---

##  What This App Does

The web client:

- Lets users select a **start and destination** on the map
- Fetches multiple walking routes from Google Directions
- Sends routes to the backend for **crime-based risk scoring**
- Uses an ML agent to choose the **optimal safer route**
- Displays:
  - 🔵 Fastest route (blue)
  - 🟢 Safer route (green)
  - 🟣 Safe place path (purple)
- Shows:
  - Safety score (0–100)
  - Incident comparison
  - ML confidence
  - Human-readable explanation
- Includes:
  -  Live Walk Mode
  -  Nearest open safe place discovery
  -  Trusted contact sharing
  -  Optional heat overlay

---

##  Local Development

From the monorepo root:

```bash
cd apps/web
npm install
npm run dev
```
then open: http://localhost:3000/map

