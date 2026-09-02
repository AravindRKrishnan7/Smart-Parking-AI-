from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from .models import OccupancySource, PhysicalStatus, ReservationStatus


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

