from flask import jsonify
from werkzeug.exceptions import HTTPException


def register_error_handlers(app):
    """Without this, anything not caught by a route's own try/except (a bug,
    a 404, a 405) falls through to Werkzeug's HTML error page - wrong for a
    JSON API, and a potential info leak if debug mode is ever on."""

    @app.errorhandler(HTTPException)
    def handle_http_exception(exc):
        response = jsonify(error=exc.name.lower().replace(" ", "_"), message=exc.description)
        response.status_code = exc.code
        return response

    @app.errorhandler(Exception)
    def handle_unexpected_exception(exc):
        app.logger.exception("Unhandled exception")
        return jsonify(error="internal_error"), 500
