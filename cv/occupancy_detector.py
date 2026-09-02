"""SmartPark AI camera occupancy detector.

This module deliberately communicates with SmartPark only through its REST API.
It never imports backend models and never opens the SQLite database.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Callable, Iterable, Mapping, Sequence


SCRIPT_DIR = Path(__file__).resolve().parent
DEFAULT_CALIBRATION_PATH = SCRIPT_DIR / "parking_slots.json"
DEFAULT_OUTPUT_PATH = SCRIPT_DIR / "outputs" / "processed.mp4"
DEFAULT_MODEL_PATH = SCRIPT_DIR / "yolo11n.pt"
DEFAULT_API_BASE_URL = "http://127.0.0.1:8000"
VEHICLE_CLASS_IDS = (2, 3, 5, 7)  # COCO: car, motorcycle, bus, truck
VALID_STATES = frozenset({"FREE", "OCCUPIED"})
VALID_SOURCES = frozenset({"CAMERA", "SENSOR"})


class CalibrationError(ValueError):
    """Raised when the slot calibration file is missing or malformed."""


Point = tuple[int, int]
FloatPoint = tuple[float, float]


def polygon_area(points: Sequence[tuple[float, float]]) -> float:
    """Return polygon area using the shoelace formula."""
    if len(points) < 3:
        return 0.0
    signed_double_area = sum(
        x1 * y2 - x2 * y1
        for (x1, y1), (x2, y2) in zip(points, (*points[1:], points[0]))
    )
    return abs(signed_double_area) / 2.0


def normalize_polygon_points(points: Sequence[tuple[float, float]]) -> tuple[Point, ...]:
    """Normalize four convex corner points into a stable clockwise image order."""
    if len(points) != 4:
        raise CalibrationError("Each parking slot must have exactly 4 corner points.")
    rounded = [(round(float(x)), round(float(y))) for x, y in points]
    if len(set(rounded)) != 4:
        raise CalibrationError("A parking polygon cannot contain duplicate corner points.")

    center_x = sum(x for x, _ in rounded) / 4.0
    center_y = sum(y for _, y in rounded) / 4.0
    ordered = sorted(
        rounded,
        key=lambda point: math.atan2(point[1] - center_y, point[0] - center_x),
    )
    start = min(range(4), key=lambda index: (sum(ordered[index]), ordered[index][1]))
    ordered = ordered[start:] + ordered[:start]

    cross_products = []
    for index in range(4):
        a = ordered[index]
        b = ordered[(index + 1) % 4]
        c = ordered[(index + 2) % 4]
        cross_products.append(
            (b[0] - a[0]) * (c[1] - b[1])
            - (b[1] - a[1]) * (c[0] - b[0])
        )
    if any(value == 0 for value in cross_products) or not (
        all(value > 0 for value in cross_products)
        or all(value < 0 for value in cross_products)
    ):
        raise CalibrationError(
            "The four corners must form a non-crossing convex parking polygon."
        )
    if polygon_area(ordered) < 1.0:
        raise CalibrationError("Parking polygon area is too small.")
    return tuple(ordered)


@dataclass(frozen=True)
class SlotPolygon:
    id: int
    name: str
    points: tuple[Point, ...]

    @property
    def area(self) -> float:
        return polygon_area(self.points)

    @property
    def label_position(self) -> Point:
        return (
            round(sum(x for x, _ in self.points) / len(self.points)),
            min(y for _, y in self.points),
        )


@dataclass(frozen=True)
class Calibration:
    camera_id: str
    frame_width: int
    frame_height: int
    slots: tuple[SlotPolygon, ...]


@dataclass(frozen=True)
class Detection:
    x1: float
    y1: float
    x2: float
    y2: float
    class_name: str
    confidence: float


@dataclass(frozen=True)
class StableChange:
    slot_id: int
    previous: str | None
    current: str


def load_calibration(path: str | Path) -> Calibration:
    calibration_path = Path(path)
    try:
        raw = json.loads(calibration_path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise CalibrationError(
            f"Calibration file not found: {calibration_path}. Run select_slots.py first."
        ) from exc
    except json.JSONDecodeError as exc:
        raise CalibrationError(f"Invalid JSON in {calibration_path}: {exc}") from exc

    try:
        camera_id = str(raw["camera_id"]).strip()
        frame_width = int(raw["frame_width"])
        frame_height = int(raw["frame_height"])
        raw_slots = raw["slots"]
    except (KeyError, TypeError, ValueError) as exc:
        raise CalibrationError(
            "Calibration is incomplete. Run select_slots.py to select P1-P8."
        ) from exc

    if not camera_id or frame_width <= 0 or frame_height <= 0:
        raise CalibrationError(
            "Calibration needs a camera_id and positive frame dimensions. "
            "Run select_slots.py again."
        )
    if not isinstance(raw_slots, list) or len(raw_slots) != 8:
        raise CalibrationError(
            f"Calibration must contain exactly 8 slots; found "
            f"{len(raw_slots) if isinstance(raw_slots, list) else 0}."
        )

    slots: list[SlotPolygon] = []
    try:
        for item in raw_slots:
            slot_id = int(item["slot_id"] if "slot_id" in item else item["id"])
            slot_name = str(item["label"] if "label" in item else item["name"])
            if "polygon" in item:
                points = normalize_polygon_points(item["polygon"])
            elif all(key in item for key in ("x", "y", "width", "height")):
                x = int(item["x"])
                y = int(item["y"])
                width = int(item["width"])
                height = int(item["height"])
                points = normalize_polygon_points(
                    ((x, y), (x + width, y), (x + width, y + height), (x, y + height))
                )
            else:
                x1 = int(item["x1"])
                y1 = int(item["y1"])
                x2 = int(item["x2"])
                y2 = int(item["y2"])
                points = normalize_polygon_points(
                    ((x1, y1), (x2, y1), (x2, y2), (x1, y2))
                )
            slot = SlotPolygon(id=slot_id, name=slot_name, points=points)
            slots.append(slot)
    except CalibrationError:
        raise
    except (KeyError, TypeError, ValueError) as exc:
        raise CalibrationError(
            "Every slot needs slot_id, label, and four polygon points."
        ) from exc

    expected_ids = list(range(1, 9))
    if [slot.id for slot in slots] != expected_ids:
        raise CalibrationError("Slot IDs must be ordered 1 through 8 (P1 through P8).")
    if [slot.name for slot in slots] != [f"P{i}" for i in expected_ids]:
        raise CalibrationError("Slot names must be ordered P1 through P8.")

    for slot in slots:
        if any(x < 0 or y < 0 for x, y in slot.points):
            raise CalibrationError(f"{slot.name} has a point outside the calibration frame.")
        if any(x > frame_width or y > frame_height for x, y in slot.points):
            raise CalibrationError(f"{slot.name} extends outside the calibration frame.")

    return Calibration(camera_id, frame_width, frame_height, tuple(slots))


def save_calibration(path: str | Path, calibration: Calibration) -> None:
    """Write a validated calibration in a stable, human-readable format."""
    payload = {
        "camera_id": calibration.camera_id,
        "frame_width": calibration.frame_width,
        "frame_height": calibration.frame_height,
        "slots": [
            {
                "slot_id": slot.id,
                "label": slot.name,
                "polygon": [[x, y] for x, y in slot.points],
            }
            for slot in calibration.slots
        ],
    }
    target = Path(path)
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")


def scale_slots(
    calibration: Calibration, target_width: int, target_height: int
) -> tuple[SlotPolygon, ...]:
    if target_width <= 0 or target_height <= 0:
        raise ValueError("Target frame dimensions must be positive.")
    scale_x = target_width / calibration.frame_width
    scale_y = target_height / calibration.frame_height
    return tuple(
        SlotPolygon(
            id=slot.id,
            name=slot.name,
            points=tuple(
                (round(x * scale_x), round(y * scale_y)) for x, y in slot.points
            ),
        )
        for slot in calibration.slots
    )


def _clip_polygon(
    points: Sequence[FloatPoint],
    inside: Callable[[FloatPoint], bool],
    intersect: Callable[[FloatPoint, FloatPoint], FloatPoint],
) -> list[FloatPoint]:
    if not points:
        return []
    output: list[FloatPoint] = []
    previous = points[-1]
    previous_inside = inside(previous)
    for current in points:
        current_inside = inside(current)
        if current_inside:
            if not previous_inside:
                output.append(intersect(previous, current))
            output.append(current)
        elif previous_inside:
            output.append(intersect(previous, current))
        previous = current
        previous_inside = current_inside
    return output


def _clip_polygon_to_box(
    points: Sequence[tuple[float, float]], detection: Detection
) -> list[FloatPoint]:
    if detection.x2 <= detection.x1 or detection.y2 <= detection.y1:
        return []
    clipped: list[FloatPoint] = [(float(x), float(y)) for x, y in points]

    def vertical(boundary: float, start: FloatPoint, end: FloatPoint) -> FloatPoint:
        fraction = (boundary - start[0]) / (end[0] - start[0])
        return boundary, start[1] + fraction * (end[1] - start[1])

    def horizontal(boundary: float, start: FloatPoint, end: FloatPoint) -> FloatPoint:
        fraction = (boundary - start[1]) / (end[1] - start[1])
        return start[0] + fraction * (end[0] - start[0]), boundary

    clipped = _clip_polygon(
        clipped,
        lambda point: point[0] >= detection.x1,
        lambda start, end: vertical(detection.x1, start, end),
    )
    clipped = _clip_polygon(
        clipped,
        lambda point: point[0] <= detection.x2,
        lambda start, end: vertical(detection.x2, start, end),
    )
    clipped = _clip_polygon(
        clipped,
        lambda point: point[1] >= detection.y1,
        lambda start, end: horizontal(detection.y1, start, end),
    )
    return _clip_polygon(
        clipped,
        lambda point: point[1] <= detection.y2,
        lambda start, end: horizontal(detection.y2, start, end),
    )


def intersection_over_slot(detection: Detection, slot: SlotPolygon) -> float:
    """Return vehicle-box/polygon intersection divided by parking polygon area."""
    intersection = _clip_polygon_to_box(slot.points, detection)
    return polygon_area(intersection) / slot.area if intersection else 0.0


def evaluate_occupancy(
    detections: Iterable[Detection],
    slots: Sequence[SlotPolygon],
    overlap_threshold: float,
) -> tuple[dict[int, str], dict[int, float]]:
    if not 0.0 <= overlap_threshold <= 1.0:
        raise ValueError("Overlap threshold must be between 0 and 1.")
    detection_list = tuple(detections)
    scores = {
        slot.id: max(
            (intersection_over_slot(detection, slot) for detection in detection_list),
            default=0.0,
        )
        for slot in slots
    }
    states = {
        slot.id: "OCCUPIED" if scores[slot.id] >= overlap_threshold else "FREE"
        for slot in slots
    }
    return states, scores


class StableStateTracker:
    """Confirm a changed state only after N consecutive processed observations."""

    def __init__(
        self, slot_ids: Iterable[int] = (), confirmation_frames: int = 3
    ) -> None:
        if confirmation_frames <= 0:
            raise ValueError("confirmation_frames must be positive.")
        self.confirmation_frames = confirmation_frames
        normalized_ids = tuple(dict.fromkeys(self._normalize_slot_id(slot_id) for slot_id in slot_ids))
        self.stable_states: dict[int, str | None] = {
            slot_id: None for slot_id in normalized_ids
        }
        self._candidates: dict[int, str | None] = {
            slot_id: None for slot_id in normalized_ids
        }
        self._counts: dict[int, int] = {slot_id: 0 for slot_id in normalized_ids}

    @staticmethod
    def _normalize_slot_id(slot_id: object) -> int:
        try:
            normalized = int(slot_id)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Invalid slot ID: {slot_id!r}") from exc
        if normalized <= 0:
            raise ValueError(f"Slot ID must be positive: {slot_id!r}")
        return normalized

    def _ensure_slot(self, slot_id: int) -> None:
        if slot_id not in self.stable_states:
            self.stable_states[slot_id] = None
            self._candidates[slot_id] = None
            self._counts[slot_id] = 0

    def update(self, observations: Mapping[int, str]) -> list[StableChange]:
        changes: list[StableChange] = []
        normalized_observations: dict[int, str] = {}
        for raw_slot_id, state in observations.items():
            slot_id = self._normalize_slot_id(raw_slot_id)
            if state not in VALID_STATES:
                raise ValueError(f"Invalid observation for slot {slot_id}: {state!r}")
            normalized_observations[slot_id] = state

        for slot_id, state in normalized_observations.items():
            self._ensure_slot(slot_id)

            if state == self.stable_states[slot_id]:
                self._candidates[slot_id] = None
                self._counts[slot_id] = 0
                continue

            if state == self._candidates[slot_id]:
                self._counts[slot_id] += 1
            else:
                self._candidates[slot_id] = state
                self._counts[slot_id] = 1

            if self._counts[slot_id] >= self.confirmation_frames:
                previous = self.stable_states[slot_id]
                self.stable_states[slot_id] = state
                self._candidates[slot_id] = None
                self._counts[slot_id] = 0
                changes.append(StableChange(slot_id, previous, state))
        return changes


class SmartParkClient:
    """Small REST-only client for the existing SmartPark backend contract."""

    def __init__(
        self,
        base_url: str,
        timeout_seconds: float = 5.0,
        session: Any | None = None,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout_seconds = timeout_seconds
        if session is None:
            try:
                import requests
            except ImportError as exc:
                raise RuntimeError(
                    "The requests package is required. Install cv/requirements.txt."
                ) from exc
            session = requests.Session()
        self.session = session

    def fetch_slots(self) -> list[dict[str, Any]]:
        response = self.session.get(
            f"{self.base_url}/api/slots", timeout=self.timeout_seconds
        )
        response.raise_for_status()
        payload = response.json()
        slots = payload.get("slots") if isinstance(payload, dict) else None
        if not isinstance(slots, list):
            raise ValueError("Backend /api/slots response did not contain a slots list.")
        return slots

    def post_occupancy(self, slot_id: int, state: str, source: str = "CAMERA") -> dict[str, Any]:
        response = self.session.post(
            f"{self.base_url}/api/slots/occupancy",
            json={"slot_id": slot_id, "physical_status": state, "source": source},
            timeout=self.timeout_seconds,
        )
        response.raise_for_status()
        payload = response.json()
        if not isinstance(payload, dict):
            raise ValueError("Backend occupancy response was not a JSON object.")
        return payload


class BackendSynchronizer:
    """Own backend configuration refresh, state-change posting, and retries."""

    def __init__(
        self,
        client: SmartParkClient,
        refresh_seconds: float = 15.0,
        retry_seconds: float = 5.0,
        log: Callable[[str], None] = print,
    ) -> None:
        self.client = client
        self.refresh_seconds = refresh_seconds
        self.retry_seconds = retry_seconds
        self.log = log
        self.configured_sources: dict[int, str] = {}
        self.slot_names: dict[int, str] = {}
        self.desired_states: dict[int, str] = {}
        self.confirmed_states: dict[int, str] = {}
        self._last_refresh_attempt: float | None = None
        self._last_post_attempt: dict[int, float] = {}
        self._last_attempted_state: dict[int, str] = {}
        self._last_skipped: dict[int, tuple[str, str]] = {}

    def refresh_configuration(self, now: float, force: bool = False) -> bool:
        if (
            not force
            and self._last_refresh_attempt is not None
            and now - self._last_refresh_attempt < self.refresh_seconds
        ):
            return bool(self.configured_sources)
        self._last_refresh_attempt = now
        try:
            slots = self.client.fetch_slots()
            sources: dict[int, str] = {}
            names: dict[int, str] = {}
            for item in slots:
                slot_id = int(item["id"])
                source = str(item["configured_source"]).upper()
                if source not in VALID_SOURCES:
                    raise ValueError(f"Slot {slot_id} has unsupported source {source!r}.")
                sources[slot_id] = source
                names[slot_id] = str(item.get("name", f"P{slot_id}"))
            previous_sources = self.configured_sources
            configuration_changed = sources != previous_sources
            for slot_id, source in sources.items():
                if previous_sources.get(slot_id) not in (None, source):
                    # Ownership changed, so a prior camera acknowledgement no
                    # longer proves what the backend currently contains.
                    self.confirmed_states.pop(slot_id, None)
                    self._last_attempted_state.pop(slot_id, None)
            self.configured_sources = sources
            self.slot_names = names
            if configuration_changed:
                self.log(f"[API] Loaded configured_source for {len(sources)} slots.")
            return True
        except Exception as exc:  # Backend/network failures must not stop video processing.
            self.log(f"[API] Backend unavailable; continuing locally ({exc}).")
            return False

    def observe(self, changes: Iterable[StableChange]) -> None:
        for change in changes:
            self.desired_states[change.slot_id] = change.current
            name = self.slot_names.get(change.slot_id, f"P{change.slot_id}")
            if change.previous is None:
                self.log(f"[CV] {name} stable as {change.current}.")
            else:
                self.log(f"[CV] {name} {change.previous} -> {change.current}.")

    def tick(self, now: float) -> None:
        self.refresh_configuration(now)
        for slot_id, desired_state in self.desired_states.items():
            source = self.configured_sources.get(slot_id)
            if source is None:
                continue
            if source != "CAMERA":
                signature = (source, desired_state)
                if self._last_skipped.get(slot_id) != signature:
                    name = self.slot_names.get(slot_id, f"P{slot_id}")
                    self.log(
                        f"[API] {name} is {source}-owned; camera state {desired_state} not submitted."
                    )
                    self._last_skipped[slot_id] = signature
                continue

            self._last_skipped.pop(slot_id, None)
            if self.confirmed_states.get(slot_id) == desired_state:
                continue
            last_attempt = self._last_post_attempt.get(slot_id)
            attempted_state = self._last_attempted_state.get(slot_id)
            if (
                attempted_state == desired_state
                and last_attempt is not None
                and now - last_attempt < self.retry_seconds
            ):
                continue

            self._last_post_attempt[slot_id] = now
            self._last_attempted_state[slot_id] = desired_state
            name = self.slot_names.get(slot_id, f"P{slot_id}")
            try:
                self.client.post_occupancy(slot_id, desired_state, source="CAMERA")
                self.confirmed_states[slot_id] = desired_state
                self.log(f"[API] Synced {name}={desired_state} from CAMERA.")
            except Exception as exc:
                # The request may have failed before or after reaching the server, so
                # the backend state remains unconfirmed until a successful retry.
                self.confirmed_states.pop(slot_id, None)
                self.log(
                    f"[API] Could not sync {name}={desired_state}; will retry ({exc})."
                )

    def source_for(self, slot_id: int) -> str:
        return self.configured_sources.get(slot_id, "UNKNOWN")


def choose_device(torch_module: Any | None = None) -> str:
    if torch_module is None:
        try:
            import torch as torch_module
        except ImportError as exc:
            raise RuntimeError(
                "PyTorch is required. Install cv/requirements.txt before running detection."
            ) from exc
    try:
        return "mps" if torch_module.backends.mps.is_available() else "cpu"
    except (AttributeError, RuntimeError):
        return "cpu"


def _parse_detections(result: Any) -> list[Detection]:
    boxes = result.boxes
    if boxes is None:
        return []
    coordinates = boxes.xyxy.detach().cpu().tolist()
    confidences = boxes.conf.detach().cpu().tolist()
    class_ids = boxes.cls.detach().cpu().tolist()
    names = result.names
    detections: list[Detection] = []
    for coords, confidence, class_id in zip(coordinates, confidences, class_ids):
        class_index = int(class_id)
        class_name = names[class_index] if isinstance(names, dict) else names[class_index]
        detections.append(
            Detection(
                x1=float(coords[0]),
                y1=float(coords[1]),
                x2=float(coords[2]),
                y2=float(coords[3]),
                class_name=str(class_name),
                confidence=float(confidence),
            )
        )
    return detections


def _predict(model: Any, frame: Any, confidence: float, device: str) -> list[Detection]:
    result = model.predict(
        source=frame,
        conf=confidence,
        classes=list(VEHICLE_CLASS_IDS),
        device=device,
        verbose=False,
    )[0]
    return _parse_detections(result)


def predict_with_device_fallback(
    model: Any,
    frame: Any,
    confidence: float,
    device: str,
    log: Callable[[str], None] = print,
) -> tuple[list[Detection], str]:
    """Run inference and retry once on CPU if the selected MPS path fails."""
    try:
        return _predict(model, frame, confidence, device), device
    except Exception as exc:
        if device != "mps":
            raise
        log(f"[MODEL] MPS inference failed; retrying on CPU ({exc}).")
        return _predict(model, frame, confidence, "cpu"), "cpu"


def _draw_text(cv2: Any, frame: Any, text: str, x: int, y: int, color: tuple[int, int, int]) -> None:
    font = cv2.FONT_HERSHEY_SIMPLEX
    scale = 0.48
    thickness = 1
    (width, height), baseline = cv2.getTextSize(text, font, scale, thickness)
    top = max(0, y - height - baseline - 5)
    cv2.rectangle(frame, (x, top), (x + width + 6, y), (20, 20, 20), -1)
    cv2.putText(frame, text, (x + 3, y - 4), font, scale, color, thickness, cv2.LINE_AA)


def draw_visualization(
    cv2: Any,
    frame: Any,
    slots: Sequence[SlotPolygon],
    states: Mapping[int, str],
    sources: Mapping[int, str],
    scores: Mapping[int, float],
    detections: Sequence[Detection],
    debug: bool,
    model_name: str,
    device: str,
    inference_fps: float,
) -> Any:
    import numpy as np

    for slot in slots:
        state = states.get(slot.id, "FREE")
        color = (0, 0, 255) if state == "OCCUPIED" else (0, 190, 0)
        contour = np.asarray(slot.points, dtype=np.int32).reshape((-1, 1, 2))
        cv2.polylines(frame, [contour], True, color, 2, cv2.LINE_AA)
        source = sources.get(slot.id, "LOCAL")
        source_label = "SENSOR-owned" if source == "SENSOR" else source
        label = f"{slot.name} - {state} [{source_label}]"
        if debug:
            label += f" overlap={scores.get(slot.id, 0.0):.2f}"
        label_x, label_y = slot.label_position
        _draw_text(cv2, frame, label, label_x, max(18, label_y), color)

    if debug:
        for detection in detections:
            p1 = (round(detection.x1), round(detection.y1))
            p2 = (round(detection.x2), round(detection.y2))
            cv2.rectangle(frame, p1, p2, (0, 215, 255), 2)
            _draw_text(
                cv2,
                frame,
                f"{detection.class_name} {detection.confidence:.2f}",
                p1[0],
                max(18, p1[1]),
                (0, 215, 255),
            )
        _draw_text(
            cv2,
            frame,
            f"model={model_name} device={device} inference_fps={inference_fps:.1f}",
            8,
            24,
            (255, 255, 255),
        )
    return frame


def _positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return parsed


def _unit_float(value: str) -> float:
    parsed = float(value)
    if not 0.0 <= parsed <= 1.0:
        raise argparse.ArgumentTypeError("must be between 0 and 1")
    return parsed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Detect vehicle occupancy in eight calibrated SmartPark slots."
    )
    parser.add_argument("--video", required=True, help="Path to the input MP4 video.")
    parser.add_argument(
        "--slots", default=str(DEFAULT_CALIBRATION_PATH), help="Slot calibration JSON path."
    )
    parser.add_argument(
        "--model", default=str(DEFAULT_MODEL_PATH), help="Ultralytics model name/path."
    )
    parser.add_argument(
        "--confidence",
        type=_unit_float,
        default=float(os.getenv("YOLO_CONFIDENCE", "0.35")),
        help="YOLO confidence threshold (default: 0.35).",
    )
    parser.add_argument(
        "--overlap-threshold",
        type=_unit_float,
        default=float(os.getenv("OVERLAP_THRESHOLD", "0.20")),
        help="Minimum vehicle/slot-area overlap (default: 0.20).",
    )
    parser.add_argument(
        "--confirmation-frames",
        type=_positive_int,
        default=int(os.getenv("STATE_CONFIRMATION_FRAMES", "3")),
        help="Consecutive processed observations required for a state change (default: 3).",
    )
    parser.add_argument(
        "--process-every",
        type=_positive_int,
        default=int(os.getenv("PROCESS_EVERY_N_FRAMES", "2")),
        help="Run inference every N video frames (default: 2).",
    )
    parser.add_argument(
        "--backend-refresh-seconds", type=float, default=15.0, help=argparse.SUPPRESS
    )
    parser.add_argument("--post-retry-seconds", type=float, default=5.0, help=argparse.SUPPRESS)
    parser.add_argument("--dry-run", action="store_true", help="Never contact or update the backend.")
    parser.add_argument("--debug", action="store_true", help="Draw detections and diagnostics.")
    parser.add_argument(
        "--save-output", action="store_true", help="Save annotated video to cv/outputs."
    )
    parser.add_argument(
        "--output", default=str(DEFAULT_OUTPUT_PATH), help=argparse.SUPPRESS
    )
    parser.add_argument(
        "--no-display", action="store_true", help="Process without opening a preview window."
    )
    return parser


def run(args: argparse.Namespace) -> None:
    calibration = load_calibration(args.slots)
    video_path = Path(args.video)
    if not video_path.is_file():
        raise FileNotFoundError(f"Input video not found: {video_path}")

    try:
        import cv2
        from ultralytics import YOLO
    except ImportError as exc:
        raise RuntimeError(
            "Computer-vision dependencies are missing. Install cv/requirements.txt."
        ) from exc

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"OpenCV could not open video: {video_path}")

    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT))
    video_fps = capture.get(cv2.CAP_PROP_FPS)
    if width <= 0 or height <= 0:
        capture.release()
        raise RuntimeError("Video reported invalid frame dimensions.")
    if video_fps <= 0:
        video_fps = 30.0

    slots = scale_slots(calibration, width, height)
    tracker = StableStateTracker((slot.id for slot in slots), args.confirmation_frames)
    synchronizer: BackendSynchronizer | None = None
    if args.dry_run:
        print("[API] Dry run enabled: no backend reads or writes will occur.")
    else:
        api_base_url = os.getenv("SMARTPARK_API_BASE_URL", DEFAULT_API_BASE_URL)
        synchronizer = BackendSynchronizer(
            SmartParkClient(api_base_url),
            refresh_seconds=args.backend_refresh_seconds,
            retry_seconds=args.post_retry_seconds,
        )
        synchronizer.refresh_configuration(time.monotonic(), force=True)

    print(f"[SLOTS] Loaded 8 calibrated spaces from {args.slots}.")
    print(f"[MODEL] Loading {args.model}...")
    model = YOLO(args.model)
    device = choose_device()
    print(f"[MODEL] Using {device.upper()}.")
    print(f"[VIDEO] {width}x{height} @ {video_fps:.2f} FPS ({video_path}).")
    print(f"[CV] Camera ID: {calibration.camera_id}.")
    print("[CV] Press q or Esc in the preview window to stop.")

    writer = None
    if args.save_output:
        output_path = Path(args.output)
        output_path.parent.mkdir(parents=True, exist_ok=True)
        writer = cv2.VideoWriter(
            str(output_path),
            cv2.VideoWriter_fourcc(*"mp4v"),
            video_fps,
            (width, height),
        )
        if not writer.isOpened():
            capture.release()
            raise RuntimeError(f"OpenCV could not create output video: {output_path}")
        print(f"[CV] Saving annotated output to {output_path}")

    frame_number = 0
    detections: list[Detection] = []
    latest_states = {slot.id: "FREE" for slot in slots}
    latest_scores = {slot.id: 0.0 for slot in slots}
    inference_fps = 0.0

    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            if frame_number % args.process_every == 0:
                started = time.perf_counter()
                detections, device = predict_with_device_fallback(
                    model, frame, args.confidence, device
                )
                elapsed = max(time.perf_counter() - started, 1e-9)
                inference_fps = 1.0 / elapsed
                latest_states, latest_scores = evaluate_occupancy(
                    detections, slots, args.overlap_threshold
                )
                changes = tracker.update(latest_states)
                if synchronizer is not None:
                    synchronizer.observe(changes)
                    synchronizer.tick(time.monotonic())
                elif changes:
                    for change in changes:
                        previous = change.previous or "UNCONFIRMED"
                        print(f"[CV] P{change.slot_id} {previous} -> {change.current} (dry run).")

            display_states = {
                slot.id: tracker.stable_states[slot.id] or latest_states[slot.id] for slot in slots
            }
            sources = {
                slot.id: synchronizer.source_for(slot.id) if synchronizer else "LOCAL"
                for slot in slots
            }
            annotated = draw_visualization(
                cv2,
                frame,
                slots,
                display_states,
                sources,
                latest_scores,
                detections,
                args.debug,
                Path(args.model).name,
                device,
                inference_fps,
            )
            if writer is not None:
                writer.write(annotated)
            if not args.no_display:
                cv2.imshow("SmartPark AI - CV Occupancy", annotated)
                if cv2.waitKey(1) & 0xFF in (ord("q"), 27):
                    break
            frame_number += 1
    finally:
        capture.release()
        if writer is not None:
            writer.release()
        if not args.no_display:
            cv2.destroyAllWindows()

    print(f"[CV] Finished after {frame_number} frames.")


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        run(args)
    except (CalibrationError, FileNotFoundError, RuntimeError, ValueError) as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
