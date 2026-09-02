from sqlalchemy import select, update

from .database import Base, SessionLocal, engine
from .models import OccupancySource, ParkingSlot, PhysicalStatus, ReservationStatus


# Change this list when the demo layout or source assignments change.
DEMO_SLOTS = [
    ("P1", OccupancySource.CAMERA),
    ("P2", OccupancySource.CAMERA),
    ("P3", OccupancySource.CAMERA),
    ("P4", OccupancySource.CAMERA),
    ("P5", OccupancySource.CAMERA),
    ("P6", OccupancySource.CAMERA),
    ("P7", OccupancySource.CAMERA),
    ("P8", OccupancySource.CAMERA),
]


def initialize_database() -> None:
    Base.metadata.create_all(bind=engine)

    with SessionLocal() as db:
        existing_names = set(db.scalars(select(ParkingSlot.name)).all())

        for name, configured_source in DEMO_SLOTS:
            if name in existing_names:
                db.execute(
                    update(ParkingSlot)
                    .where(
                        ParkingSlot.name == name,
                        ParkingSlot.configured_source != configured_source,
                    )
                    .values(
                        configured_source=configured_source,
                        # A source-ownership migration is not an occupancy event.
                        updated_at=ParkingSlot.updated_at,
                    )
                )
            else:
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
