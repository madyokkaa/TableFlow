import datetime as dt
from typing import Optional

from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .extensions import db


def _utcnow() -> dt.datetime:
    return dt.datetime.now(dt.timezone.utc)


class BookingStatus:
    PENDING = "pending"
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"
    NO_SHOW = "no-show"

    ALL = (PENDING, CONFIRMED, CANCELLED, NO_SHOW)
    ACTIVE = (PENDING, CONFIRMED)  # occupy a slot; block re-booking


def _status_in(*values: str) -> str:
    return ", ".join(f"'{v}'" for v in values)


class Table(db.Model):
    __tablename__ = "tables"

    id: Mapped[int] = mapped_column(primary_key=True)
    number: Mapped[int] = mapped_column(unique=True, nullable=False)
    capacity: Mapped[int] = mapped_column(nullable=False)
    zone: Mapped[str] = mapped_column(String(50), nullable=False)

    slots: Mapped[list["Slot"]] = relationship(
        back_populates="table", cascade="all, delete-orphan"
    )

    __table_args__ = (CheckConstraint("capacity > 0", name="ck_tables_capacity_positive"),)


class Slot(db.Model):
    __tablename__ = "slots"

    id: Mapped[int] = mapped_column(primary_key=True)
    table_id: Mapped[int] = mapped_column(ForeignKey("tables.id"), nullable=False)
    date: Mapped[dt.date] = mapped_column(nullable=False)
    start_time: Mapped[dt.time] = mapped_column(nullable=False)
    duration_minutes: Mapped[int] = mapped_column(nullable=False, default=90)

    table: Mapped["Table"] = relationship(back_populates="slots")
    bookings: Mapped[list["Booking"]] = relationship(
        back_populates="slot", cascade="all, delete-orphan"
    )

    __table_args__ = (
        UniqueConstraint("table_id", "date", "start_time", name="uq_slot_table_date_time"),
        CheckConstraint("duration_minutes > 0", name="ck_slots_duration_positive"),
    )


class Booking(db.Model):
    __tablename__ = "bookings"

    id: Mapped[int] = mapped_column(primary_key=True)
    slot_id: Mapped[int] = mapped_column(ForeignKey("slots.id"), nullable=False)

    guest_name: Mapped[str] = mapped_column(String(120), nullable=False)
    guest_phone: Mapped[Optional[str]] = mapped_column(String(30))
    guest_email: Mapped[Optional[str]] = mapped_column(String(255))
    party_size: Mapped[int] = mapped_column(nullable=False)

    status: Mapped[str] = mapped_column(
        String(20), nullable=False, default=BookingStatus.PENDING
    )

    created_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)
    updated_at: Mapped[dt.datetime] = mapped_column(
        DateTime(timezone=True), default=_utcnow, onupdate=_utcnow
    )

    slot: Mapped["Slot"] = relationship(back_populates="bookings")
    status_logs: Mapped[list["BookingStatusLog"]] = relationship(
        back_populates="booking", cascade="all, delete-orphan"
    )

    __table_args__ = (
        # Double-booking protection: only ONE pending/confirmed booking may
        # exist per slot at a time. Cancelled/no-show bookings don't count,
        # so a cancellation frees the slot for a new guest. Enforced by the
        # DB itself (partial unique index), not just application logic, so
        # two concurrent requests for the last slot can't both succeed.
        Index(
            "uq_active_booking_per_slot",
            "slot_id",
            unique=True,
            sqlite_where=text(f"status IN ({_status_in(*BookingStatus.ACTIVE)})"),
            postgresql_where=text(f"status IN ({_status_in(*BookingStatus.ACTIVE)})"),
        ),
        # Belt-and-braces: the partial index above only protects the ACTIVE
        # values it was built with, so a typo'd/out-of-range status written
        # by future code wouldn't trip it. This constraint rejects the typo
        # outright, at the DB level, regardless of which values are ACTIVE.
        CheckConstraint(f"status IN ({_status_in(*BookingStatus.ALL)})", name="ck_bookings_status_valid"),
        CheckConstraint("party_size > 0", name="ck_bookings_party_size_positive"),
    )


class BookingStatusLog(db.Model):
    """Audit trail for booking status transitions (who / when / from -> to).
    Needed for UAT and postmortems, per the release's NFRs."""

    __tablename__ = "booking_status_logs"

    id: Mapped[int] = mapped_column(primary_key=True)
    booking_id: Mapped[int] = mapped_column(ForeignKey("bookings.id"), nullable=False)
    from_status: Mapped[Optional[str]] = mapped_column(String(20))
    to_status: Mapped[str] = mapped_column(String(20), nullable=False)
    changed_by: Mapped[str] = mapped_column(String(120), nullable=False, default="guest")
    changed_at: Mapped[dt.datetime] = mapped_column(DateTime(timezone=True), default=_utcnow)

    booking: Mapped["Booking"] = relationship(back_populates="status_logs")

    __table_args__ = (
        CheckConstraint(
            f"from_status IS NULL OR from_status IN ({_status_in(*BookingStatus.ALL)})",
            name="ck_booking_status_logs_from_status_valid",
        ),
        CheckConstraint(
            f"to_status IN ({_status_in(*BookingStatus.ALL)})",
            name="ck_booking_status_logs_to_status_valid",
        ),
    )
