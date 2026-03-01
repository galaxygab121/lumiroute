# LumiRoute  
### AI-Powered Contextual Safety Routing

---

## Overview

**LumiRoute** is a full-stack, machine learning–assisted navigation system that augments traditional routing with contextual geospatial risk modeling.

Modern navigation systems optimize for **time** and **traffic**.  
LumiRoute introduces a second optimization objective:

$begin:math:display$
\\text\{Minimize Travel Time\} \+ \\text\{Minimize Contextual Safety Risk\}
$end:math:display$

By integrating historical crime density with spatial filtering and adaptive scoring, LumiRoute transforms route selection into a multi-objective decision system.

---

## Core Concept

Navigation should not only answer:

> What is the fastest route?

It should also answer:

> Which route minimizes exposure to contextual safety risk?

LumiRoute builds a computational framework that quantifies environmental risk along candidate routes and dynamically adjusts recommendations based on travel modality.

---

## Features

### Intelligent Route Scoring
- Generates multiple candidate routes
- Computes safety-adjusted scoring
- Ranks fastest vs safest options
- Applies mode-aware weighting logic

### Crime Density Visualization
- Spatial heat overlay
- Interactive map exploration

### Live Walk Mode
- Real-time positional tracking
- Risk-aware monitoring
- Shareable tracking links
- Status escalation detection

### Production-Ready Architecture
- Cloud deployment (Vercel + Render)
- Environment-based configuration
- Efficient spatial filtering
- Scalable backend design

---

# System Architecture

## High-Level Architecture

```bash
┌──────────────────────────┐
│        User Client       │
│  (Browser / Mobile Web)  │
└─────────────┬────────────┘
              │
              ▼
┌──────────────────────────┐
│        Frontend          │
│  Next.js + TypeScript   │
│  Google Maps API        │
│  Tailwind UI            │
└─────────────┬────────────┘
              │ REST Requests
              ▼
┌──────────────────────────┐
│        Backend API       │
│        FastAPI           │
│  RouteSafetyAgent        │
│  Scikit-learn Utilities  │
└─────────────┬────────────┘
              │
              ▼
┌──────────────────────────┐
│     Risk Scoring Engine  │
│  - Bounding Box Filter   │
│  - Segment Risk Model    │
│  - Mode Weighting        │
│  - Multi-objective Rank  │
└─────────────┬────────────┘
              │
              ▼
┌──────────────────────────┐
│      Crime Dataset       │
│   Historical Events CSV  │
└──────────────────────────┘
```

---

## Route Scoring Flow

1. User selects origin, destination, and travel mode.
2. Google Maps returns candidate routes.
3. Frontend sends route coordinates to backend.
4. Backend:
   - Applies bounding-box filtering
   - Computes segment-level risk
   - Applies mode-specific weighting
   - Normalizes and ranks routes
5. Ranked routes are returned to frontend.

---

## Live Walk Flow

```bash
User Device
    │
    ▼
GPS Position → Frontend Polling (2s)
    │
    ▼
FastAPI /walk/{token}
    │
    ▼
Session State + Risk Flags
    │
    ▼
Shareable Tracking View
```

---

# Machine Learning & Risk Modeling

## 1. Bounding Box Filtering

To improve efficiency, crime data is restricted to the spatial envelope surrounding a route:

$begin:math:display$
\\text\{Filtered Crimes\} \= \\\{ c \\mid c \\in \\text\{BoundingBox\(route\)\} \\\}
$end:math:display$

This reduces complexity from scanning the entire dataset to evaluating only spatially relevant points.

---

## 2. Segment-Level Risk Scoring

Routes are discretized into coordinate segments.

For each segment:

$begin:math:display$
\\text\{Risk\}\(s\_i\) \= \\sum\_\{j\=1\}\^\{n\} w\_j \\cdot f\(d\_\{ij\}\)
$end:math:display$

Where:

- $begin:math:text$ d\_\{ij\} $end:math:text$ = distance from segment $begin:math:text$ s\_i $end:math:text$ to crime event $begin:math:text$ j $end:math:text$
- $begin:math:text$ f\(\\cdot\) $end:math:text$ = inverse-distance decay function
- $begin:math:text$ w\_j $end:math:text$ = severity weight for crime type

