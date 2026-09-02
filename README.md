# SmartPark AI

### Smart Parking, Made Simple.

**SmartPark AI** is a smart parking platform designed to connect real-world parking occupancy with digital reservations and driver-facing services.

It provides drivers with real-time parking availability, exact-slot reservations, Find My Car assistance, and post-parking vehicle services through **While I Shop**.

The system is designed to support different parking infrastructures, including CCTV-based computer vision and dedicated occupancy sensors.

---

## The Problem

Drivers often spend unnecessary time searching for parking in places such as:

- Shopping malls
- Hospitals
- Airports
- Campuses
- Railway stations
- Office complexes
- Public parking facilities

Traditional parking systems often tell users only whether a facility has space available.

SmartPark AI focuses on a more important question:

> **Which exact parking space is genuinely available right now?**

A key challenge is that:

> **An empty parking space is not necessarily an available parking space.**

A physically empty slot may already be reserved by another driver.

A practical smart parking system therefore needs to understand both:

- **Physical occupancy**
- **Digital reservation state**

SmartPark AI keeps these two states separate and synchronizes them through a central backend.

---

# Solution

SmartPark AI connects parking infrastructure with a responsive web application.

```text
CCTV / Camera
      │
      ▼
Computer Vision / YOLO
      │
      │
      ├──────────────┐
                     │
Parking Sensors ─────┤
                     │
                     ▼
              Normalized Occupancy
              FREE / OCCUPIED
                     │
                     ▼
               FastAPI Backend
                     │
              ┌──────┴──────┐
              │             │
         Reservations    Services
              │             │
              └──────┬──────┘
                     │
                   SQLite
                     │
                     ▼
              React Web App
               │    │    │
               ▼    ▼    ▼
        Availability  Find My Car
                      While I Shop
```

For development and fallback testing, SmartPark AI can also generate occupancy events through:

```text
Developer Tools
CLI Occupancy Simulator
```

Both use the same backend occupancy API as real physical sources.

---

# Core Parking State Model

SmartPark AI does not represent a parking slot with only one status.

Each slot maintains two independent states.

### Physical State

```text
FREE
OCCUPIED
```

### Reservation State

```text
AVAILABLE
RESERVED
```

The backend derives the state displayed to the driver.

| Physical State | Reservation State | Display State |
| --- | --- | --- |
| FREE | AVAILABLE | AVAILABLE |
| FREE | RESERVED | RESERVED |
| OCCUPIED | AVAILABLE | OCCUPIED |
| OCCUPIED | RESERVED | OCCUPIED |

In the UI:

```text
AVAILABLE → Green
RESERVED  → Orange
OCCUPIED  → Red
```

The **FastAPI backend is the single source of truth** for these states.

---

# Reservation Lifecycle

A normal reserved parking session follows:

```text
FREE + AVAILABLE
        │
        │ Driver reserves slot
        ▼
FREE + RESERVED
Reservation = ACTIVE
        │
        │ Vehicle arrives
        │ Occupancy detected
        ▼
OCCUPIED + RESERVED
Reservation = IN_USE
        │
        │ Vehicle leaves
        ▼
FREE + AVAILABLE
Reservation = COMPLETED
```

An unused reservation may also become:

```text
ACTIVE → CANCELLED
```

Once the parking session becomes `IN_USE`, normal cancellation is prevented.

---

# Double-Booking Protection

Reservations are validated by the backend rather than trusted to the frontend.

If two users attempt to reserve the same slot:

```text
User A
  │
  ▼
Reserve P3
  │
  ▼
SUCCESS


User B
  │
  ▼
Reserve P3
  │
  ▼
HTTP 409 CONFLICT
```

This prevents multiple users from receiving the same parking slot.

---

# Find My Car

SmartPark AI can locate a vehicle using its registration number.

Example:

```text
KL07AB1234
     │
     ▼
GET /api/vehicles/KL07AB1234/location
     │
     ▼
Backend resolves active parking session
     │
     ▼
PARKED at P3
```

The frontend then:

- Shows the actual parking slot
- Highlights the destination
- Displays an animated route toward the slot

SmartPark also distinguishes between:

```text
RESERVED_NOT_PARKED
```

and:

```text
PARKED
```

Reserving a parking slot therefore does not cause the system to falsely claim that the vehicle is already there.

---

# While I Shop

Most parking applications stop being useful once the vehicle is parked.

SmartPark AI extends the parking session through **While I Shop**.

While I Shop becomes available only when:

```text
Reservation = IN_USE
Physical Status = OCCUPIED
```

A user who has only reserved a parking space cannot request services until the vehicle is physically detected as parked.

---

## Vehicle Services

### Car Care

- Exterior Wash
- Waterless Wash
- Exterior Wash + Polish
- Quick Wax / Shine
- Windshield Cleaning

### Wheels & Tyres

- Wheel & Rim Cleaning
- Tyre Shine
- Tyre Pressure Check

### Service Packages

- Quick Care
- Premium Shine

### EV Services

- EV Charging Request

EV Charging in the current prototype represents a **service availability/request workflow only**.

SmartPark AI does not invent or simulate:

