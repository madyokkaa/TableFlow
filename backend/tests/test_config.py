import os

import pytest

from app.config import Config


def test_default_sqlite_instance_directory_exists():
    """Regression test: create_app() with the default Config used to crash
    with 'unable to open database file' because backend/instance/ was never
    created before SQLite tried to open a file inside it."""
    uri = Config.SQLALCHEMY_DATABASE_URI
    if not uri.startswith("sqlite:///"):
        pytest.skip("DATABASE_URL is set in this environment; not testing the SQLite fallback")

    db_path = uri[len("sqlite:///"):]
    assert os.path.isdir(os.path.dirname(db_path))
