import { describe, expect, it } from "vitest";
import { staffSlots, takenSlots, type SlotBooking } from "../lib/bookingSlots";

describe("staffSlots", () => {
  it("covers opening to closing in half-hour steps", () => {
    const slots = staffSlots();
    expect(slots[0]).toBe("12:00");
    expect(slots[1]).toBe("12:30");
    expect(slots.at(-1)).toBe("22:00");
    expect(slots).toHaveLength(21);
  });

  it("keeps an existing off-grid time, in order", () => {
    const slots = staffSlots("19:15:00");
    expect(slots).toContain("19:15");
    expect(slots.indexOf("19:15")).toBe(slots.indexOf("19:00") + 1);
    expect(staffSlots("19:00:00")).toHaveLength(21);
  });
});

describe("takenSlots", () => {
  const bookings: SlotBooking[] = [
    { id: 1, start_time: "19:00:00", duration_minutes: 90, status: "confirmed", table_ids: [7] },
    { id: 2, start_time: "13:00:00", duration_minutes: 90, status: "cancelled", table_ids: [7] },
    { id: 3, start_time: "15:00:00", duration_minutes: 60, status: "pending", table_ids: [8] },
  ];
  const slots = staffSlots();

  it("crosses out every start that would overlap an active booking on the table", () => {
    const taken = takenSlots(slots, bookings, [7], 90);
    // 17:30 + 90 min ends exactly at 19:00 - touching, not overlapping.
    expect([...taken]).toEqual(["18:00", "18:30", "19:00", "19:30", "20:00"]);
  });

  it("ignores cancelled bookings, other tables and the booking being edited", () => {
    expect(takenSlots(slots, bookings, [7], 90).has("13:00")).toBe(false);
    expect(takenSlots(slots, bookings, [7], 90, 1).size).toBe(0);
  });

  it("checks every selected table", () => {
    const taken = takenSlots(slots, bookings, [7, 8], 60);
    expect(taken.has("15:00")).toBe(true);
    expect(taken.has("19:00")).toBe(true);
    expect(taken.has("16:00")).toBe(false);
  });
});
