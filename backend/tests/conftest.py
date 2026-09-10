import pytest
from sqlalchemy.pool import StaticPool

from app import create_app
from app.config import Config
from app.extensions import db as _db


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