- Vehicle battery percentage
- Battery State of Charge
- Charging telemetry
- Vehicle battery data
- Charging graphs

Dynamic vehicle information would normally remain with the vehicle manufacturer or charging provider.

---

# Privacy-Conscious Service Design

While I Shop deliberately focuses on **exterior, non-invasive services**.

The current prototype does not include:

- Interior cleaning
- Vehicle key handover
- Valet services
- Grocery/package delivery to the vehicle
- Fuel delivery
- Cabin access
- Mechanical repairs

Service providers receive only the information necessary to perform the requested service:

```text
Service
Vehicle Number
Parking Slot
Service Status
```

Unnecessary customer information is not exposed through provider controls.

---

# Service Lifecycle

All While I Shop services use the same generic service-request architecture.

```text
REQUESTED
    │
    ▼
ACCEPTED
    │
    ▼
IN_PROGRESS
    │
    ▼
COMPLETED
```

Cancellation is supported before the service begins:

```text
REQUESTED → CANCELLED

ACCEPTED → CANCELLED
```

Once a service becomes `IN_PROGRESS`, it must be explicitly completed.

---

# Generic Service Architecture

SmartPark AI does not create a separate backend system for every service.

All services use one generic `ServiceRequest` model.

Conceptually:

```text
ServiceRequest

id
reservation_id
slot_id
vehicle_number
service_type
status
price
estimated_duration
requested_at
updated_at
```

The backend service catalogue determines service information such as:

```text
Name
Category
Demo Price
Estimated Duration
```

This allows new vehicle services to be added primarily as catalogue entries rather than entirely new systems.

---

# Current Features

## Parking

- Individual parking-slot monitoring
- FREE / OCCUPIED physical state
- AVAILABLE / RESERVED reservation state
- Available / Reserved / Occupied visualization
- CAMERA and SENSOR configured sources
- Live frontend polling
- SQLite persistence

## Reservations

- Exact-slot reservation
- Double-booking protection
- Reservation validation
- Reservation cancellation
- ACTIVE → IN_USE synchronization
- IN_USE → COMPLETED synchronization

## Find My Car

- Vehicle-number lookup
- PARKED state detection
- RESERVED_NOT_PARKED distinction
- Exact parking-slot resolution
- Responsive destination highlighting
- Animated route guidance

## While I Shop

- Parked-only service access
- Exterior vehicle-care services
- Wheels and tyre services
- Vehicle-care packages
- EV charging request
- Persistent service requests
- Provider-side service lifecycle
- Customer service-status tracking

## Development & Testing

- Browser Developer Tools
- CAMERA occupancy simulation
- SENSOR occupancy simulation
- Reservation inspection
- Service-provider controls
- Lifecycle-aware demo reset
- CLI occupancy simulator

---

# Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, TypeScript |
| Styling | Tailwind CSS |
| Backend | Python, FastAPI |
| ORM | SQLAlchemy |
| Database | SQLite |
| Computer Vision Target | OpenCV, Ultralytics YOLO |
| Communication | REST API, JSON |
| Live Updates | Approximately 2-second HTTP polling |

---

# API Endpoints

## Parking

```text
GET  /api/slots
GET  /api/slots/{slot_id}
POST /api/slots/occupancy
```

## Reservations

```text
POST   /api/reservations
GET    /api/reservations
GET    /api/reservations/{reservation_id}
DELETE /api/reservations/{reservation_id}
```

## Find My Car

```text
GET /api/vehicles/{vehicle_number}/location
```

## While I Shop

```text
GET   /api/services/catalog
POST  /api/services
GET   /api/services
GET   /api/services/{service_id}
PATCH /api/services/{service_id}/status
```

---

# Example Occupancy Event

A camera-based slot can report:

```json
{
  "slot_id": 3,
  "physical_status": "OCCUPIED",
  "source": "CAMERA"
}
```

When the vehicle leaves:

```json
{
  "slot_id": 3,
  "physical_status": "FREE",
  "source": "CAMERA"
}
```

A sensor-configured slot uses the same contract with:

```json
{
  "source": "SENSOR"
}
```

The backend validates that the source matches the configured source for the parking slot.

---

# Repository Structure

```text
SmartParkAI/
│
├── backend/
│   └── app/
│       ├── main.py
│       ├── database.py
│       ├── models.py
│       ├── schemas.py
│       ├── service_catalog.py
│       │
│       ├── routers/
│       │   ├── slots.py
│       │   ├── reservations.py
│       │   ├── vehicles.py
│       │   └── services.py
│       │
│       └── services/
│           ├── occupancy_service.py
│           ├── reservation_service.py
│           ├── vehicle_service.py
│           └── service_request_service.py
│
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── api.ts
│       ├── WhileIShop.tsx
│       ├── DeveloperTools.tsx
│       ├── index.css
│       └── main.tsx
│
├── simulator/
│   ├── occupancy_simulator.py
│   └── README.md
│
└── README.md
```

---

# Running SmartPark AI Locally

## 1. Start the Backend

From the repository root:

