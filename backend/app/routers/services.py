from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ServiceRequestStatus
from ..schemas import (
    ServiceCatalogueItemResponse,
    ServiceCatalogueResponse,
    ServiceRequestCreate,
    ServiceRequestResponse,
    ServiceRequestsResponse,
    ServiceRequestStatusUpdate,
)
from ..service_catalog import SERVICE_CATALOG
from ..services.service_request_service import (
    create_service_request,
    get_service_request,
    list_service_requests,
    update_service_request_status,
)


router = APIRouter(prefix="/api/services", tags=["services"])
DatabaseSession = Annotated[Session, Depends(get_db)]


@router.get("/catalog", response_model=ServiceCatalogueResponse)
def get_service_catalogue() -> ServiceCatalogueResponse:
    return ServiceCatalogueResponse(
        services=[
            ServiceCatalogueItemResponse(**vars(definition))
            for definition in SERVICE_CATALOG.values()
        ]
    )


@router.post("", response_model=ServiceRequestResponse, status_code=status.HTTP_201_CREATED)
def request_service(
    request: ServiceRequestCreate,
    db: DatabaseSession,
) -> ServiceRequestResponse:
    return create_service_request(db, request)


@router.get("", response_model=ServiceRequestsResponse)
def get_service_requests(
    db: DatabaseSession,
    reservation_id: Annotated[int | None, Query(gt=0)] = None,
    vehicle_number: str | None = None,
    status_filter: Annotated[ServiceRequestStatus | None, Query(alias="status")] = None,
) -> ServiceRequestsResponse:
    return ServiceRequestsResponse(
        services=list_service_requests(
            db,
            reservation_id=reservation_id,
            vehicle_number=vehicle_number,
            service_status=status_filter,
        )
    )


@router.get("/{service_id}", response_model=ServiceRequestResponse)
def get_service_request_by_id(
    service_id: int,
    db: DatabaseSession,
) -> ServiceRequestResponse:
    return get_service_request(db, service_id)


@router.patch("/{service_id}/status", response_model=ServiceRequestResponse)
def update_service_status(
    service_id: int,
    request: ServiceRequestStatusUpdate,
    db: DatabaseSession,
) -> ServiceRequestResponse:
    return update_service_request_status(db, service_id, request)
