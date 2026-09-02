#!/usr/bin/env python3
"""Small interactive occupancy-event simulator for SmartPark AI."""

from __future__ import annotations

import json
import os
import sys
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen


DEFAULT_API_URL = "http://127.0.0.1:8000"
API_URL = os.environ.get("SMARTPARK_API_URL", DEFAULT_API_URL).rstrip("/")
REQUEST_TIMEOUT_SECONDS = 5


class SimulatorError(Exception):
    """An expected error that can be shown without a traceback."""


def _error_detail(error: HTTPError) -> str:
    try:
        body = json.loads(error.read().decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return error.reason or "Unknown backend error"

    detail = body.get("detail") if isinstance(body, dict) else None
    if isinstance(detail, str):
        return detail
    return "The backend rejected the request."


def _request_json(path: str, *, method: str = "GET", payload: dict[str, Any] | None = None) -> Any:
    body = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    request = Request(
        f"{API_URL}{path}",
        data=body,
        headers=headers,
        method=method,
    )

    try:
        with urlopen(request, timeout=REQUEST_TIMEOUT_SECONDS) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        detail = _error_detail(error)
        if error.code == 409:
            raise SimulatorError(f"Backend conflict (409): {detail}") from error
        if error.code == 422:
            raise SimulatorError(f"Backend validation error (422): {detail}") from error
        raise SimulatorError(f"Backend error ({error.code}): {detail}") from error
    except URLError as error:
        reason = getattr(error, "reason", "connection failed")
        raise SimulatorError(f"Cannot connect to {API_URL}: {reason}") from error
    except TimeoutError as error:
        raise SimulatorError(f"Connection to {API_URL} timed out.") from error
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise SimulatorError("Backend returned an invalid JSON response.") from error


def fetch_slots() -> list[dict[str, Any]]:
    data = _request_json("/api/slots")
    if not isinstance(data, dict) or not isinstance(data.get("slots"), list):
        raise SimulatorError("Backend returned an unexpected slot response.")

    slots = data["slots"]
    required_fields = {
        "id",
        "name",
        "physical_status",
        "reservation_status",
        "configured_source",
    }
    if any(not isinstance(slot, dict) or not required_fields.issubset(slot) for slot in slots):
        raise SimulatorError("Backend returned incomplete slot data.")
    return slots


def resolve_slot(slots: list[dict[str, Any]], selection: str) -> dict[str, Any] | None:
    normalized = selection.strip().upper()
    if not normalized:
        return None

    for slot in slots:
        if str(slot["name"]).upper() == normalized:
            return slot

    if normalized.isdigit():
        slot_id = int(normalized)
        for slot in slots:
            if slot["id"] == slot_id:
                return slot

    return None


def send_occupancy(slot: dict[str, Any], physical_status: str) -> dict[str, Any]:
    payload = {
        "slot_id": slot["id"],
        "physical_status": physical_status,
        "source": slot["configured_source"],
    }
    response = _request_json("/api/slots/occupancy", method="POST", payload=payload)
    if not isinstance(response, dict):
        raise SimulatorError("Backend returned an unexpected occupancy response.")
    return response


def print_slots(slots: list[dict[str, Any]]) -> None:
    print("\nCurrent Parking State\n")
    print(f"{'ID':<4} {'SLOT':<6} {'PHYSICAL':<11} {'RESERVATION':<13} {'SOURCE':<8}")
    print("-" * 48)
    for slot in slots:
        print(
            f"{slot['id']:<4} {slot['name']:<6} "
            f"{slot['physical_status']:<11} {slot['reservation_status']:<13} "
            f"{slot['configured_source']:<8}"
        )


def prompt_for_slot(slots: list[dict[str, Any]]) -> dict[str, Any] | None:
    selection = input("Slot name or backend ID (for example P3 or 3): ")
    slot = resolve_slot(slots, selection)
    if slot is None:
        print(f"Invalid slot: {selection.strip() or '(empty)'}. Please choose a listed slot.")
    return slot


def run() -> int:
    print("\nSMARTPARK AI — OCCUPANCY SIMULATOR")
    print(f"API: {API_URL}")

    while True:
        try:
            slots = fetch_slots()
        except SimulatorError as error:
            print(f"\nBackend: Disconnected\n{error}")
            retry = input("Press Enter to retry, or type 5 to exit: ").strip()
            if retry == "5":
                return 0
            continue

        print("\nBackend: Connected")
        print_slots(slots)
        print("\nCommands:\n")
        print("1. Set slot OCCUPIED")
        print("2. Set slot FREE")
        print("3. Toggle slot")
        print("4. Refresh")
        print("5. Exit")

        command = input("\nChoose a command: ").strip()
        if command == "5":
            print("Simulator closed.")
            return 0
        if command == "4":
            continue
        if command not in {"1", "2", "3"}:
            print("Invalid command. Choose 1, 2, 3, 4, or 5.")
            continue

        try:
            # Refresh immediately before resolving and updating so toggle never
            # relies on stale simulator state.
            current_slots = fetch_slots()
            slot = prompt_for_slot(current_slots)
            if slot is None:
                continue

            if command == "1":
                target_status = "OCCUPIED"
            elif command == "2":
                target_status = "FREE"
            else:
                target_status = (
                    "OCCUPIED" if slot["physical_status"] == "FREE" else "FREE"
                )

            updated = send_occupancy(slot, target_status)
            print(
                f"\n{updated.get('name', slot['name'])} → {updated.get('physical_status', target_status)} ✓ "
                f"(source: {slot['configured_source']})"
            )
        except SimulatorError as error:
            print(f"\nUpdate failed: {error}")


def main() -> int:
    try:
        return run()
    except (EOFError, KeyboardInterrupt):
        print("\nSimulator closed.")
        return 0


if __name__ == "__main__":
    sys.exit(main())