Total route risk:

$begin:math:display$
\\text\{Route Risk\} \= \\sum\_\{i\=1\}\^\{k\} \\text\{Risk\}\(s\_i\)
$end:math:display$

---

## 3. Mode-Specific Weighting

| Mode    | Risk Emphasis |
|---------|--------------|
| Walking | Uniform segment weighting |
| Transit | Increased weighting near stops |
| Driving | Reduced pedestrian exposure weighting |

Transit modeling increases weighting near station clusters due to higher observed crime density.

---

## 4. Multi-Objective Optimization

Final ranking balances time and safety:

$begin:math:display$
\\text\{Score\} \= \\alpha \(\\text\{Time\}\) \+ \\beta \(\\text\{Risk\}\)
$end:math:display$

Where:

- $begin:math:text$ \\alpha $end:math:text$ = time weighting
- $begin:math:text$ \\beta $end:math:text$ = safety weighting

---

# Data Model Schema

## 1. Crime Event Schema

```json
{
  "id": "string",
  "latitude": "float",
  "longitude": "float",
  "primary_type": "string",
  "timestamp": "datetime"
}
```

### Severity Weight Mapping

| Crime Type | Weight |
|------------|--------|
| Homicide | 1.0 |
| Robbery | 0.8 |
| Assault | 0.7 |
| Theft | 0.4 |
| Other | 0.2 |

---

## 2. Route Object Schema

```json
{
  "duration_seconds": 720,
  "mode": "walking",
  "coordinates": [
    { "lat": 41.8781, "lng": -87.6298 }
  ]
}
```

### Derived Features

- Bounding box
- Segment count
- Crime density
- Normalized risk

---

## 3. Ranked Route Response

```json
{
  "ranked_routes": [
    {
      "duration_seconds": 720,
      "mode": "walking",
      "safety_score": 0.82,
      "normalized_risk": 0.18
    }
  ]
}
```

---

## 4. Live Walk Session Schema

```json
{
  "token": "abc123xyz",
  "user_label": "Gabrielle",
  "live_active": true,
  "escalated": false,
  "off_route": false,
  "seconds_left": 42,
  "last_checkin_iso": "2026-03-01T08:45:12Z",
  "lat": 41.8781,
  "lng": -87.6298,
  "updated_at_iso": "2026-03-01T08:45:12Z"
}
```

---

# Technical API Documentation

## Base URL

```bash
https://lumiroute.onrender.com
```

---

## Health Check

```bash
GET /
```

Response:

```json
{ "status": "ok" }
```

---

## Score Routes

```bash
POST /score
```

Request:

```json
{
  "routes": [
    {
      "duration_seconds": 720,
      "mode": "walking",
      "coordinates": [
        { "lat": 41.8781, "lng": -87.6298 }
      ]
    }
  ]
}
```

Response:

```json
{
  "ranked_routes": [
    {
      "safety_score": 0.82,
      "normalized_risk": 0.18
    }
  ]
}
```

---

## Start Live Walk

```bash
POST /walk/start
```

Response:

```json
{ "token": "abc123xyz" }
```

---

## Update Location

```bash
POST /walk/update/{token}
```

Request:

```json
{ "lat": 41.8781, "lng": -87.6298 }
```

---

## Get Live Session

```bash
GET /walk/{token}
```

Returns current session state.

---

# Performance Characteristics

- Bounding-box spatial filtering
- Sub-second route scoring
- In-memory dataset loading
- 2-second polling interval for live tracking
- Scalable toward PostGIS and spatial indexing

---

# Deployment Stack

Frontend: Vercel  
Backend: Render  
Language: TypeScript + Python  
Frameworks: Next.js + FastAPI  
ML Utilities: Scikit-learn  
Mapping: Google Maps JavaScript API  

---

# Future Roadmap

- PostGIS spatial indexing
- Temporal crime modeling
- Predictive risk forecasting
- WebSocket real-time streaming
- Reinforcement learning personalization
- Municipal safety API integration

---

# Final Principle

Navigation systems optimize for time.

LumiRoute optimizes for intelligent, safety-aware mobility.