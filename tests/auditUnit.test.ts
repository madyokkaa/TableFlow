import { describe, expect, it } from "vitest";
import { changedFields } from "../lib/audit";

describe("changedFields", () => {
  const keys = ["date", "start_time", "guest_name", "guest_phone", "guest_email", "table_ids", "party_size"] as const;
  const current = {
    date: "2026-11-20",
    start_time: "19:00:00",
    guest_name: "Анна",
    guest_phone: "+7 (900) 000-00-00",
    guest_email: null,
    table_ids: [3, 1],
    party_size: 2,
  };

  it("ignores fields an edit form resends unchanged", () => {
    const body = { ...current, start_time: "19:00", guest_name: " Анна ", guest_email: "", table_ids: [1, 3] };
    expect(changedFields(body, current, keys)).toEqual([]);
  });

  it("names only the fields whose value differs, never the values", () => {
    const body = { ...current, start_time: "20:30", guest_phone: null, party_size: 4 };
    expect(changedFields(body, current, keys)).toEqual(["start_time", "guest_phone", "party_size"]);
  });

  it("skips keys the body doesn't set", () => {
    expect(changedFields({ party_size: 3 }, current, keys)).toEqual(["party_size"]);
  });
});
