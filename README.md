# LumiRoute  
### AI-Powered Contextual Safety Routing

---

## Overview

**LumiRoute** is a full-stack, machine learning–assisted navigation system that augments traditional routing with contextual geospatial risk modeling.

Modern navigation systems optimize for **time** and **traffic**.  
LumiRoute introduces a second optimization objective:

## Optimization Objective

Score = α · Travel Time + β · Contextual Safety Risk

Where:

- α = time weighting parameter  
- β = safety weighting parameter  
- Travel Time = estimated route duration (seconds)  
- Contextual Safety Risk = computed environmental exposure score  

This allows dynamic balancing between efficiency and safety.


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

To improve performance, crime events are filtered spatially using the route’s bounding box.

Filtered Crimes = { c ∈ Dataset | c ∈ BoundingBox(route) }

This reduces computational complexity from scanning the entire dataset to evaluating only geographically relevant events.


---

## 2. Segment-Level Risk Scoring

Each route is discretized into coordinate segments.

For each segment sᵢ:

Risk(sᵢ) = Σ [ wⱼ · f(dᵢⱼ) ]

Where:

- dᵢⱼ = distance between segment sᵢ and crime event j  
- f(d) = inverse-distance decay function  
- wⱼ = severity weight of crime type j  

Total route risk:

Route Risk = Σ Risk(sᵢ)

This creates a continuous spatial risk accumulation model.


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

Final ranking formula:

Final Score = α · Time + β · Adjusted Risk

Routes are sorted ascending by Final Score.

---

## Computational Characteristics

Time Complexity (naive):  
O(N_crimes × N_segments)

Time Complexity (with bounding box filtering):  
O(N_filtered × N_segments)

Bounding box filtering significantly reduces N_filtered relative to N_crimes.

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