import datetime as dt

from flask import Blueprint, jsonify, request

from ..extensions import db
from ..services.availability import list_available_slots

bp = Blueprint("availability", __name__, url_prefix="/api")


@bp.get("/availability")
def get_availability():
    date_str = request.args.get("date")
    party_size_str = request.args.get("party_size")

    if not date_str:
        return jsonify(error="date is required (YYYY-MM-DD)"), 400
    try:
        target_date = dt.date.fromisoformat(date_str)
    except ValueError:
        return jsonify(error="date must be YYYY-MM-DD"), 400

    if not party_size_str:
        return jsonify(error="party_size is required"), 400
    try:
        party_size = int(party_size_str)
        if not (1 <= party_size <= 100):
            raise ValueError
    except ValueError:
        return jsonify(error="party_size must be a positive integer (max 100)"), 400

    slots = list_available_slots(db.session, target_date, party_size)
    return jsonify(
        [
            {
                "slot_id": slot.id,
                "table_id": slot.table_id,
                "table_number": slot.table.number,
                "zone": slot.table.zone,
                "capacity": slot.table.capacity,
                "date": slot.date.isoformat(),
                "start_time": slot.start_time.isoformat(timespec="minutes"),
                "duration_minutes": slot.duration_minutes,
            }
            for slot in slots
        ]
    )
