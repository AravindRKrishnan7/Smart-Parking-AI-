# SmartPark AI CV Occupancy

This folder contains the minimum camera pipeline for the eight SmartPark demo
slots. It detects COCO road-vehicle classes with the pretrained Ultralytics
`yolo11n.pt` model, converts detections into `FREE` / `OCCUPIED` slot states,
and sends confirmed CAMERA-owned changes through the existing FastAPI REST API.

It never imports backend code, opens SQLite, changes reservations, or writes to
the frontend. The backend remains the single source of truth.

## What it does

- Detects `car`, `motorcycle`, `bus`, and `truck`.
- Marks a slot occupied when vehicle-box intersection divided by the calibrated
  parking-polygon area is at least `0.20`.
- Runs inference every second video frame and requires three consecutive
  processed observations before confirming a state.
- Prefers Apple Metal (`mps`) when PyTorch reports it available, with automatic
  CPU fallback if MPS inference fails.
- Fetches `/api/slots` at startup and periodically thereafter. It posts only
  slots whose current backend `configured_source` is `CAMERA`; SENSOR-owned
  slots remain visible but are never written by this process.
- Posts each initial stable CAMERA state once, then only confirmed changes.
  Failed updates remain unconfirmed and retry at a controlled interval.
- Keeps processing locally when the backend is unavailable.

## Setup

From the repository root:

```bash
python3 -m venv cv/.venv
source cv/.venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r cv/requirements.txt
```

The first detector run downloads `yolo11n.pt` into `cv/` if it is not already
cached, so that run needs internet access. Model weights are ignored by Git. No
custom model training is required.

## The 13 steps to run after the parking video arrives

1. Copy the fixed-camera MP4 to `cv/parking_demo.mp4` (do not commit the video).
2. Create and activate the environment with `python3 -m venv cv/.venv` and
   `source cv/.venv/bin/activate`.
3. Install dependencies with `python -m pip install -r cv/requirements.txt`.
4. Run `python cv/select_slots.py --video cv/parking_demo.mp4`.
5. For each slot, click four visible corners clockwise in this order:
   top-left, top-right, bottom-right, bottom-left. The completed polygon is
   filled and labeled, then calibration automatically advances from P1 through
   P8. Press Enter or S after P8 to save.
6. Confirm that `cv/parking_slots.json` now contains the camera ID, source-frame
   dimensions, and eight four-point polygons. Runtime scaling handles a different input
   resolution automatically.
7. Run `python cv/occupancy_detector.py --video cv/parking_demo.mp4 --dry-run --debug`.
8. Inspect the green/red polygons and labels for all eight slots.
9. If needed, tune `--confidence` (default `0.35`) and
   `--overlap-threshold` (default `0.20`) while watching the labels and overlap
   values in debug mode.
10. Run the same dry run without `--debug` to check the clean judge-facing view.
11. Set `SMARTPARK_API_BASE_URL`; for the deployed backend use
    `export SMARTPARK_API_BASE_URL=https://smartpark-ai-backend.up.railway.app`.
12. Run live sync with
    `python cv/occupancy_detector.py --video cv/parking_demo.mp4`, then open the
    Vercel frontend at `https://smart-parking-ai-kohl.vercel.app` in a browser.
13. Confirm that CAMERA-owned slots update on the frontend and SENSOR-owned
    slots remain local-only. Add `--save-output` if an annotated recording is
    wanted at `cv/outputs/processed.mp4`; press `q` or Esc to stop cleanly.

## Useful commands

Headless dry run with an annotated file:

```bash
python cv/occupancy_detector.py \
  --video cv/parking_demo.mp4 \
  --dry-run \
  --debug \
  --save-output \
  --no-display
```

Integrated local-backend run:

```bash
SMARTPARK_API_BASE_URL=http://127.0.0.1:8000 \
python cv/occupancy_detector.py --video cv/parking_demo.mp4 --debug
```

The production backend URL can be supplied in the same variable, but do not run
an updating detector against production unless that deployment is intentionally
being used for the demo.

## Configuration

CLI options take the following defaults:

