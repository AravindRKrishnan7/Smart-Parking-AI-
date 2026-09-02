# SmartPark AI Occupancy Simulator

This small development CLI simulates the physical `FREE` and `OCCUPIED` observations that would normally come from the camera or parking sensors. It is a testing and hackathon fallback tool, not the production computer-vision implementation.

## Run

Start the SmartPark FastAPI backend at `http://127.0.0.1:8000`, then run from the repository root:

```bash
python3 simulator/occupancy_simulator.py
```

Choose an action and enter either a live slot name such as `P3` or its displayed backend ID. The simulator fetches `/api/slots`, uses that slot's current `configured_source`, and sends the observation through `POST /api/slots/occupancy`. It never writes to SQLite directly and does not reproduce reservation logic.

Example:

```text
1. Set slot OCCUPIED
2. Set slot FREE
3. Toggle slot
4. Refresh
5. Exit

Choose a command: 3
Slot name or backend ID (for example P3 or 3): P5
P5 → OCCUPIED ✓ (source: SENSOR)
```

To use a different backend URL, set `SMARTPARK_API_URL` before running the command.
