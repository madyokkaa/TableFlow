import hmac
from functools import wraps

from flask import current_app, jsonify, request
from werkzeug.security import check_password_hash


def require_hostess_auth(view):
    """Guards the hostess-only endpoints (booking list + status changes),
    which expose/mutate guest PII - this is the NFR from week 7.

    Credentials are read from app.config (set once in create_app, hashed at
    startup) rather than module-level constants, so tests can override them
    and a missing HOSTESS_PASSWORD fails app startup instead of silently
    falling back to a guessable default."""

    @wraps(view)
    def wrapped(*args, **kwargs):
        auth = request.authorization
        username = (auth.username if auth else "") or ""
        password = (auth.password if auth else "") or ""

        # Both checks always run (no short-circuit) to avoid leaking via timing
        # whether the username or the password was the wrong part.
        username_ok = hmac.compare_digest(username, current_app.config["HOSTESS_USERNAME"])
        password_ok = check_password_hash(current_app.config["HOSTESS_PASSWORD_HASH"], password)

        if not (username_ok and password_ok):
            response = jsonify(error="authentication required")
            response.status_code = 401
            response.headers["WWW-Authenticate"] = 'Basic realm="hostess"'
            return response
        return view(*args, **kwargs)

    return wrapped
