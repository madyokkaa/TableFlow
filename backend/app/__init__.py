from flask import Flask
from werkzeug.security import generate_password_hash

from .config import DEFAULT_TEST_HOSTESS_PASSWORD, Config
from .extensions import db, migrate


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    hostess_password = app.config.get("HOSTESS_PASSWORD")
    if not hostess_password:
        if app.testing:
            hostess_password = DEFAULT_TEST_HOSTESS_PASSWORD
        else:
            raise RuntimeError(
                "HOSTESS_PASSWORD is not set. The hostess endpoints expose "
                "guest PII and must not run on a guessable default - set it "
                "as a real env var (see backend/.env.example)."
            )
    app.config["HOSTESS_PASSWORD_HASH"] = generate_password_hash(hostess_password)

    db.init_app(app)

    from . import models  # noqa: F401  (registers tables on db.metadata)

    migrate.init_app(app, db)

    from .errors import register_error_handlers
    from .routes import register_routes

    register_routes(app)
    register_error_handlers(app)

    @app.cli.command("seed-demo")
    def seed_demo_command():
        """Populate demo tables + slots (no-op if data already exists)."""
        from .seed import seed_demo_data

        created = seed_demo_data()
        print("Seeded demo data." if created else "Demo data already exists, skipping.")

    return app
