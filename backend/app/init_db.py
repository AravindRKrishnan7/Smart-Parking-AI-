from sqlalchemy import select

from .database import Base, SessionLocal, engine
from .models import OccupancySource, ParkingSlot, PhysicalStatus, ReservationStatus


# Change this list when the demo layout or source assignments change.
DEMO_SLOTS = [
    ("P1", OccupancySource.CAMERA),
    ("P2", OccupancySource.CAMERA),
    ("P3", OccupancySource.CAMERA),
    ("P4", OccupancySource.CAMERA),
    ("P5", OccupancySource.SENSOR),
    ("P6", OccupancySource.SENSOR),
    ("P7", OccupancySource.SENSOR),
    ("P8", OccupancySource.SENSOR),
]


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        existing_names = set(db.scalars(select(ParkingSlot.name)).all())

        for name, configured_source in DEMO_SLOTS:
            if name not in existing_names:
                db.add(
                    ParkingSlot(
                        name=name,
                        physical_status=PhysicalStatus.FREE,
                        reservation_status=ReservationStatus.AVAILABLE,
                        configured_source=configured_source,
                    )
                )

        db.commit()


if __name__ == "__main__":
    initialize_database()

