class ServiceError(Exception):
    """Base class for all domain-level errors raised by the service layer."""


class SlotNotFoundError(ServiceError):
    pass


class SlotUnavailableError(ServiceError):
    """The slot has (or just got) an active booking - DB constraint fired."""


class BookingNotFoundError(ServiceError):
    pass


class InvalidStatusTransitionError(ServiceError):
    pass


class ValidationError(ServiceError):
    def __init__(self, errors: dict):
        self.errors = errors
        super().__init__(str(errors))