```bash
cd backend
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Backend:

```text
http://127.0.0.1:8000
```

Swagger API documentation:

```text
http://127.0.0.1:8000/docs
```

---

## 2. Start the Frontend

Open another terminal:

```bash
cd frontend
npm run dev
```

Frontend:

```text
http://localhost:5173
```

---

# Developer / Demo Controls

SmartPark AI includes development controls for integration testing and hackathon demonstrations.

They are **not part of the normal driver-facing application**.

Enable them with:

```bash
cd frontend
VITE_ENABLE_DEV_TOOLS=true npm run dev
```

Developer Tools provide:

- Live parking-slot inspection
- Set slot FREE / OCCUPIED
- Automatic CAMERA / SENSOR source handling
- Reservation inspection
- Active reservation cancellation
- Service-provider controls
- Refresh State
- Reset Demo State

### Service Provider Controls

Developer Tools can manage While I Shop requests:

```text
REQUESTED
→ Accept

ACCEPTED
→ Start Service
or Cancel

IN_PROGRESS
→ Complete
```

All actions go through normal backend APIs.

Developer Tools never modify SQLite directly.

---

# Occupancy Simulator

SmartPark AI also contains an independent CLI simulator.

Run:

```bash
python3 simulator/occupancy_simulator.py
```

The simulator reads current slot state using:

```text
GET /api/slots
```

and submits occupancy through:

```text
POST /api/slots/occupancy
```

It uses each slot's real `configured_source`.

The simulator therefore generates the same normalized events expected from real parking infrastructure.

---

# End-to-End Demo Flow

A complete SmartPark AI demonstration can follow:

```text
P3 AVAILABLE
     ↓
GREEN

Driver reserves P3
     ↓
Reservation = ACTIVE
     ↓
P3 RESERVED / ORANGE

Vehicle arrives
     ↓
Occupancy input reports P3 OCCUPIED
     ↓
Reservation = IN_USE
     ↓
P3 RED

Find My Car
     ↓
Backend returns P3
     ↓
Animated route to P3

While I Shop unlocks
     ↓
Request Exterior Wash
     ↓
REQUESTED

Provider accepts
     ↓
ACCEPTED

Provider starts service
     ↓
IN_PROGRESS

Provider completes service
     ↓
COMPLETED

Locate My Car
     ↓
P3

Vehicle leaves
     ↓
P3 FREE
     ↓
Reservation = COMPLETED
     ↓
P3 AVAILABLE / GREEN
```

This demonstrates synchronization between:

```text
Physical Parking
        ↕
Backend State Engine
        ↕
Digital Reservations
        ↕
Vehicle Services
        ↕
Driver Application
```

---

# Hackathon Prototype Status

SmartPark AI currently has working:

- FastAPI backend
- SQLite persistence
- Parking state engine
- Reservation system
- Double-booking protection
- Reservation lifecycle synchronization
- Responsive React application
- Live parking-state updates
- Find My Car
- Animated slot navigation
- While I Shop
- Persistent service lifecycle
- Provider controls
- CAMERA / SENSOR occupancy interface
- Developer Tools
- CLI occupancy simulator

The backend is already prepared to receive normalized real-time occupancy information from CCTV-based computer vision.

The final **YOLO/OpenCV camera module is currently being finalized and integrated with the existing occupancy API**.

Until that integration is complete, Developer Tools and the occupancy simulator provide deterministic physical-state events for integration testing and fallback demonstration.

---

# Source-Agnostic Occupancy

SmartPark AI is designed so that the rest of the system does not depend on a single occupancy technology.

A facility with CCTV infrastructure can use:

```text
CCTV
  ↓
Computer Vision
  ↓
SmartPark Occupancy API
```

A facility with dedicated sensors can use:

```text
Parking Sensor
     ↓
SmartPark Occupancy API
```

Both ultimately provide:

```text
Slot ID
+
FREE / OCCUPIED
```

to the same backend state engine.

This allows SmartPark AI to adapt to different parking facilities without rebuilding its reservation or user-interface layers.

---

# Future Scope

- Production YOLO/OpenCV CCTV deployment
- ANPR-based reserved-vehicle verification
- Edge-device parking inference
- Production IoT sensor connectivity
- Multi-floor parking layouts
- Turn-by-turn indoor navigation
- Scheduled reservations
- Reservation expiry
- Arrival and service notifications
- Authentication and user accounts
- Real EV-charging provider integration
- Real vehicle-service provider integration
- Production database and cloud deployment
- Facility analytics and operational dashboards

---

# Team Responsibilities

| Area | Responsibility |
| --- | --- |
| Backend & System Integration | API architecture, state management, reservations and integration |
| Computer Vision | Vehicle detection and parking-slot occupancy |
| Frontend & UX | Responsive driver experience and interaction design |
| Testing / Product / Presentation | QA, demo validation, product flow and presentation |

---

# Product Goal

SmartPark AI aims to move parking from:

> **Enter first, then search for a space.**

to:

> **Know and reserve genuine parking availability before searching.**

The goal is not simply to detect vehicles.

It is to connect **physical parking infrastructure, live occupancy, digital reservations, vehicle assistance and parking-time services into one synchronized parking experience.**