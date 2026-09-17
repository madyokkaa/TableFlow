import { UsersIcon } from "../icons";
import type { DashboardStats } from "@/lib/dashboard/types";

export function GuestOriginSplit({ origin }: { origin: DashboardStats["guestOrigin"] }) {
  const accountPercent = origin.total ? Math.round((origin.withAccount / origin.total) * 100) : 0;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:gap-6">
      <div className="flex shrink-0 items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-claret-tint text-claret">
          <UsersIcon className="h-[18px] w-[18px]" />
        </span>
        <div>
          <p className="font-display text-2xl text-ink tabular-nums">{accountPercent}%</p>
          <p className="text-xs text-muted">от зарегистрированных гостей</p>
        </div>
      </div>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-status-noshow-tint">
        <div
          className="h-full rounded-full bg-claret transition-[width] duration-700 ease-out"
          style={{ width: `${accountPercent}%` }}
        />
      </div>
      <div className="flex shrink-0 gap-4 text-xs text-muted">
        <span>{origin.withAccount} с аккаунтом</span>
        <span>{origin.anonymous} анонимно</span>
      </div>
    </div>
  );
}
