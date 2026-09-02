from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..database import get_db
from ..schemas import VehicleLocationResponse
from ..services.vehicle_service import find_vehicle_location


router = APIRouter(prefix="/api/vehicles", tags=["vehicles"])
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get("/{vehicle_number}/location", response_model=VehicleLocationResponse)
def get_vehicle_location(
    vehicle_number: str,
    db: DatabaseSession,
) -> VehicleLocationResponse:
    return find_vehicle_location(db, vehicle_number)
