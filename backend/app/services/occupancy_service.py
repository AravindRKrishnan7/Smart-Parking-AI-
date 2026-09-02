from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..models import ParkingSlot
from ..schemas import OccupancyUpdate


def update_occupancy(db: Session, update: OccupancyUpdate) -> ParkingSlot:
    slot = db.get(ParkingSlot, update.slot_id)
    if slot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parking slot {update.slot_id} does not exist.",
        )

    if update.source != slot.configured_source:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Source mismatch for slot {slot.name}: configured source is "
                f"{slot.configured_source.value}, but received {update.source.value}."
            ),
        )

    slot.physical_status = update.physical_status
    slot.occupancy_source = update.source
    slot.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(slot)
    return slot

