import { STATUS_LABELS_RU, type ReservationStatus } from "@/lib/reservations";

const STYLES: Record<string, string> = {
  pending: "bg-status-pending-tint text-status-pending",
  confirmed: "bg-status-confirmed-tint text-status-confirmed",
  cancelled: "bg-status-cancelled-tint text-status-cancelled",
  "no-show": "bg-status-noshow-tint text-status-noshow",
  completed: "bg-line text-muted",
};

export function StatusPill({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-line text-muted";
  const label = STATUS_LABELS_RU[status as ReservationStatus] ?? status;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}
