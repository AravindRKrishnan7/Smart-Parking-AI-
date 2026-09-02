from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import ReservationCreate, ReservationResponse, ReservationsResponse
from ..services.reservation_service import (
    cancel_reservation,
    create_reservation,
    get_reservation,
    list_reservations,
)


router = APIRouter(prefix="/api/reservations", tags=["reservations"])
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.post("", response_model=ReservationResponse, status_code=status.HTTP_201_CREATED)
def reserve_slot(request: ReservationCreate, db: DatabaseSession) -> ReservationResponse:
    return create_reservation(db, request)


@router.get("", response_model=ReservationsResponse)
def get_reservations(db: DatabaseSession) -> ReservationsResponse:
    return ReservationsResponse(reservations=list_reservations(db))


@router.get("/{reservation_id}", response_model=ReservationResponse)
def get_reservation_by_id(
    reservation_id: int,
    db: DatabaseSession,
) -> ReservationResponse:
    return get_reservation(db, reservation_id)


@router.delete("/{reservation_id}", response_model=ReservationResponse)
def cancel_reservation_by_id(
    reservation_id: int,
    db: DatabaseSession,
) -> ReservationResponse:
    return cancel_reservation(db, reservation_id)
