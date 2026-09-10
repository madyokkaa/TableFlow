from flask import Flask

from .config import Config
from .extensions import db, migrate


def create_app(config_object=Config):
    app = Flask(__name__)
    app.config.from_object(config_object)

    db.init_app(app)

    from . import models  # noqa: F401  (registers tables on db.metadata)

    migrate.init_app(app, db)

    from .routes import register_routes

    register_routes(app)

    return app
