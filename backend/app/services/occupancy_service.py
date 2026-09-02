from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select, update as sql_update
from sqlalchemy.orm import Session

from ..models import (
    ParkingSlot,
    PhysicalStatus,
    Reservation,
    ReservationLifecycleStatus,
    ReservationStatus,
    ServiceRequest,
    ServiceRequestStatus,
)
from ..schemas import OccupancyUpdate


def update_occupancy(db: Session, occupancy_update: OccupancyUpdate) -> ParkingSlot:
    slot = db.get(ParkingSlot, occupancy_update.slot_id)
    if slot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parking slot {occupancy_update.slot_id} does not exist.",
        )

    if occupancy_update.source != slot.configured_source:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Source mismatch for slot {slot.name}: configured source is "
                f"{slot.configured_source.value}, but received "
                f"{occupancy_update.source.value}."
            ),
        )

    previous_physical_status = slot.physical_status
    physical_status_changed = previous_physical_status != occupancy_update.physical_status
    now = datetime.now(UTC)

    if physical_status_changed and slot.reservation_status == ReservationStatus.RESERVED:
        if (
            previous_physical_status == PhysicalStatus.FREE
            and occupancy_update.physical_status == PhysicalStatus.OCCUPIED
        ):
            db.execute(
                sql_update(Reservation)
                .where(
                    Reservation.slot_id == slot.id,
                    Reservation.status == ReservationLifecycleStatus.ACTIVE,
                )
                .values(status=ReservationLifecycleStatus.IN_USE)
            )
        elif (
            previous_physical_status == PhysicalStatus.OCCUPIED
            and occupancy_update.physical_status == PhysicalStatus.FREE
        ):
            reservation_id = db.scalar(
                select(Reservation.id)
                .where(
                    Reservation.slot_id == slot.id,
                    Reservation.status == ReservationLifecycleStatus.IN_USE,
                )
                .limit(1)
            )
            completion = db.execute(
                sql_update(Reservation)
                .where(
                    Reservation.id == reservation_id,
                )
                .values(status=ReservationLifecycleStatus.COMPLETED)
            )
            if completion.rowcount == 1:
                slot.reservation_status = ReservationStatus.AVAILABLE
                db.execute(
                    sql_update(ServiceRequest)
                    .where(
                        ServiceRequest.reservation_id == reservation_id,
                        ServiceRequest.status.in_(
                            [
                                ServiceRequestStatus.REQUESTED,
                                ServiceRequestStatus.ACCEPTED,
                            ]
                        ),
                    )
                    .values(status=ServiceRequestStatus.CANCELLED, updated_at=now)
                )

    slot.physical_status = occupancy_update.physical_status
    slot.occupancy_source = occupancy_update.source
    slot.updated_at = now
    db.commit()
    db.refresh(slot)
    return slot
