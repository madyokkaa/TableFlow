const STYLES: Record<string, string> = {
  pending: "bg-status-pending-tint text-status-pending",
  confirmed: "bg-status-confirmed-tint text-status-confirmed",
  cancelled: "bg-status-cancelled-tint text-status-cancelled",
  "no-show": "bg-status-noshow-tint text-status-noshow",
  completed: "bg-line text-muted",
};

const LABELS: Record<string, string> = {
  pending: "Pending",
  confirmed: "Confirmed",
  cancelled: "Cancelled",
  "no-show": "No-show",
  completed: "Completed",
};

export function StatusPill({ status }: { status: string }) {
  const style = STYLES[status] ?? "bg-line text-muted";
  const label = LABELS[status] ?? status;
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${style}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />
      {label}
    </span>
  );
}
