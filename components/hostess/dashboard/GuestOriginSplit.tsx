import type { DashboardStats } from "@/lib/dashboard/types";

export function GuestOriginSplit({ origin, period }: { origin: DashboardStats["guestOrigin"]; period: 7 | 30 }) {
  const accountPercent = origin.total ? Math.round((origin.withAccount / origin.total) * 100) : 0;

  return (
    <div className="flex flex-wrap items-center gap-5">
      <div className="flex min-w-[180px] flex-col gap-0.5">
        <h2 className="font-display text-[19px] font-normal">С аккаунтом vs анонимные</h2>
        <span className="text-xs text-muted">от всех гостей за {period} дней</span>
      </div>
      <span className="font-display text-4xl tabular-nums">{accountPercent}%</span>
      <div className="flex flex-[1_1_260px] flex-col gap-2">
        <span className="block h-2.5 overflow-hidden rounded-full bg-[#2c2220]" aria-hidden="true">
          <i
            className="block h-full origin-left animate-[db-grow_1.2s_.4s_cubic-bezier(.6,0,.2,1)_both] rounded-full bg-claret"
            style={{ width: `${accountPercent}%` }}
          />
        </span>
        <div className="flex justify-between text-xs text-muted">
          <span>{origin.withAccount} с аккаунтом</span>
          <span>{origin.anonymous} анонимно</span>
        </div>
      </div>
    </div>
  );
}
