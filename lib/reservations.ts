export const RESERVATION_STATUSES = ["pending", "confirmed", "cancelled", "no-show", "completed"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

// Terminal states (cancelled/no-show/completed) have no outgoing transitions.
export const ALLOWED_STATUS_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "no-show", "completed"],
  cancelled: [],
  "no-show": [],
  completed: [],
};

export function mapRpcError(error: { code?: string; message: string }): {
  status: number;
  body: Record<string, unknown>;
} {
  if (error.code === "23P01") {
    return { status: 409, body: { error: "that table is no longer available for the requested time" } };
  }
  if (error.code === "P0001") {
    if (error.message.includes("capacity")) {
      return { status: 400, body: { error: "validation_failed", details: { party_size: error.message } } };
    }
    if (error.message.includes("past")) {
      return { status: 400, body: { error: "validation_failed", details: { date: error.message } } };
    }
    if (error.message.includes("not found")) {
      return { status: 404, body: { error: error.message } };
    }
    return { status: 400, body: { error: error.message } };
  }
  console.error("[reservations] rpc failed", error);
  return { status: 500, body: { error: "internal_error" } };
}
