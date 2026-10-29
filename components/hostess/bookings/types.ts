import type { ReservationStatus } from "@/lib/reservations";

/** A row of GET /api/reservations (and of the realtime refetch), with its
 * tables and their halls joined in. */
export type Reservation = {
  id: number;
  date: string;
  start_time: string;
  duration_minutes: number;
  party_size: number;
  guest_name: string;
  guest_phone: string | null;
  guest_email: string | null;
  status: ReservationStatus;
  cancellation_reason: string | null;
  cancelled_by: "guest" | "host" | null;
  reservation_tables: { table_id: number; dining_tables: { id: number; label: string; hall_id: number; halls: { id: number; name: string } } }[];
};

/** What the drawer is showing: an existing booking, or a new one prefilled
 * with the page's day (and hall/table/time when opened from the grid). */
export type DrawerTarget =
  | { kind: "edit"; reservation: Reservation }
  | { kind: "create"; date: string; hallId?: number; tableId?: number; time?: string };
