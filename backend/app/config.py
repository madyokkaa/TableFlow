import os

from dotenv import load_dotenv

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_DEFAULT_SQLITE_PATH = os.path.join(_BACKEND_DIR, "instance", "tableflow.db")
os.makedirs(os.path.dirname(_DEFAULT_SQLITE_PATH), exist_ok=True)

# Local/dev convenience only: Vercel and Docker inject DATABASE_URL directly
# as a real env var, so this is a no-op there (no backend/.env present).
load_dotenv(os.path.join(_BACKEND_DIR, ".env"))


def _normalize_db_url(url: str) -> str:
    """Accept the postgres://... URLs Supabase/Heroku hand out and the
    driver-less postgresql://... form, and normalize both to the psycopg3
    driver SQLAlchemy needs."""
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://"):]
    if url.startswith("postgresql://") and "+psycopg" not in url:
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    return url


def _engine_options(url: str) -> dict:
    options = {"pool_pre_ping": True}
    if url.startswith("postgresql"):
        # Supabase's pooled connection (PgBouncer, transaction mode) doesn't
        # support server-side prepared statements persisting across requests
        # on different underlying connections - disable them.
        options["connect_args"] = {"prepare_threshold": None}
    return options


class Config:
    SQLALCHEMY_DATABASE_URI = _normalize_db_url(
        os.environ.get("DATABASE_URL", f"sqlite:///{_DEFAULT_SQLITE_PATH}")
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_ENGINE_OPTIONS = _engine_options(SQLALCHEMY_DATABASE_URI)
