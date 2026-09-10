def test_availability_lists_the_open_slot(client, table_and_slot, test_date):
    _, slot = table_and_slot

    resp = client.get(f"/api/availability?date={test_date.isoformat()}&party_size=2")
    assert resp.status_code == 200
    body = resp.get_json()
    assert len(body) == 1
    assert body[0]["slot_id"] == slot.id
    assert body[0]["capacity"] == 4


def test_availability_excludes_slots_below_party_size_capacity(client, table_and_slot, test_date):
    resp = client.get(f"/api/availability?date={test_date.isoformat()}&party_size=6")
    assert resp.status_code == 200
    assert resp.get_json() == []


def test_availability_requires_date_and_party_size(client, test_date):
    resp = client.get("/api/availability?party_size=2")
    assert resp.status_code == 400

    resp = client.get(f"/api/availability?date={test_date.isoformat()}")
    assert resp.status_code == 400


def test_availability_rejects_bad_date_format(client):
    resp = client.get("/api/availability?date=06-01-2026&party_size=2")
    assert resp.status_code == 400


def test_availability_rejects_out_of_range_party_size(client, table_and_slot, test_date):
    resp = client.get(f"/api/availability?date={test_date.isoformat()}&party_size=999999999999999999999999")
    assert resp.status_code == 400
