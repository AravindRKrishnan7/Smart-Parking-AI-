from datetime import UTC, datetime

from fastapi import HTTPException, status
from sqlalchemy import case, select, update
from sqlalchemy.orm import Session

from ..models import (
    ParkingSlot,
    PhysicalStatus,
    Reservation,
    ReservationLifecycleStatus,
    ServiceRequest,
    ServiceRequestStatus,
)
from ..schemas import (
    ServiceRequestCreate,
    ServiceRequestStatusUpdate,
    normalize_vehicle_number,
)
from ..service_catalog import SERVICE_CATALOG


ALLOWED_TRANSITIONS: dict[
    ServiceRequestStatus,
    set[ServiceRequestStatus],
] = {
    ServiceRequestStatus.REQUESTED: {
        ServiceRequestStatus.ACCEPTED,
        ServiceRequestStatus.CANCELLED,
    },
    ServiceRequestStatus.ACCEPTED: {
        ServiceRequestStatus.IN_PROGRESS,
        ServiceRequestStatus.CANCELLED,
    },
    ServiceRequestStatus.IN_PROGRESS: {ServiceRequestStatus.COMPLETED},
    ServiceRequestStatus.COMPLETED: set(),
    ServiceRequestStatus.CANCELLED: set(),
}


def create_service_request(
    db: Session,
    request: ServiceRequestCreate,
) -> ServiceRequest:
    reservation = db.get(Reservation, request.reservation_id)
    if reservation is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Reservation {request.reservation_id} does not exist.",
        )

    slot = db.get(ParkingSlot, reservation.slot_id)
    if slot is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Parking slot {reservation.slot_id} does not exist.",
        )

    if (
        reservation.status != ReservationLifecycleStatus.IN_USE
        or slot.physical_status != PhysicalStatus.OCCUPIED
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Vehicle must be parked before requesting a service.",
        )

    definition = SERVICE_CATALOG[request.service_type]
    now = datetime.now(UTC)
    service_request = ServiceRequest(
        reservation_id=reservation.id,
        slot_id=reservation.slot_id,
        vehicle_number=reservation.vehicle_number,
        service_type=request.service_type,
        status=ServiceRequestStatus.REQUESTED,
        price=definition.price,
        estimated_duration_minutes=definition.estimated_duration_minutes,
        requested_at=now,
        updated_at=now,
    )
    db.add(service_request)
    db.commit()
    db.refresh(service_request)
    return service_request


def list_service_requests(
    db: Session,
    *,
    reservation_id: int | None = None,
    vehicle_number: str | None = None,
    service_status: ServiceRequestStatus | None = None,
) -> list[ServiceRequest]:
    query = select(ServiceRequest)

    if reservation_id is not None:
        query = query.where(ServiceRequest.reservation_id == reservation_id)
    if vehicle_number is not None:
        try:
            normalized_vehicle_number = normalize_vehicle_number(vehicle_number)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail=str(exc),
            ) from exc
        query = query.where(ServiceRequest.vehicle_number == normalized_vehicle_number)
    if service_status is not None:
        query = query.where(ServiceRequest.status == service_status)

    status_priority = case(
        (ServiceRequest.status == ServiceRequestStatus.REQUESTED, 0),
        (ServiceRequest.status == ServiceRequestStatus.ACCEPTED, 1),
        (ServiceRequest.status == ServiceRequestStatus.IN_PROGRESS, 2),
        else_=3,
    )
    return list(
        db.scalars(query.order_by(status_priority, ServiceRequest.id.desc())).all()
    )


def get_service_request(db: Session, service_id: int) -> ServiceRequest:
    service_request = db.get(ServiceRequest, service_id)
    if service_request is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Service request {service_id} does not exist.",
        )
    return service_request


def update_service_request_status(
    db: Session,
    service_id: int,
    request: ServiceRequestStatusUpdate,
) -> ServiceRequest:
    service_request = get_service_request(db, service_id)
    allowed_statuses = ALLOWED_TRANSITIONS[service_request.status]
    if request.status not in allowed_statuses:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Service request {service_id} cannot transition from "
                f"{service_request.status.value} to {request.status.value}."
            ),
        )

    transition = db.execute(
        update(ServiceRequest)
        .where(
            ServiceRequest.id == service_id,
            ServiceRequest.status == service_request.status,
        )
        .values(status=request.status, updated_at=datetime.now(UTC))
    )
    if transition.rowcount != 1:
        db.rollback()
        current = get_service_request(db, service_id)
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Service request {service_id} changed to {current.status.value}; "
                "refresh and try again."
            ),
        )

    db.commit()
    return get_service_request(db, service_id)
