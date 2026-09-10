import datetime as dt

from flask import Blueprint, jsonify, request

from ..extensions import db
from ..models import Booking
from ..services import booking as booking_service
from ..services.exceptions import (
    BookingNotFoundError,
    InvalidStatusTransitionError,
    SlotNotFoundError,
    SlotUnavailableError,
    ValidationError,
)
from .auth import require_hostess_auth

bp = Blueprint("bookings", __name__, url_prefix="/api")


def _iso(value: dt.datetime) -> str:
    # SQLite returns naive datetimes even for DateTime(timezone=True)
    # columns; Postgres returns them tz-aware. Normalize so the API's
    # timestamp format doesn't silently differ between dev and prod.
    if value.tzinfo is None:
        value = value.replace(tzinfo=dt.timezone.utc)
    return value.isoformat()


def _serialize(booking: Booking) -> dict:
    return {
        "id": booking.id,
        "slot_id": booking.slot_id,
        "guest_name": booking.guest_name,
        "guest_phone": booking.guest_phone,
        "guest_email": booking.guest_email,
        "party_size": booking.party_size,
        "status": booking.status,
        "created_at": _iso(booking.created_at),
        "updated_at": _iso(booking.updated_at),
    }


@bp.post("/bookings")
def create_booking():
    payload = request.get_json(silent=True) or {}
    try:
        booking = booking_service.create_booking(
            db.session,
            slot_id=payload.get("slot_id"),
            guest_name=payload.get("guest_name"),
            guest_phone=payload.get("guest_phone"),
            guest_email=payload.get("guest_email"),
            party_size=payload.get("party_size"),
        )
    except ValidationError as exc:
        return jsonify(error="validation_failed", details=exc.errors), 400
    except SlotNotFoundError as exc:
        return jsonify(error=str(exc)), 404
    except SlotUnavailableError as exc:
        return jsonify(error=str(exc)), 409

    return jsonify(_serialize(booking)), 201


@bp.get("/bookings/<date_str>")
@require_hostess_auth
def list_bookings(date_str):
    try:
        target_date = dt.date.fromisoformat(date_str)
    except ValueError:
        return jsonify(error="date must be YYYY-MM-DD"), 400

    bookings = booking_service.list_bookings_for_date(db.session, target_date)
    return jsonify([_serialize(b) for b in bookings])


@bp.patch("/bookings/<int:booking_id>")
@require_hostess_auth
def update_booking(booking_id):
    payload = request.get_json(silent=True) or {}
    changed_by = request.authorization.username if request.authorization else "hostess"

    try:
        booking = booking_service.update_booking_status(
            db.session,
            booking_id=booking_id,
            new_status=payload.get("status"),
            changed_by=changed_by,
        )
    except ValidationError as exc:
        return jsonify(error="validation_failed", details=exc.errors), 400
    except BookingNotFoundError as exc:
        return jsonify(error=str(exc)), 404
    except (InvalidStatusTransitionError, SlotUnavailableError) as exc:
        return jsonify(error=str(exc)), 409

    return jsonify(_serialize(booking))
