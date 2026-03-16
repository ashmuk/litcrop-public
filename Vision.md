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
- Primary monitoring method:
  - Periodic still images (time-lapse style)
- No live streaming in the initial phase
- Control watering by sprinkler (periodic or on-demand)

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
  - Layout map with status indicators
- Crop-centric views:
  - Growth timeline
  - Image history
- Alerts:
  - Missing data
  - Abnormal trends
- Designed for daily, quick check-ins

---

### 6. Simple AI chatbot supporter
- AI chat bot to support knowledge of farming (this maybe in the PoC scope?):
  - Characteristic for a crop to query
  - Characteristic for a place to farm (e.g. where do you have a place to farm? and here is the view for it...)

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
- Full real-time video streaming
- Fully automated AI diagnosis without human review
- Heavy sensor networks beyond basic imaging

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

## Long-Term Vision
The system can evolve into a shared, collaborative remote farming platform, integrating sensors, weather data, task planning, and advanced analytics, while remaining accessible to individuals and small teams.
