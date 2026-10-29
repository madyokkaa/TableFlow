/** GET /api/cron/cleanup without a database: Supabase and the cleanup
 * helpers are mocked - what's under test is the CRON_SECRET check and
 * what the route calls. */
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const completeExpiredReservations = vi.fn();
const deleteStaleReservations = vi.fn();
const insert = vi.fn();
const lt = vi.fn();
vi.mock("@/lib/reservationCleanup", () => ({ completeExpiredReservations, deleteStaleReservations }));
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => (table === "audit_log" ? { insert } : { delete: () => ({ lt }) }),
  }),
}));

const { GET } = await import("../app/api/cron/cleanup/route");

const call = (authorization?: string) =>
  GET(new NextRequest("http://localhost/api/cron/cleanup", { headers: authorization ? { authorization } : {} }));

describe("GET /api/cron/cleanup", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "test-cron-secret");
    vi.spyOn(console, "error").mockImplementation(() => {});
    for (const fn of [completeExpiredReservations, deleteStaleReservations, insert, lt]) fn.mockReset();
    deleteStaleReservations.mockResolvedValue(3);
    insert.mockResolvedValue({ error: null });
    lt.mockResolvedValue({ error: null });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("refuses a missing or wrong secret (401) without touching data", async () => {
    expect((await call()).status).toBe(401);
    expect((await call("Bearer nope")).status).toBe(401);
    expect((await call("test-cron-secret")).status).toBe(401);
    expect(completeExpiredReservations).not.toHaveBeenCalled();
    expect(deleteStaleReservations).not.toHaveBeenCalled();
  });

  it("refuses everything when CRON_SECRET isn't configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    expect((await call("Bearer ")).status).toBe(401);
    expect(deleteStaleReservations).not.toHaveBeenCalled();
  });

  it("closes expired bookings, deletes stale ones and journals the count", async () => {
    const res = await call("Bearer test-cron-secret");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, deleted_reservations: 3 });
    expect(completeExpiredReservations).toHaveBeenCalledTimes(1);
    expect(deleteStaleReservations).toHaveBeenCalledTimes(1);
    expect(lt).toHaveBeenCalledWith("window_start", expect.any(String));
    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({ actor_role: "system", action: "reservation.cleanup", details: { deleted: 3 } })
    );
  });

  it("answers 500 when the cleanup fails", async () => {
    deleteStaleReservations.mockRejectedValue(new Error("db down"));
    expect((await call("Bearer test-cron-secret")).status).toBe(500);
  });
});
