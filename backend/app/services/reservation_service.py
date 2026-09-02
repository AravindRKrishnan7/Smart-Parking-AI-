from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from ..models import (
    ParkingSlot,
    PhysicalStatus,
    Reservation,
    ReservationLifecycleStatus,
    ReservationStatus,
)
from ..schemas import ReservationCreate


def _raise_slot_conflict(slot: ParkingSlot) -> None:
    if slot.physical_status == PhysicalStatus.OCCUPIED:
        detail = f"Parking slot {slot.name} is physically occupied and cannot be reserved."
    else:
        detail = f"Parking slot {slot.name} is already reserved."
    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=detail)


def create_reservation(db: Session, request: ReservationCreate) -> Reservation:
    slot = db.get(ParkingSlot, request.slot_id)
    if slot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parking slot {request.slot_id} does not exist.",
        )

    if (
        slot.physical_status != PhysicalStatus.FREE
        or slot.reservation_status != ReservationStatus.AVAILABLE
    ):
        _raise_slot_conflict(slot)

    now = datetime.now(UTC)

    # This conditional write is the concurrency guard. SQLite serializes writers,
    # so only one request can claim an AVAILABLE slot before the shared commit.
    claim = db.execute(
        update(ParkingSlot)
        .where(
            ParkingSlot.id == request.slot_id,
            ParkingSlot.physical_status == PhysicalStatus.FREE,
            ParkingSlot.reservation_status == ReservationStatus.AVAILABLE,
        )
        .values(
            reservation_status=ReservationStatus.RESERVED,
            updated_at=now,
        )
    )

    if claim.rowcount != 1:
        db.rollback()
        current_slot = db.get(ParkingSlot, request.slot_id)
        if current_slot is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Parking slot {request.slot_id} does not exist.",
            )
        _raise_slot_conflict(current_slot)

    reservation = Reservation(
        slot_id=request.slot_id,
        phone_number=request.phone_number,
        vehicle_number=request.vehicle_number,
        status=ReservationLifecycleStatus.ACTIVE,
        created_at=now,
        expires_at=None,
    )
    db.add(reservation)
    db.commit()
    db.refresh(reservation)
    return reservation


def get_reservation(db: Session, reservation_id: int) -> Reservation:
    reservation = db.get(Reservation, reservation_id)
    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reservation {reservation_id} does not exist.",
        )
    return reservation


def list_reservations(db: Session) -> list[Reservation]:
    return list(db.scalars(select(Reservation).order_by(Reservation.id.desc())).all())


def cancel_reservation(db: Session, reservation_id: int) -> Reservation:
    reservation = get_reservation(db, reservation_id)
    if reservation.status != ReservationLifecycleStatus.ACTIVE:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Reservation {reservation_id} cannot be cancelled because its status "
                f"is {reservation.status.value}."
            ),
        )

    now = datetime.now(UTC)
    cancellation = db.execute(
        update(Reservation)
        .where(
            Reservation.id == reservation_id,
            Reservation.status == ReservationLifecycleStatus.ACTIVE,
        )
        .values(status=ReservationLifecycleStatus.CANCELLED)
    )

    if cancellation.rowcount != 1:
        db.rollback()
        current = get_reservation(db, reservation_id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Reservation {reservation_id} cannot be cancelled because its status "
                f"is {current.status.value}."
            ),
        )

    db.execute(
        update(ParkingSlot)
        .where(ParkingSlot.id == reservation.slot_id)
        .values(
            reservation_status=ReservationStatus.AVAILABLE,
            updated_at=now,
        )
    )
    db.commit()
    return get_reservation(db, reservation_id)
