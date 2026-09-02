# SmartPark AI

### Smart Parking, Made Simple.

**SmartPark AI** is a responsive smart parking platform designed to provide real-time parking availability, exact-slot reservations, reservation-aware occupancy management, and vehicle location assistance.

The system is being developed as a **Smart Cities & IoT hackathon prototype** and is designed to work with either CCTV-based computer vision or dedicated parking sensors depending on the infrastructure already available at a parking facility.

---

## The Problem

In large parking facilities such as malls, hospitals, airports, campuses, railway stations, and office complexes, drivers often spend unnecessary time searching for an empty parking space.

The problem is not always that parking is unavailable.

The problem is that the driver does not know **where the available parking is**.

There is also another important challenge:

> **An empty parking space is not necessarily an available parking space.**

A parking slot may be physically empty but already reserved by another driver. A practical smart parking system therefore needs to understand both the **physical state of the parking space** and its **digital reservation state**.

---

## Our Solution

SmartPark AI connects physical parking infrastructure with a digital reservation platform.

The system can receive occupancy information from:

- CCTV cameras with computer vision
- Parking occupancy sensors
- Development/testing simulators using the same backend API

Drivers can use the responsive web application to:

- View live parking availability
- See exact available, reserved, and occupied slots
- Reserve an available parking space
- Avoid double-booking conflicts
- Cancel an active reservation
- Track the parking-session lifecycle
- Locate their vehicle using **Find My Car**
- View a visual route toward the located parking slot

---

## Core Innovation

Instead of representing each parking slot using only one status, SmartPark AI separates the physical and digital state.

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

The backend then derives the state shown to the driver.

| Physical State | Reservation State | User-facing State | UI |
| --- | --- | --- | --- |
| FREE | AVAILABLE | AVAILABLE | Green |
| FREE | RESERVED | RESERVED | Orange |
| OCCUPIED | AVAILABLE / RESERVED | OCCUPIED | Red |

This prevents a physically empty but digitally reserved slot from being incorrectly shown to another user as available.

The **FastAPI backend remains the single source of truth** for parking state.

---

## System Architecture

```text
           CCTV / Camera
                 │
                 ▼
        Computer Vision / YOLO
                 │
                 │ Normalized occupancy
                 │ FREE / OCCUPIED
                 │
                 ▼
            ┌───────────┐
            │           │
Sensors ───►│  FastAPI  │◄── Occupancy Simulator
            │  Backend  │
            │           │
            └─────┬─────┘
                  │
                  ▼
               SQLite
                  │
                  ▼
          REST API / JSON
                  │
                  ▼
        React Responsive Web App
                  │
       ┌──────────┼──────────┐
       ▼          ▼          ▼
 Availability  Reservation  Find My Car
```

The computer-vision module, parking sensors, and simulator all communicate with the same normalized backend occupancy interface.

This allows the occupancy source to change without redesigning the reservation system or frontend.

---

## Occupancy Source Architecture

Each parking slot can be configured with an authoritative occupancy source:

```text
CAMERA
or
SENSOR
```

Example:

```text
Camera
  ↓
Vehicle Detection
  ↓
Parking Slot Mapping
  ↓
P3 = OCCUPIED
  ↓
POST /api/slots/occupancy
```

or:

```text
Parking Sensor
  ↓
P5 = OCCUPIED
  ↓
POST /api/slots/occupancy
```

Both produce the same normalized parking state for the rest of the system.

---

## Reservation Lifecycle

SmartPark AI synchronizes physical occupancy with the reservation lifecycle.

```text
FREE + AVAILABLE
        │
        │ User reserves slot
        ▼
FREE + RESERVED
Reservation = ACTIVE
        │
        │ Vehicle detected
        ▼
OCCUPIED + RESERVED
Reservation = IN_USE
        │
        │ Vehicle leaves
        ▼
FREE + AVAILABLE
Reservation = COMPLETED
```

An active reservation may also be:

```text
ACTIVE → CANCELLED
```

before the parking session begins.

Once a reservation becomes `IN_USE`, cancellation is prevented by the backend.

---

## Double-Booking Protection

Reservations are validated by the backend rather than trusted to the frontend.

If two users attempt to reserve the same slot:

```text
User A
  ↓
Reserve P3
  ↓
SUCCESS


User B
  ↓
Reserve P3
  ↓
HTTP 409 CONFLICT
```

The frontend then informs the second user that the parking space is no longer available.

This prevents the frontend from creating conflicting reservations even during concurrent requests.

---

## Find My Car

SmartPark AI includes a **Find My Car** feature based on the vehicle registration number.

Example:

```text
Vehicle Number
KL07AB1234
      │
      ▼
GET /api/vehicles/KL07AB1234/location
      │
      ▼
Backend checks active parking session
      │
      ▼
PARKED at P3
```

The web application then:

- Displays the actual parking slot
- Highlights the slot in the parking layout
- Provides a visual route toward the slot

The backend also distinguishes between:

```text
RESERVED_NOT_PARKED
```

and:

```text
PARKED
```

Therefore, reserving a slot does not automatically mean that the system claims the vehicle is already parked there.

---

## Current Features

### Parking Availability

- Live P1–P8 parking state
- Available / Reserved / Occupied visualization
- Live parking statistics
- Approximately 2-second frontend polling
- Backend recovery after temporary connection loss

### Reservation

- Exact parking-slot selection
- Real backend reservation creation
- Double-booking protection
- Reservation validation
- Reservation cancellation
- ACTIVE → IN_USE → COMPLETED lifecycle
- Prevention of cancellation after parking begins

### Find My Car

- Vehicle-number lookup
- `PARKED` detection
- `RESERVED_NOT_PARKED` distinction
- Actual backend slot lookup
- Responsive target-slot highlighting
- Visual route toward the located slot

