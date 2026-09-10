import datetime as dt

from sqlalchemy import select
from sqlalchemy.orm import Session, joinedload

from ..models import Booking, BookingStatus, Slot, Table


def list_available_slots(session: Session, target_date: dt.date, party_size: int) -> list[Slot]:
    """Slots on target_date whose table can seat party_size and that don't
    already have a pending/confirmed booking."""
    active_booking_exists = (
        select(Booking.id)
        .where(Booking.slot_id == Slot.id, Booking.status.in_(BookingStatus.ACTIVE))
        .correlate(Slot)
        .exists()
    )

    stmt = (
        select(Slot)
        .join(Slot.table)
        .options(joinedload(Slot.table))
        .where(Slot.date == target_date, Table.capacity >= party_size, ~active_booking_exists)
        .order_by(Slot.start_time, Table.number)
    )
    return list(session.execute(stmt).scalars().all())
