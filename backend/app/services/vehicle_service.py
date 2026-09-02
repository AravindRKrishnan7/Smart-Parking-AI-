from fastapi import HTTPException, status
from sqlalchemy import case, select
from sqlalchemy.orm import Session

from ..models import ParkingSlot, Reservation, ReservationLifecycleStatus
from ..schemas import VehicleLocationResponse, normalize_vehicle_number


def find_vehicle_location(db: Session, vehicle_number: str) -> VehicleLocationResponse:
    try:
        normalized_vehicle_number = normalize_vehicle_number(vehicle_number)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail=str(exc),
        ) from exc

    status_priority = case(
        (Reservation.status == ReservationLifecycleStatus.IN_USE, 0),
        else_=1,
    )
    result = db.execute(
        select(Reservation, ParkingSlot)
        .join(ParkingSlot, ParkingSlot.id == Reservation.slot_id)
        .where(
            Reservation.vehicle_number == normalized_vehicle_number,
            Reservation.status.in_(
                [
                    ReservationLifecycleStatus.IN_USE,
                    ReservationLifecycleStatus.ACTIVE,
                ]
            ),
        )
        .order_by(status_priority, Reservation.id.desc())
        .limit(1)
    ).first()

    if result is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=(
                "No active parking session found for vehicle "
                f"{normalized_vehicle_number}."
            ),
        )

    reservation, slot = result
    parking_status = (
        "PARKED"
        if reservation.status == ReservationLifecycleStatus.IN_USE
        else "RESERVED_NOT_PARKED"
    )
    return VehicleLocationResponse(
        reservation_id=reservation.id,
        vehicle_number=normalized_vehicle_number,
        parking_status=parking_status,
        slot_id=slot.id,
        slot_name=slot.name,
        physical_status=slot.physical_status,
    )
