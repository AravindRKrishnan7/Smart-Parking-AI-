# SmartPark AI

> **Smart Parking, Made Simple.**

## Problem

Drivers often waste time searching for parking even when spaces appear empty. **An empty parking space is not necessarily an available parking space.** A physically free slot may already be reserved, while disconnected occupancy and reservation systems can create confusion and double bookings.

## Solution

SmartPark AI is a responsive smart-parking platform that:

- accepts occupancy input from cameras or physical sensors;
- shows live parking-slot availability;
- lets drivers reserve an exact parking slot;
- prevents double booking;
- synchronizes physical occupancy with the digital reservation lifecycle; and
- helps drivers find the slot where their vehicle is parked.

The backend already supports both `CAMERA` and `SENSOR` sources through one normalized API. The occupancy simulator provides a reliable demo fallback while the computer-vision integration is being finalized.

## Core Architecture

```text
CCTV / Computer Vision ─┐
                        ├──> FastAPI Backend ──> SQLite ──> React Web App
Parking Sensors ────────┘           ▲
                                    │
Occupancy Simulator ────────────────┘
```

Camera, sensor, and simulator inputs all become the same normalized `FREE` or `OCCUPIED` events. FastAPI is the only component that writes to SQLite, making the backend the single source of truth.

## Core State Model

| State layer | Values |
| --- | --- |
| Physical status | `FREE`, `OCCUPIED` |
| Reservation status | `AVAILABLE`, `RESERVED` |
| Derived display status | `AVAILABLE` (green), `RESERVED` (orange), `OCCUPIED` (red) |

Display status is derived by the backend rather than stored separately. Physical occupancy takes priority over reservation state in the UI.

## Reservation Lifecycle

```text
FREE + AVAILABLE
  → reservation created
FREE + RESERVED / ACTIVE
  → vehicle detected
OCCUPIED + RESERVED / IN_USE
  → vehicle leaves
FREE + AVAILABLE / COMPLETED
```

Cancelling an `ACTIVE` reservation releases its slot. Transaction-safe checks prevent two active reservations from claiming the same slot.

## Current Features

- Eight demo parking slots (`P1`–`P8`)
- Camera and sensor occupancy sources
- Live slot-status polling
- Exact-slot reservations
- Vehicle-number normalization
- Double-booking protection
- Reservation states: `ACTIVE`, `IN_USE`, `COMPLETED`, and `CANCELLED`
- Automatic occupancy/reservation synchronization
- Find My Car lookup for active parking sessions
- SQLite persistence
- Interactive occupancy simulator
- Responsive React interface

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | React, Vite, TypeScript, Tailwind CSS |
| Backend | Python, FastAPI, SQLAlchemy, SQLite |
| Computer-vision target | OpenCV, Ultralytics YOLO, predefined parking regions |
| Communication | REST, JSON, approximately 2-second frontend polling |

## API Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `GET` | `/api/slots` | List all parking slots |
| `GET` | `/api/slots/{slot_id}` | Get one parking slot |
| `POST` | `/api/slots/occupancy` | Submit a normalized occupancy update |
| `POST` | `/api/reservations` | Create a reservation |
| `GET` | `/api/reservations` | List reservations |
| `GET` | `/api/reservations/{reservation_id}` | Get one reservation |
| `DELETE` | `/api/reservations/{reservation_id}` | Cancel an active reservation |
| `GET` | `/api/vehicles/{vehicle_number}/location` | Find a vehicle's current slot |

## Repository Structure

```text
SmartParkAI/
├── backend/
├── frontend/
├── simulator/
│   ├── occupancy_simulator.py
│   └── README.md
└── README.md
```

## Running Locally

Start the backend from the repository root:

```bash
cd backend
../.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

In another terminal, start the frontend:

```bash
cd frontend
npm run dev
```

- Frontend: `http://localhost:5173`
- Backend: `http://127.0.0.1:8000`
- Swagger API documentation: `http://127.0.0.1:8000/docs`

## Occupancy Simulator

The simulator reads current slot data from `GET /api/slots` and sends changes through `POST /api/slots/occupancy`. It never writes to SQLite directly and automatically uses each slot's `configured_source`, so camera-configured and sensor-configured slots follow the same rules as real integrations.

With the backend running, launch it from the repository root:

```bash
python3 simulator/occupancy_simulator.py
```

## Demo Flow

1. Start the FastAPI backend.
2. Start the React frontend.
3. Open the parking layout and view live slot states.
4. Reserve an available slot for a vehicle number.
5. Use the occupancy simulator to mark that slot `OCCUPIED`.
6. Observe the reservation transition from `ACTIVE` to `IN_USE`.
7. Use Find My Car to locate the vehicle's slot.
8. Mark the slot `FREE` and observe the reservation become `COMPLETED`.

## Hackathon Prototype Status

SmartPark AI is a working hackathon prototype. Its backend, database persistence, reservation lifecycle, Find My Car flow, simulator, and frontend integration are implemented. Live computer-vision detection is the intended camera input and is not yet complete; the simulator provides deterministic occupancy events for the current demo.

## Future Scope

- Complete YOLO-based live camera occupancy detection
- Add production-grade sensor and edge-device connectivity
- Introduce authentication and role-based access
- Add reservation expiry and notification workflows
- Add indoor maps and frontend route guidance
- Deploy with production monitoring and a managed database

## Team

- Backend & System Integration
- Computer Vision
- Frontend & UX
- Testing, Product & Presentation
