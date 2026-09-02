"""Interactive four-point polygon calibration for eight SmartPark slots."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any, Sequence

try:  # Support both `python cv/select_slots.py` and `import cv.select_slots`.
    from .occupancy_detector import (
        Calibration,
        CalibrationError,
        DEFAULT_CALIBRATION_PATH,
        Point,
        SlotPolygon,
        normalize_polygon_points,
        save_calibration,
    )
except ImportError:
    from occupancy_detector import (
        Calibration,
        CalibrationError,
        DEFAULT_CALIBRATION_PATH,
        Point,
        SlotPolygon,
        normalize_polygon_points,
        save_calibration,
    )


class CalibrationCancelled(RuntimeError):
    """Raised when the operator exits without saving all eight slots."""


class PolygonCalibrationState:
    """UI-independent state machine for selecting exactly eight quadrilaterals."""

    def __init__(self, slot_count: int = 8) -> None:
        self.slot_count = slot_count
        self.completed: list[tuple[Point, ...]] = []
        self.current_points: list[Point] = []
        self.message = "Click the four corners of P1."

    @property
    def done(self) -> bool:
        return len(self.completed) == self.slot_count

    @property
    def current_slot_id(self) -> int:
        return min(len(self.completed) + 1, self.slot_count)

    @property
    def current_slot_name(self) -> str:
        return f"P{self.current_slot_id}"

    def add_point(self, point: Point) -> bool:
        if self.done:
            return False
        if len(self.current_points) < 3:
            self.current_points.append(point)
            self.message = f"{self.current_slot_name}: {len(self.current_points)}/4 corners selected."
            return False

        try:
            polygon = normalize_polygon_points((*self.current_points, point))
        except CalibrationError as exc:
            self.message = f"Invalid fourth corner: {exc} Click it again or press R."
            return False

        completed_name = self.current_slot_name
        self.completed.append(polygon)
        self.current_points.clear()
        if self.done:
            self.message = "All 8 slots complete. Press Enter or S to save."
        else:
            self.message = f"{completed_name} complete. Now click {self.current_slot_name}."
        return True

    def undo(self) -> bool:
        if self.current_points:
            self.current_points.pop()
            self.message = f"Undid last point for {self.current_slot_name}."
            return True
        if self.completed:
            reopened_id = len(self.completed)
            previous = self.completed.pop()
            self.current_points = list(previous[:-1])
            self.message = f"Reopened P{reopened_id}; select its fourth corner again."
            return True
        self.message = "Nothing to undo."
        return False

    def reset_current(self) -> None:
        self.current_points.clear()
        self.message = f"Reset {self.current_slot_name}; click its four corners again."

    def build_calibration(
        self,
        camera_id: str,
        frame_width: int,
        frame_height: int,
        preview_scale: float = 1.0,
    ) -> Calibration:
        if not self.done:
            raise CalibrationError("Exactly eight completed polygons are required before saving.")
        if preview_scale <= 0:
            raise ValueError("preview_scale must be positive.")
        slots = tuple(
            SlotPolygon(
                id=index,
                name=f"P{index}",
                points=normalize_polygon_points(
                    tuple(
                        (round(x / preview_scale), round(y / preview_scale))
                        for x, y in polygon
                    )
                ),
            )
            for index, polygon in enumerate(self.completed, start=1)
        )
        return Calibration(camera_id, frame_width, frame_height, slots)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description="Click four corners for each parking slot, ordered P1 through P8."
    )
    parser.add_argument("--video", required=True, help="Path to the calibration MP4 video.")
    parser.add_argument(
        "--output", default=str(DEFAULT_CALIBRATION_PATH), help="Calibration JSON output path."
    )
    parser.add_argument("--camera-id", default="CAM_01", help="Camera identifier to store.")
    return parser


def _draw_polygon(
    cv2: Any,
    np: Any,
    image: Any,
    points: Sequence[Point],
    color: tuple[int, int, int],
) -> None:
    contour = np.asarray(points, dtype=np.int32).reshape((-1, 1, 2))
    cv2.polylines(image, [contour], True, color, 2, cv2.LINE_AA)


def _render_calibration(cv2: Any, np: Any, frame: Any, state: PolygonCalibrationState) -> Any:
    canvas = frame.copy()
    overlay = frame.copy()

    for index, polygon in enumerate(state.completed, start=1):
        contour = np.asarray(polygon, dtype=np.int32).reshape((-1, 1, 2))
        cv2.fillPoly(overlay, [contour], (60, 210, 255))
        _draw_polygon(cv2, np, canvas, polygon, (0, 215, 255))
        center_x = round(sum(x for x, _ in polygon) / 4)
        center_y = round(sum(y for _, y in polygon) / 4)
        cv2.putText(
            canvas,
            f"P{index}",
            (center_x - 12, center_y),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.65,
            (255, 255, 255),
            2,
            cv2.LINE_AA,
        )
    cv2.addWeighted(overlay, 0.18, canvas, 0.82, 0, canvas)

    if state.current_points:
        for number, point in enumerate(state.current_points, start=1):
            cv2.circle(canvas, point, 6, (255, 120, 0), -1, cv2.LINE_AA)
            cv2.putText(
                canvas,
                str(number),
                (point[0] + 7, point[1] - 7),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (255, 255, 255),
                1,
                cv2.LINE_AA,
            )
        if len(state.current_points) > 1:
            contour = np.asarray(state.current_points, dtype=np.int32).reshape((-1, 1, 2))
            cv2.polylines(canvas, [contour], False, (255, 120, 0), 2, cv2.LINE_AA)

    width = canvas.shape[1]
    cv2.rectangle(canvas, (0, 0), (width, 96), (18, 18, 18), -1)
    heading = (
        "All 8 parking slots calibrated"
        if state.done
        else f"Calibrating {state.current_slot_name} ({state.current_slot_id}/8)"
    )
    cv2.putText(
        canvas,
        heading,
        (14, 25),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.65,
        (255, 255, 255),
        2,
        cv2.LINE_AA,
    )
    cv2.putText(
        canvas,
        "Click 4 corners clockwise: top-left -> top-right -> bottom-right -> bottom-left",
        (14, 49),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.48,
        (220, 220, 220),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        canvas,
        "Backspace/U: undo   R: reset current   Enter/S: save after P8   Q/Esc: cancel",
        (14, 72),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.46,
        (220, 220, 220),
        1,
        cv2.LINE_AA,
    )
    cv2.putText(
        canvas,
        state.message,
        (14, 91),
        cv2.FONT_HERSHEY_SIMPLEX,
        0.38,
        (90, 230, 255),
        1,
        cv2.LINE_AA,
    )
    return canvas


def run(args: argparse.Namespace) -> None:
    video_path = Path(args.video)
    if not video_path.is_file():
        raise FileNotFoundError(f"Input video not found: {video_path}")
    if not args.camera_id.strip():
        raise ValueError("camera-id cannot be empty.")

    try:
        import cv2
        import numpy as np
    except ImportError as exc:
        raise RuntimeError(
            "OpenCV and NumPy are required. Install cv/requirements.txt before calibrating."
        ) from exc

    capture = cv2.VideoCapture(str(video_path))
    if not capture.isOpened():
        raise RuntimeError(f"OpenCV could not open video: {video_path}")
    frame = None
    while True:
        ok, candidate = capture.read()
        if not ok:
            break
        if candidate is not None and candidate.size > 0:
            frame = candidate
            break
    capture.release()
    if frame is None:
        raise RuntimeError("Could not read a usable frame from the calibration video.")

    frame_height, frame_width = frame.shape[:2]
    preview_scale = min(1.0, 1400 / frame_width, 820 / frame_height)
    if preview_scale < 1.0:
        frame = cv2.resize(
            frame,
            (round(frame_width * preview_scale), round(frame_height * preview_scale)),
            interpolation=cv2.INTER_AREA,
        )

    state = PolygonCalibrationState()
    window_name = "SmartPark - 8-Slot Polygon Calibration"

    def on_mouse(event: int, x: int, y: int, _flags: int, _userdata: Any) -> None:
        if event == cv2.EVENT_LBUTTONDOWN:
            state.add_point((x, y))

    print("Click four corners clockwise for each slot: top-left, top-right, bottom-right, bottom-left.")
    print("Complete P1 through P8. Use U/Backspace to undo, R to reset, Q/Esc to cancel.")
    print("After P8, press Enter or S to save.")

    cv2.namedWindow(window_name, cv2.WINDOW_AUTOSIZE)
    cv2.setMouseCallback(window_name, on_mouse)
    should_save = False
    try:
        while True:
            cv2.imshow(window_name, _render_calibration(cv2, np, frame, state))
            key = cv2.waitKeyEx(20)
            key_code = key & 0xFF
            if key_code in (ord("q"), ord("Q"), 27):
                raise CalibrationCancelled("Calibration cancelled; no file was changed.")
            if key_code in (ord("u"), ord("U"), 8, 127):
                state.undo()
            elif key_code in (ord("r"), ord("R")):
                state.reset_current()
            elif state.done and key_code in (ord("s"), ord("S"), 10, 13):
                should_save = True
                break
    finally:
        cv2.destroyAllWindows()

    if not should_save:
        raise CalibrationCancelled("Calibration closed without saving.")
    calibration = state.build_calibration(
        args.camera_id.strip(), frame_width, frame_height, preview_scale
    )
    save_calibration(args.output, calibration)
    print(
        f"Saved 4-point polygons P1-P8 for {frame_width}x{frame_height} video to {args.output}"
    )


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        run(args)
    except (CalibrationCancelled, CalibrationError, FileNotFoundError, RuntimeError, ValueError) as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
