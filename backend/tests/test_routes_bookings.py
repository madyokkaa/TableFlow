def test_create_booking_happy_path(client, table_and_slot):
    _, slot = table_and_slot

    resp = client.post(
        "/api/bookings",
        json={
            "slot_id": slot.id,
            "guest_name": "Alice",
            "guest_phone": "+10000000001",
            "party_size": 2,
        },
    )
    assert resp.status_code == 201
    body = resp.get_json()
    assert body["status"] == "pending"
    assert body["slot_id"] == slot.id


def test_create_booking_rejects_missing_contact_info(client, table_and_slot):
    _, slot = table_and_slot

    resp = client.post(
        "/api/bookings",
        json={"slot_id": slot.id, "guest_name": "Alice", "party_size": 2},
    )
    assert resp.status_code == 400
    assert "guest_phone" in resp.get_json()["details"]


def test_create_booking_rejects_non_string_contact_fields(client, table_and_slot):
    _, slot = table_and_slot

    resp = client.post(
        "/api/bookings",
        json={
            "slot_id": slot.id,
            "guest_name": "Alice",
            "guest_phone": {"x": 1},
            "party_size": 2,
        },
    )
    assert resp.status_code == 400


def test_create_booking_rejects_boolean_party_size(client, table_and_slot):
    _, slot = table_and_slot

    resp = client.post(
        "/api/bookings",
        json={
            "slot_id": slot.id,
            "guest_name": "Alice",
            "guest_phone": "+10000000001",
            "party_size": True,
        },
    )
    assert resp.status_code == 400


def test_create_booking_rejects_overlong_guest_name(client, table_and_slot):
    _, slot = table_and_slot

    resp = client.post(
        "/api/bookings",
        json={
            "slot_id": slot.id,
            "guest_name": "A" * 200,
            "guest_phone": "+10000000001",
            "party_size": 2,
        },
    )
    assert resp.status_code == 400


def test_create_booking_rejects_party_size_over_capacity(client, table_and_slot):
    _, slot = table_and_slot

    resp = client.post(
        "/api/bookings",
        json={
            "slot_id": slot.id,
            "guest_name": "Alice",
            "guest_phone": "+10000000001",
            "party_size": 99,
        },
    )
    assert resp.status_code == 400


def test_create_booking_unknown_slot_is_404(client):
    resp = client.post(
        "/api/bookings",
        json={
            "slot_id": 999999,
            "guest_name": "Alice",
            "guest_phone": "+10000000001",
            "party_size": 2,
        },
    )
    assert resp.status_code == 404


def test_create_booking_on_already_booked_slot_is_409(client, table_and_slot):
    _, slot = table_and_slot
    payload = {
        "slot_id": slot.id,
        "guest_name": "Alice",
        "guest_phone": "+10000000001",
        "party_size": 2,
    }
    assert client.post("/api/bookings", json=payload).status_code == 201

    resp = client.post("/api/bookings", json={**payload, "guest_name": "Bob"})
    assert resp.status_code == 409


def test_create_booking_on_past_slot_is_rejected(client, db, table_and_slot):
    import datetime as dt

    from app.models import Slot, Table

    table = Table(number=2, capacity=4, zone="main")
    db.session.add(table)
    db.session.flush()
    past_slot = Slot(table_id=table.id, date=dt.date(2020, 1, 1), start_time=dt.time(19, 0))
    db.session.add(past_slot)
    db.session.commit()

    resp = client.post(
        "/api/bookings",
        json={
            "slot_id": past_slot.id,
            "guest_name": "Alice",
            "guest_phone": "+10000000001",
            "party_size": 2,
        },
    )
    assert resp.status_code == 400


def test_hostess_endpoints_require_auth(client, table_and_slot, test_date):
    assert client.get(f"/api/bookings/{test_date.isoformat()}").status_code == 401
    assert client.patch("/api/bookings/1", json={"status": "confirmed"}).status_code == 401


def test_hostess_can_list_and_confirm_booking(client, table_and_slot, hostess_auth_header, test_date):
    _, slot = table_and_slot
    create_resp = client.post(
        "/api/bookings",
        json={
            "slot_id": slot.id,
            "guest_name": "Alice",
            "guest_phone": "+10000000001",
            "party_size": 2,
        },
    )
    booking_id = create_resp.get_json()["id"]

    list_resp = client.get(f"/api/bookings/{test_date.isoformat()}", headers=hostess_auth_header)
    assert list_resp.status_code == 200
    assert len(list_resp.get_json()) == 1

    confirm_resp = client.patch(
        f"/api/bookings/{booking_id}",
        json={"status": "confirmed"},
        headers=hostess_auth_header,
    )
    assert confirm_resp.status_code == 200
    assert confirm_resp.get_json()["status"] == "confirmed"


def test_cannot_confirm_an_already_cancelled_booking(client, table_and_slot, hostess_auth_header):
    _, slot = table_and_slot
    create_resp = client.post(
        "/api/bookings",
        json={
            "slot_id": slot.id,
            "guest_name": "Alice",
            "guest_phone": "+10000000001",
            "party_size": 2,
        },
    )
    booking_id = create_resp.get_json()["id"]

    client.patch(f"/api/bookings/{booking_id}", json={"status": "cancelled"}, headers=hostess_auth_header)

    resp = client.patch(
        f"/api/bookings/{booking_id}", json={"status": "confirmed"}, headers=hostess_auth_header
    )
    assert resp.status_code == 409
