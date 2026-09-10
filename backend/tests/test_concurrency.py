"""Emulates two simultaneous requests racing for the same last-available
slot and verifies only one booking is ever confirmed - the whole point of
the DB-level partial unique index in models.py, not just app-level checks.

Uses a real temp-file SQLite DB (not :memory:) with an actual multi-
connection pool, so the two threads truly hit the database concurrently
instead of serializing on a single shared connection like the StaticPool
setup in conftest.py does.
"""

import datetime as dt
import threading

import pytest

from app import create_app
from app.config import Config
from app.extensions import db as _db
from app.models import Booking, BookingStatus, Slot, Table
from app.services import booking as booking_service
from app.services.exceptions import SlotUnavailableError


@pytest.fixture
def file_db_app(tmp_path):
    db_path = tmp_path / "concurrency.db"

    class FileConfig(Config):
        TESTING = True
        SQLALCHEMY_DATABASE_URI = f"sqlite:///{db_path}"
        # busy_timeout so a writer waits for the other connection's short
        # transaction instead of failing immediately with "database is locked".
        SQLALCHEMY_ENGINE_OPTIONS = {"connect_args": {"timeout": 30}}

    application = create_app(FileConfig)
    with application.app_context():
        _db.create_all()
    return application


def test_two_concurrent_bookings_for_the_last_slot_only_one_succeeds(file_db_app):
    with file_db_app.app_context():
        table = Table(number=1, capacity=4, zone="main")
        _db.session.add(table)
        _db.session.flush()
        target_date = dt.date.today() + dt.timedelta(days=7)
        slot = Slot(table_id=table.id, date=target_date, start_time=dt.time(20, 0))
        _db.session.add(slot)
        _db.session.commit()
        slot_id = slot.id

    results = []
    results_lock = threading.Lock()
    barrier = threading.Barrier(2)

    def attempt(guest_name):
        with file_db_app.app_context():
            barrier.wait()  # line both threads up to hit commit() as close together as possible
            try:
                booking_service.create_booking(
                    _db.session,
                    slot_id=slot_id,
                    guest_name=guest_name,
                    guest_phone="+10000000001",
                    guest_email=None,
                    party_size=2,
                )
                outcome = "ok"
            except SlotUnavailableError:
                outcome = "conflict"
            finally:
                _db.session.remove()
            with results_lock:
                results.append(outcome)

    threads = [threading.Thread(target=attempt, args=(name,)) for name in ("Racer A", "Racer B")]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert not any(t.is_alive() for t in threads), "a racer thread hung (deadlock?)"
    assert sorted(results) == ["conflict", "ok"]

    with file_db_app.app_context():
        active = (
            _db.session.query(Booking)
            .filter(Booking.slot_id == slot_id, Booking.status.in_(BookingStatus.ACTIVE))
            .all()
        )
        assert len(active) == 1
