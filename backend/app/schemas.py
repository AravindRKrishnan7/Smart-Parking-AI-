import re
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from .models import (
    OccupancySource,
    PhysicalStatus,
    ReservationLifecycleStatus,
    ReservationStatus,
)


class OccupancyUpdate(BaseModel):
    slot_id: int = Field(gt=0)
    physical_status: PhysicalStatus
    source: OccupancySource


class ParkingSlotResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    physical_status: PhysicalStatus
    reservation_status: ReservationStatus
    display_status: Literal["AVAILABLE", "RESERVED", "OCCUPIED"]
    configured_source: OccupancySource
    occupancy_source: OccupancySource | None
    updated_at: datetime


class ParkingSlotsResponse(BaseModel):
    slots: list[ParkingSlotResponse]


def normalize_vehicle_number(value: str) -> str:
    normalized = "".join(value.upper().split())
    if not normalized:
        raise ValueError("vehicle_number must not be empty")
    if len(normalized) > 20:
        raise ValueError("vehicle_number must be at most 20 characters")
    return normalized


class ReservationCreate(BaseModel):
    slot_id: int = Field(gt=0)
    phone_number: str = Field(max_length=30)
    vehicle_number: str = Field(max_length=30)

    @field_validator("phone_number")
    @classmethod
    def normalize_phone_number(cls, value: str) -> str:
        value = value.strip()
        has_leading_plus = value.startswith("+")
        normalized = re.sub(r"[\s\-()]", "", value)
        digits = normalized[1:] if has_leading_plus else normalized

        if not digits.isdigit() or not 8 <= len(digits) <= 15:
            raise ValueError("phone_number must contain 8 to 15 digits")

        return f"+{digits}" if has_leading_plus else digits

    @field_validator("vehicle_number")
    @classmethod
    def normalize_vehicle_number(cls, value: str) -> str:
        return normalize_vehicle_number(value)


class ReservationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    slot_id: int
    phone_number: str
    vehicle_number: str
    status: ReservationLifecycleStatus
    created_at: datetime
    expires_at: datetime | None


class ReservationsResponse(BaseModel):
    reservations: list[ReservationResponse]


class VehicleLocationResponse(BaseModel):
    vehicle_number: str
    parking_status: Literal["PARKED", "RESERVED_NOT_PARKED"]
    slot_id: int
    slot_name: str
    physical_status: PhysicalStatus
