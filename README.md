# Lumiroute  
### ML-Powered Safer Walking Routes

Lumiroute is an intelligent routing system that compares multiple Google walking routes and selects the safest path using a trained machine learning model. It combines real-time map routing, historical incident density analysis, and user-adjustable safety preferences to provide transparent safety tradeoffs between speed and risk.

---

## Features

### ML Route Agent
- Ridge regression model trained on engineered route features
- 23 route-level features including:
  - Incident density
  - High-severity crime weighting
  - Time-of-day harmonics
  - User safety preferences
- Confidence scoring displayed in the UI
- Agent explanation layer for transparency

---

### Multi-Route Comparison
- Blue: Fastest route  
- Green: ML-selected safer route  
- Purple: Nearest open safe place route  

If routes overlap heavily, Lumiroute applies a small visual offset to clearly show differences.

---

### Safety Preferences
Users can adjust:
- Radius of incident scan
- Time window (7 / 14 / 30 days)
- Category emphasis weighting:
  - Robbery
  - Assault
  - Battery
  - Criminal Sexual Assault

Higher weight = stronger avoidance bias.

---

### Nearest Open Safe Place
One-click quick action to find:
- Police stations
- Hospitals
- 24-hour convenience stores

Automatically routes from:
- Current GPS location (if active)
- Start point
- Map center (fallback)

---

### Live Walk Mode
- Real-time GPS tracking
- Off-route detection
- Check-in interval system
- Shareable live view link
- Escalation-ready structure

---

## How It Works

### 1. Route Generation
Google Directions API returns multiple walking alternatives including forced via-waypoints.

### 2. Risk Scoring
Backend evaluates each route by:
- Sampling route polyline points
- Scanning nearby incident density
- Applying user-defined weighting
- Producing risk score (lower = safer)

### 3. Agent Selection
The ML agent selects the safest tradeoff route and provides:
- Predicted risk values
- Confidence score (0–100%)
- Human-readable explanation

---

##  Architecture

Lumiroute uses a two-layer decision system:

1. Google Directions API generates walking alternatives.
2. Backend risk engine evaluates each route using:
   - Spatial density analysis
   - Time-window filtering
   - User-weighted category scoring
3. ML agent selects the optimal tradeoff route.
4. Frontend renders multi-layer route visualization.

The system is designed to support:
- Real-time inference
- Feedback-based retraining
- Scalable feature engineering

## ML Model

Pipeline:
- StandardScaler
- Ridge Regression

Training:
- Logged user choices
- Route feature vectors
- Iterative model improvement possible via feedback

---

## 🛠 Tech Stack

Frontend:
- Next.js
- React
- TypeScript
- Google Maps JS API
- Google Places API

Backend:
- FastAPI
- Scikit-learn
- Joblib model persistence

---

## Future Improvements

- Real-time model incremental learning
- Risk heat gradient tied to time-of-day
- Emergency auto-suggestion logic
- Mobile-first UI redesign
- Production deployment

---

## 📌 Why Lumiroute?

Traditional navigation optimizes for time.  
Lumiroute optimizes for personal safety.