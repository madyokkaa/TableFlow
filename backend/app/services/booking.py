import datetime as dt

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import Booking, BookingStatus, BookingStatusLog, Slot
from .exceptions import (
    BookingNotFoundError,
    InvalidStatusTransitionError,
    SlotNotFoundError,
    SlotUnavailableError,
    ValidationError,
)

# Terminal states (cancelled/no-show) have no outgoing transitions.
ALLOWED_TRANSITIONS = {
    BookingStatus.PENDING: {BookingStatus.CONFIRMED, BookingStatus.CANCELLED},
    BookingStatus.CONFIRMED: {BookingStatus.CANCELLED, BookingStatus.NO_SHOW},
    BookingStatus.CANCELLED: set(),
    BookingStatus.NO_SHOW: set(),
}


def create_booking(
    session: Session,
    *,
    slot_id,
    guest_name,
    guest_phone,
    guest_email,
    party_size,
) -> Booking:
    errors = {}

    # Column lengths mirror models.py - String(120)/String(30)/String(255).
    if not isinstance(guest_name, str) or not guest_name.strip():
        errors["guest_name"] = "required"
    elif len(guest_name) > 120:
        errors["guest_name"] = "must be at most 120 characters"

    if guest_phone is not None and not isinstance(guest_phone, str):
        errors["guest_phone"] = "must be a string"
    elif guest_phone and len(guest_phone) > 30:
        errors["guest_phone"] = "must be at most 30 characters"

    if guest_email is not None and not isinstance(guest_email, str):
        errors["guest_email"] = "must be a string"
    elif guest_email and len(guest_email) > 255:
        errors["guest_email"] = "must be at most 255 characters"

    if not guest_phone and not guest_email and "guest_phone" not in errors and "guest_email" not in errors:
        errors["guest_phone"] = "guest_phone or guest_email is required"

    # bool is a subclass of int in Python, so exclude it explicitly.
    if isinstance(party_size, bool) or not isinstance(party_size, int) or not (1 <= party_size <= 100):
        errors["party_size"] = "must be a positive integer (max 100)"

    if not isinstance(slot_id, int) or isinstance(slot_id, bool):
        errors["slot_id"] = "required"

    if errors:
        raise ValidationError(errors)

    slot = session.get(Slot, slot_id)
    if slot is None:
        raise SlotNotFoundError(f"slot {slot_id} not found")
    if slot.date < dt.date.today():
        raise ValidationError({"slot_id": "cannot book a slot in the past"})
    if party_size > slot.table.capacity:
        raise ValidationError({"party_size": f"exceeds table capacity ({slot.table.capacity})"})

    booking = Booking(
        slot_id=slot_id,
        guest_name=guest_name.strip(),
        guest_phone=guest_phone,
        guest_email=guest_email,
        party_size=party_size,
        status=BookingStatus.PENDING,
    )
    session.add(booking)

    try:
        # The unique index is checked on INSERT, not deferred to COMMIT, so
        # this flush (needed to get booking.id for the log row below) is
        # where the double-booking race actually gets caught.
        session.flush()

        session.add(
            BookingStatusLog(
                booking_id=booking.id,
                from_status=None,
                to_status=BookingStatus.PENDING,
                changed_by="guest",
            )
        )
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        # Postgres names the constraint in the message; SQLite names the
        # column instead - check both so this works on either backend.
        orig_message = str(exc.orig).lower()
        if "uq_active_booking_per_slot" in orig_message or "bookings.slot_id" in orig_message:
            raise SlotUnavailableError(f"slot {slot_id} was just booked by someone else") from exc
        raise

    return booking


def update_booking_status(session: Session, *, booking_id, new_status, changed_by: str) -> Booking:
    if new_status not in BookingStatus.ALL:
        raise ValidationError({"status": f"must be one of {list(BookingStatus.ALL)}"})

    booking = session.get(Booking, booking_id)
    if booking is None:
        raise BookingNotFoundError(f"booking {booking_id} not found")

    allowed = ALLOWED_TRANSITIONS.get(booking.status, set())
    if new_status not in allowed:
        raise InvalidStatusTransitionError(
            f"cannot move booking {booking_id} from '{booking.status}' to '{new_status}'"
        )

    old_status = booking.status
    booking.status = new_status
    session.add(
        BookingStatusLog(
            booking_id=booking.id,
            from_status=old_status,
            to_status=new_status,
            changed_by=changed_by,
        )
    )

    try:
        session.commit()
    except IntegrityError as exc:
        session.rollback()
        raise SlotUnavailableError(
            f"cannot confirm booking {booking_id}: slot was taken by another booking"
        ) from exc

    return booking


def list_bookings_for_date(session: Session, target_date: dt.date) -> list[Booking]:
    stmt = (
        select(Booking)
        .join(Booking.slot)
        .where(Slot.date == target_date)
        .order_by(Slot.start_time, Booking.id)
    )
    return list(session.execute(stmt).scalars().all())