| Setting | Default | Environment alternative |
| --- | ---: | --- |
| YOLO confidence | `0.35` | `YOLO_CONFIDENCE` |
| Slot overlap threshold | `0.20` | `OVERLAP_THRESHOLD` |
| Confirmation observations | `3` | `STATE_CONFIRMATION_FRAMES` |
| Process every N frames | `2` | `PROCESS_EVERY_N_FRAMES` |
| Backend base URL | `http://127.0.0.1:8000` | `SMARTPARK_API_BASE_URL` |

Use `--help` for all runtime flags. `--dry-run` is deliberately stronger than
"do not POST": it performs no backend GETs or POSTs, making offline evaluation
safe and predictable.

## Calibration controls and JSON format

- **Left click:** add the next corner to the current slot.
- **Backspace or U:** undo the latest point. When the current slot is empty,
  this reopens the previously completed polygon for correction.
- **R:** clear the points currently being selected.
- **Q or Esc:** cancel without saving.
- **Enter or S:** save after all eight polygons are complete.

New calibrations use this primary format:

```json
{
  "camera_id": "CAM_01",
  "frame_width": 1920,
  "frame_height": 1080,
  "slots": [
    {
      "slot_id": 1,
      "label": "P1",
      "polygon": [[210, 260], [390, 245], [450, 520], [180, 535]]
    }
  ]
}
```

The loader temporarily accepts the earlier `x/y/width/height` form and the
`x1/y1/x2/y2` rectangle form, converting either to four polygon points in
memory. Saving always writes the polygon format.

## Calibration notes

Use a frame from the same fixed camera position used during the demo. Draw the
polygon on the actual parking bay footprint, not the entire driving aisle.
Overlapping polygons can cause one vehicle to occupy multiple slots. If the
camera moves, the crop changes, or the aspect ratio changes, recalibrate.

The checked-in `parking_slots.json` is intentionally uncalibrated rather than
containing invented coordinates. The detector will stop with a clear message
until the selector has saved eight real polygons.

The calibration preview is reduced to fit a typical laptop screen when needed.
Clicks are converted back to the original video coordinates before saving, so
`frame_width` and `frame_height` remain the source-video resolution. At runtime,
every polygon point is scaled independently if the processing resolution differs.

## Polygon occupancy calculation

YOLO still runs once on each processed full frame. For every detected vehicle,
its axis-aligned box is geometrically clipped against each convex four-point
parking polygon. The clipped intersection area and the parking polygon area are
computed with the shoelace formula:

`occupancy_score = vehicle_box_and_slot_polygon_intersection / slot_polygon_area`

This is equivalent to using binary masks for the area calculation, but avoids
allocating full-frame masks for every vehicle/slot comparison. Debug mode shows
the highest overlap score for each slot.

## Backend behavior and recovery

On a connected run, slot ownership is always read from `/api/slots`; it is not
hard-coded as P1-P4 versus P5-P8. An accepted update is sent to
`POST /api/slots/occupancy` with `source: "CAMERA"`. SENSOR-owned slots are
annotated with their source and skipped.

If the backend cannot be reached, video processing continues. Configuration is
retried periodically. A failed state update is not considered confirmed, and is
retried after a short delay instead of on every frame. Restarting the process
also performs one initial stable-state synchronization after the three-frame
confirmation window.

## Common troubleshooting

- **`Calibration needs ...`**: `parking_slots.json` is still the safe empty
  template. Run `select_slots.py` and click all eight four-point polygons.
- **No selector window**: run calibration from a logged-in macOS desktop
  session; OpenCV's ROI selector needs a GUI.
- **Model download fails**: restore internet access and retry once so
  Ultralytics can cache `yolo11n.pt`.
- **MPS error**: no action is normally needed; the detector reports the error
  once and retries the same inference on CPU.
- **Slots flicker or trigger together**: recalibrate tighter polygons first,
  then tune the confidence or overlap threshold in debug dry-run mode.
- **Backend warnings**: verify `SMARTPARK_API_BASE_URL` and `/health`. The video
  loop intentionally continues and retries.
