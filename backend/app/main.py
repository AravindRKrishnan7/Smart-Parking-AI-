import os
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .init_db import initialize_database
from .routers.reservations import router as reservations_router
from .routers.services import router as services_router
from .routers.slots import router as slots_router
from .routers.vehicles import router as vehicles_router


LOCAL_FRONTEND_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
configured_frontend_origin = (
    os.getenv("FRONTEND_ORIGIN", "").strip().rstrip("/")
)
allowed_frontend_origins = [*LOCAL_FRONTEND_ORIGINS]
if configured_frontend_origin:
    allowed_frontend_origins.append(configured_frontend_origin)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    initialize_database()
    yield


app = FastAPI(
    title="SmartPark AI API",
    description="Parking occupancy, reservation, and vehicle-location backend",
    version="5.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_frontend_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/health", tags=["health"])
def health_check() -> dict[str, str]:
    return {"status": "ok"}

app.include_router(slots_router)
app.include_router(reservations_router)
app.include_router(vehicles_router)
app.include_router(services_router)
