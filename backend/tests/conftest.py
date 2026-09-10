import base64
import datetime as dt

import pytest
from sqlalchemy.pool import StaticPool

from app import create_app
from app.config import DEFAULT_TEST_HOSTESS_PASSWORD, Config
from app.extensions import db as _db
from app.models import Slot, Table

# A week out so it's never "in the past" relative to whenever tests run.
TEST_BOOKING_DATE = dt.date.today() + dt.timedelta(days=7)


class TestConfig(Config):
    TESTING = True
    SQLALCHEMY_DATABASE_URI = "sqlite:///:memory:"
    # A plain in-memory SQLite URL gives each connection its own empty DB.
    # StaticPool pins every connection to the same underlying DB so the
    # tables created at app startup are still there when a request handler
    # opens its own connection.
    SQLALCHEMY_ENGINE_OPTIONS = {
        "connect_args": {"check_same_thread": False},
        "poolclass": StaticPool,
    }


@pytest.fixture
def app():
    application = create_app(TestConfig)
    with application.app_context():
        _db.create_all()
    yield application


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def db(app):
    with app.app_context():
        yield _db
        _db.session.rollback()


@pytest.fixture
def test_date():
    return TEST_BOOKING_DATE


@pytest.fixture
def table_and_slot(db):
    table = Table(number=1, capacity=4, zone="main")
    db.session.add(table)
    db.session.flush()

    slot = Slot(table_id=table.id, date=TEST_BOOKING_DATE, start_time=dt.time(19, 0))
    db.session.add(slot)
    db.session.commit()
    return table, slot


@pytest.fixture
def hostess_auth_header(app):
    # Matches the TESTING-only fallback create_app() uses when
    # HOSTESS_PASSWORD isn't set (see app/config.py).
    username = app.config["HOSTESS_USERNAME"]
    token = base64.b64encode(f"{username}:{DEFAULT_TEST_HOSTESS_PASSWORD}".encode()).decode()
    return {"Authorization": f"Basic {token}"}
