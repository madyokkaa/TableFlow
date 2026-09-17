import type { ReservationStatus } from "@/lib/reservations";

export type StatusCounts = Record<ReservationStatus, number>;

export type DashboardStats = {
  period: 7 | 30;
  today: { total: number; byStatus: StatusCounts };
  occupancy: { totalActive: number; occupied: number; outOfService: number; free: number };
  weekly: {
    noShowRate: number;
    noShowRatePrev: number;
    avgPartySize: number;
    avgPartySizePrev: number;
  };
  trend: (StatusCounts & { date: string })[];
  hourly: { hour: number; count: number }[];
  guestOrigin: { withAccount: number; anonymous: number; total: number };
  upcoming: {
    id: number;
    startTime: string;
    guestName: string;
    partySize: number;
    status: string;
    tables: string[];
  }[];
  halls: { hallId: number; name: string; totalTables: number; occupied: number; percent: number }[];
};
