import { describe, expect, it } from "vitest";
import { liveTableStates } from "../lib/dashboard/liveQueries";

describe("liveTableStates", () => {
  it("marks out-of-service, walk-in and reserved tables, leaving the rest free", () => {
    const states = liveTableStates({
      tables: [
        { id: 1, hall_id: 10, manual_status: null },
        { id: 2, hall_id: 10, manual_status: "occupied" },
        { id: 3, hall_id: 11, manual_status: null },
        { id: 4, hall_id: 11, manual_status: "out_of_service" },
      ],
      reservedNow: new Set([3, 4]),
    });
    expect(states).toEqual([
      { id: 1, hallId: 10, state: "free" },
      { id: 2, hallId: 10, state: "busy" },
      { id: 3, hallId: 11, state: "busy" },
      { id: 4, hallId: 11, state: "off" },
    ]);
  });
});
