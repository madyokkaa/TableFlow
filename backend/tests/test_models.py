from datetime import date, time

import pytest
from sqlalchemy.exc import IntegrityError

from app.models import Booking, BookingStatus, Slot, Table


def _make_slot(db):
    table = Table(number=1, capacity=4, zone="main")
    db.session.add(table)
    db.session.flush()

    slot = Slot(table_id=table.id, date=date(2026, 1, 10), start_time=time(19, 0))
    db.session.add(slot)
    db.session.flush()
    return slot


def _make_booking(db, slot, status=BookingStatus.PENDING):
    booking = Booking(
        slot_id=slot.id,
        guest_name="Test Guest",
        guest_phone="+10000000001",
        party_size=2,
        status=status,
    )
    db.session.add(booking)
    return booking


def test_unique_active_booking_per_slot_blocks_double_booking(db):
    slot = _make_slot(db)
    _make_booking(db, slot, status=BookingStatus.CONFIRMED)
    db.session.commit()

    _make_booking(db, slot, status=BookingStatus.PENDING)
    with pytest.raises(IntegrityError):
        db.session.commit()


def test_cancelled_booking_frees_the_slot_for_a_new_one(db):
    slot = _make_slot(db)
    first = _make_booking(db, slot, status=BookingStatus.CONFIRMED)
    db.session.commit()

    first.status = BookingStatus.CANCELLED
    db.session.commit()

    _make_booking(db, slot, status=BookingStatus.PENDING)
    db.session.commit()  # should not raise

    assert len(slot.bookings) == 2


def test_invalid_status_value_is_rejected_by_the_db(db):
    slot = _make_slot(db)
    _make_booking(db, slot, status="totally-bogus")
    with pytest.raises(IntegrityError):
        db.session.commit()


def test_non_positive_party_size_is_rejected_by_the_db(db):
    slot = _make_slot(db)
    _make_booking(db, slot, status=BookingStatus.CONFIRMED).party_size = -5
    with pytest.raises(IntegrityError):
        db.session.commit()