### Infrastructure

- CAMERA-configured parking slots
- SENSOR-configured parking slots
- Normalized occupancy API
- SQLite persistence
- Development/fallback occupancy simulator

---

## Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React, Vite, TypeScript |
| Styling | Tailwind CSS |
| Backend | Python, FastAPI |
| ORM | SQLAlchemy |
| Database | SQLite |
| Computer Vision Target | OpenCV, Ultralytics YOLO |
| Communication | REST API, JSON |
| Live UI Updates | Approximately 2-second HTTP polling |

---

## Key API Endpoints

### Parking Slots

```text
GET  /api/slots
GET  /api/slots/{slot_id}
POST /api/slots/occupancy
```

### Reservations

```text
POST   /api/reservations
GET    /api/reservations
GET    /api/reservations/{reservation_id}
DELETE /api/reservations/{reservation_id}
```

### Find My Car

```text
GET /api/vehicles/{vehicle_number}/location
```

---

## Example Occupancy Update

A camera or sensor can report:

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

The backend then handles any associated reservation-state transitions.

---

## Repository Structure

```text
SmartParkAI/
│
├── backend/
│   └── app/
│       ├── main.py
│       ├── database.py
│       ├── models.py
│       ├── schemas.py
│       │
│       ├── routers/
│       │   ├── slots.py
│       │   ├── reservations.py
│       │   └── vehicles.py
│       │
│       └── services/
│           ├── occupancy_service.py
│           ├── reservation_service.py
│           └── vehicle_service.py
│
├── frontend/
│   └── src/
│       ├── App.tsx
│       ├── api.ts
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

## Running SmartPark AI Locally

### 1. Start the Backend

From the repository root:

```bash
cd backend
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Backend:

```text
http://127.0.0.1:8000
```

Swagger documentation:

```text
http://127.0.0.1:8000/docs
```

---

### 2. Start the Frontend

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

## Occupancy Simulator

SmartPark AI includes a small occupancy simulator for:

- Integration testing
- Reservation lifecycle testing
- Sensor-style testing
- Emergency demonstration fallback

Run it from the repository root:

```bash
python3 simulator/occupancy_simulator.py
```

The simulator communicates only through the existing backend APIs:

```text
GET  /api/slots
POST /api/slots/occupancy
```

It does **not** modify SQLite directly.

It retrieves each parking slot's live `configured_source` and automatically uses either:

```text
CAMERA
```

or:

```text
SENSOR
```

when submitting occupancy updates.

This means the simulator follows the same backend rules as a real occupancy source.

---

## Demo Flow

A complete SmartPark AI demonstration follows this lifecycle:

```text
1. P3 is AVAILABLE
        ↓
   P3 shown GREEN

2. User reserves P3
        ↓
   Reservation = ACTIVE
        ↓
   P3 shown ORANGE

3. Occupancy input detects a vehicle
        ↓
   P3 = OCCUPIED
        ↓
   Reservation = IN_USE
        ↓
   P3 shown RED

4. User opens Find My Car
        ↓
   Enters vehicle number
        ↓
   Backend returns P3
        ↓
   P3 highlighted with route

5. Vehicle leaves P3
        ↓
   Occupancy = FREE
        ↓
   Reservation = COMPLETED
        ↓
   P3 shown GREEN again
```

This demonstrates the synchronization between:

```text
Physical Parking
       ↕
Backend State
       ↕
Digital Reservation
       ↕
User Application
```

---

## Hackathon Prototype Status

SmartPark AI currently has a working:

- FastAPI backend
- SQLite persistence layer
- Parking-state model
- Reservation system
- Double-booking protection
- Reservation lifecycle synchronization
- Responsive React web application
- Live parking-state updates
- Find My Car workflow
- Visual slot route guidance
- CAMERA / SENSOR occupancy interface
- Occupancy simulator for integration testing and fallback demonstration

The backend is already prepared to receive real-time occupancy information from computer vision.

The **YOLO-based camera occupancy module is currently being finalized and integrated with the existing normalized occupancy API**.

Until that integration is complete, the occupancy simulator provides deterministic physical-state events for system testing and fallback demonstrations.

---

## Why the Architecture Is Flexible

SmartPark AI is designed so that the rest of the platform does not depend on one particular occupancy technology.

A facility with existing CCTV infrastructure could use:

```text
CCTV → Computer Vision → SmartPark API
```

while another facility could use:

```text
Parking Sensors → SmartPark API
```

Both ultimately provide:

```text
Slot ID + FREE/OCCUPIED
```

to the same parking-state engine.

This allows the platform to adapt to different parking environments without rebuilding the reservation or user application layers.

---

## Future Scope

- Complete live YOLO-based CCTV occupancy integration
- ANPR-based verification of reserved vehicles
- Edge-device deployment for parking facilities
- Production-grade IoT sensor connectivity
- Reservation expiry and scheduled reservations
- Notifications and arrival reminders
- Multi-floor parking layouts
- Turn-by-turn indoor navigation
- Authentication and user accounts
- Cloud deployment and monitoring
- Value-added parked-vehicle services

---

## Team Responsibilities

| Area | Responsibility |
| --- | --- |
| Backend & System Integration | API, state management, reservation lifecycle, integration |
| Computer Vision | Vehicle detection and parking-slot occupancy |
| Frontend & UX | Responsive web application and user experience |
| Testing / Product / Presentation | QA, validation, product workflow and demo |

---

## Project Goal

SmartPark AI aims to move parking from:

> **Enter first, then search for a space**

to:

> **Know where parking is available before you start searching.**

The goal is not simply to detect cars.

It is to connect **physical parking infrastructure, real-time availability, digital reservations, and vehicle assistance into one synchronized parking experience.**