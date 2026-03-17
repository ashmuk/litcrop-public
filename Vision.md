# Vision: Remote Farm Observation & Management Web App (LitCrop)

## Overview
This project aims to build a web-based application that enables remote observation and management of farm work through digital transformation (DX). The system represents a farm as a digital twin, allowing users to track planting layouts, monitor crop growth remotely, and make informed decisions without being physically present.

The focus is on practicality, incremental development, and real-world deployability using affordable hardware and cloud-native services.

Naming this project as 'LitCrop', where implying Lit as Little, Lite and Enlight as concept.

---

## Core Goals
- Enable remote visibility into farm conditions
- Digitally manage planting layouts and crop metadata
- Monitor vegetable growth over time using cameras
- Build a scalable, cloud-based architecture suitable for gradual expansion

---

## Key Features

### 1. Farm Layout Management
- Represent the farm as a structured layout:
  - Fields → beds → plots
- Each plot stores:
  - Crop type and variety
  - Planting date
  - Expected harvest window
  - Notes (fertilizer, issues, observations)
- Visual 2D layout editor (grid or map-based)
- Plot-level drill-down for detailed management

---

### 2. Remote Growth Monitoring
- Use low-power camera nodes deployed in the field
- Camera nodes are associated with specific plots or beds
- Primary monitoring methods:
  - Periodic still images (time-lapse style, default: every 1 hour)
  - Motion-triggered capture (PIR sensor) for wildlife/pest intrusion detection (e.g., deer)
- Live video streaming in a future phase (WebRTC/HLS, requires hardware upgrade)
- Control watering by sprinkler (periodic or on-demand) — deferred to post-PoC

---

### 3. Camera Node Concept
- Hardware assumptions:
  - Raspberry Pi (e.g. Zero 2 W or equivalent)
  - Camera module
  - LTE/SIM connectivity
  - Optional solar + battery power
- Responsibilities:
  - Capture images at fixed intervals or on demand
  - Compress images to reduce bandwidth
  - Upload images with metadata (plot ID, timestamp)

---

### 4. Growth Visualization & Analysis
#### Phase 1: Human-in-the-loop
- Show latest image and historical images
- Side-by-side or timeline comparison
- Manual tagging:
  - Healthy
  - Slow growth
  - Possible issue
  - Animal intrusion (supports motion-triggered captures)

#### Phase 2: Light Automation
- Simple computer vision metrics:
  - Green pixel ratio
  - Relative plant size over time
- Trend-based alerts (e.g. growth slower than expected)

#### Phase 3: Advanced AI (Future)
- Disease detection
- Growth stage estimation
- Yield prediction

---

### 5. Web Dashboard
- Farm overview dashboard:
  - List view (severity-sorted plot tiles) with weather strip
  - Layout view (spatial field → bed → plot arrangement)
  - Toggle between list and layout views
- Crop-centric views:
  - Growth timeline
  - Image history
  - Weather context on plot detail (temperature, humidity, rain)
- Weather & environment:
  - Current conditions, hourly and 7-day forecast
  - Crop impact analysis (frost risk, rain impact, growing conditions)
  - Weather data from Open-Meteo API (free, coordinate-based) for PoC
  - On-site sensor data (DHT22 on camera node) for MVP
- Alerts:
  - Missing data
  - Abnormal trends
  - Frost/rain weather alerts
  - Motion-triggered intrusion alerts
- Settings:
  - Theme: Light / Dark / Earthy (soft pastel, natural tones) / System
  - Language: English / Japanese (日本語)
  - Temperature unit, weather alerts, camera configuration
- Designed for daily, quick check-ins

---

### 6. Farm Setup & AI Chatbot Assistant
- Location-driven onboarding:
  - User specifies farm location via GPS, coordinates (lat/lon), address search, or AI-guided
  - Auto-detected climate profile (hardiness zone, frost dates, growing season)
  - Location drives weather data, crop recommendations, and alerts
- AI chatbot for crop planning (PoC scope — focused, actionable):
  - Location-aware crop recommendations ("What grows well at 36°N, 760m?")
  - Season planner based on local frost dates and climate zone
  - Beginner-friendly guidance with planting schedules
  - Chatbot-assisted layout creation ("Plan my layout for 20m²")
- General farming knowledge queries (future enhancement)

---

## Technical Direction

### Cloud & Backend
- Assuming hosting on AWS, but other recommendations are welcome (e.g. Vercel)
- For the UI design and components, start with the minimal layout size (mobile) so that UI blocks are easier to be adjusted for bigger size (desktop)
- Likely components:
  - Static frontend hosting (S3 + CDN)
  - Serverless backend (API + functions)
  - NoSQL database for farm and crop metadata
  - Object storage for images with lifecycle policies

### Device Communication
- Start with simple HTTPS-based uploads
- Future option to integrate managed IoT services
- Prioritize reliability and low operational complexity

---

## Non-Goals (Initial Phase)
- Full real-time video streaming (deferred to Production phase)
- Fully automated AI diagnosis without human review
- Heavy sensor networks beyond basic imaging and optional temperature/humidity
- Interactive layout editor (deferred to MVP; PoC uses read-only spatial view)

---

## MVP Definition
The first deliverable should:
1. Allow creation and editing of farm layout and crop data
2. Support one or more camera nodes uploading images
3. Display time-lapse growth per plot
4. Enable manual observation and tagging

This MVP should already provide meaningful value to small-scale or personal farming use cases.
And users will be managed by waiting list.

---

## Target Deployment
- First candidate location: Nagano Prefecture, Japan (36.0, 138.3)
- Elevation: ~760m, Climate: Humid continental (Köppen Dfa/Dfb), USDA Zone 7a
- Excellent LTE coverage (SORACOM IoT SIM), AWS ap-northeast-1 (Tokyo)
- Bilingual support: English and Japanese (日本語)

---

## Long-Term Vision
The system can evolve into a shared, collaborative remote farming platform, integrating sensors, weather data, task planning, and advanced analytics, while remaining accessible to individuals and small teams. Future capabilities include real-time video streaming, advanced AI-powered crop analysis, and multi-farm collaborative management.
