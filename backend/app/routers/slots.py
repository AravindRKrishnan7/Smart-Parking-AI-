from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ParkingSlot
from ..schemas import OccupancyUpdate, ParkingSlotResponse, ParkingSlotsResponse
from ..services.occupancy_service import update_occupancy


router = APIRouter(prefix="/api/slots", tags=["parking slots"])
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get("", response_model=ParkingSlotsResponse)
def list_slots(db: DatabaseSession) -> ParkingSlotsResponse:
    slots = db.scalars(select(ParkingSlot).order_by(ParkingSlot.id)).all()
    return ParkingSlotsResponse(slots=slots)


@router.get("/{slot_id}", response_model=ParkingSlotResponse)
def get_slot(slot_id: int, db: DatabaseSession) -> ParkingSlot:
    slot = db.get(ParkingSlot, slot_id)
    if slot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parking slot {slot_id} does not exist.",
        )
    return slot


@router.post("/occupancy", response_model=ParkingSlotResponse)
def set_occupancy(update: OccupancyUpdate, db: DatabaseSession) -> ParkingSlot:
    return update_occupancy(db, update)

