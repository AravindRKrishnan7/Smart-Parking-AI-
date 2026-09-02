from datetime import UTC, datetime
from enum import Enum

from sqlalchemy import DateTime, Enum as SqlEnum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class PhysicalStatus(str, Enum):
    FREE = "FREE"
    OCCUPIED = "OCCUPIED"


class ReservationStatus(str, Enum):
    AVAILABLE = "AVAILABLE"
    RESERVED = "RESERVED"


class OccupancySource(str, Enum):
    CAMERA = "CAMERA"
    SENSOR = "SENSOR"


class ReservationLifecycleStatus(str, Enum):
    ACTIVE = "ACTIVE"
    IN_USE = "IN_USE"
    COMPLETED = "COMPLETED"
    CANCELLED = "CANCELLED"
    EXPIRED = "EXPIRED"


def utc_now() -> datetime:
    return datetime.now(UTC)


class ParkingSlot(Base):
    __tablename__ = "parking_slots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(20), unique=True, nullable=False)
    physical_status: Mapped[PhysicalStatus] = mapped_column(
        SqlEnum(PhysicalStatus, native_enum=False, create_constraint=True),
        default=PhysicalStatus.FREE,
        nullable=False,
    )
    reservation_status: Mapped[ReservationStatus] = mapped_column(
        SqlEnum(ReservationStatus, native_enum=False, create_constraint=True),
        default=ReservationStatus.AVAILABLE,
        nullable=False,
    )
    configured_source: Mapped[OccupancySource] = mapped_column(
        SqlEnum(OccupancySource, native_enum=False, create_constraint=True),
        nullable=False,
    )
    occupancy_source: Mapped[OccupancySource | None] = mapped_column(
        SqlEnum(OccupancySource, native_enum=False, create_constraint=True),
        nullable=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        onupdate=utc_now,
        nullable=False,
    )

    @property
    def display_status(self) -> str:
        if self.physical_status == PhysicalStatus.OCCUPIED:
            return "OCCUPIED"
        if self.reservation_status == ReservationStatus.RESERVED:
            return "RESERVED"
        return "AVAILABLE"


class Reservation(Base):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    slot_id: Mapped[int] = mapped_column(
        ForeignKey("parking_slots.id"),
        index=True,
        nullable=False,
    )
    phone_number: Mapped[str] = mapped_column(String(20), nullable=False)
    vehicle_number: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[ReservationLifecycleStatus] = mapped_column(
        SqlEnum(
            ReservationLifecycleStatus,
            native_enum=False,
            create_constraint=True,
        ),
        default=ReservationLifecycleStatus.ACTIVE,
        nullable=False,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utc_now,
        nullable=False,
    )
    expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
