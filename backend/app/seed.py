import datetime as dt

from .extensions import db
from .models import Slot, Table

DEMO_TABLES = [
    {"number": 1, "capacity": 2, "zone": "main"},
    {"number": 2, "capacity": 2, "zone": "main"},
    {"number": 3, "capacity": 4, "zone": "main"},
    {"number": 4, "capacity": 4, "zone": "main"},
    {"number": 5, "capacity": 6, "zone": "main"},
    {"number": 6, "capacity": 2, "zone": "terrace"},
    {"number": 7, "capacity": 4, "zone": "terrace"},
]

OPEN_TIME = dt.time(12, 0)
CLOSE_TIME = dt.time(22, 0)
# Interval == duration so one table's own slots never overlap each other -
# otherwise multiple slots could each get a "confirmed" booking for the same
# physical seating window, defeating the double-booking guard entirely.
SLOT_DURATION_MINUTES = 90
SLOT_INTERVAL_MINUTES = SLOT_DURATION_MINUTES


def _slot_start_times():
    anchor = dt.date(2000, 1, 1)  # arbitrary; only the time-of-day is used
    current = dt.datetime.combine(anchor, OPEN_TIME)
    end = dt.datetime.combine(anchor, CLOSE_TIME)
    while current <= end:
        yield current.time()
        current += dt.timedelta(minutes=SLOT_INTERVAL_MINUTES)


def seed_demo_data(session=None, days: int = 14) -> bool:
    """Populate demo tables + slots so /availability has something to show.
    No-op (returns False) if tables already exist."""
    session = session or db.session

    if session.execute(db.select(Table.id).limit(1)).first():
        return False

    tables = [Table(**t) for t in DEMO_TABLES]
    session.add_all(tables)
    session.flush()

    today = dt.date.today()
    start_times = list(_slot_start_times())
    for offset in range(days):
        target_date = today + dt.timedelta(days=offset)
        for table in tables:
            for start_time in start_times:
                session.add(
                    Slot(
                        table_id=table.id,
                        date=target_date,
                        start_time=start_time,
                        duration_minutes=SLOT_DURATION_MINUTES,
                    )
                )

    session.commit()
    return True
