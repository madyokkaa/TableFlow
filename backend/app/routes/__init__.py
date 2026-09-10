def register_routes(app):
    from .availability import bp as availability_bp
    from .bookings import bp as bookings_bp

    app.register_blueprint(availability_bp)
    app.register_blueprint(bookings_bp)
