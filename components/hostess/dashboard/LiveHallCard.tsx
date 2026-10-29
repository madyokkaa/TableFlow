"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { hallPlanSize } from "@/lib/floorPlan";
import { getFloorData } from "@/lib/floorData";
import { tableSize } from "@/lib/tableShapes";
import { planUnits } from "@/components/floor-plan/PlanShapes";
import type { Hall } from "@/components/hostess/HallForm";
import type { DiningTable } from "@/components/hostess/TableForm";
import type { DashboardStats, LiveTableState } from "@/lib/dashboard/types";
import { CARD_LINK, DashboardCard } from "./DashboardCard";

const STATE_CLASSES: Record<LiveTableState["state"], string> = {
  free: "border-[#3d6b4f] bg-[#18241c] text-[#a8dcbc]",
  busy: "border-status-pending bg-[#3a2c14] text-status-pending after:absolute after:-inset-[5px] after:animate-[gp-ripple_1.8s_ease-out_infinite] after:rounded-[inherit] after:border after:border-status-pending",
  off: "border-[#5a4a45] bg-[repeating-linear-gradient(45deg,#1d1513_0_4px,#262019_4px_8px)] text-[#8f7c75]",
};

const STATE_LABELS: Record<LiveTableState["state"], string> = { free: "свободен", busy: "занят", off: "не в строю" };

/** Hall geometry for the mini plan - the same public endpoints the guest
 * page reads, via the shared floor-data cache. Statuses come live from the
 * dashboard stats. */
function useHallGeometry() {
  const [halls, setHalls] = useState<Hall[]>([]);
  const [tables, setTables] = useState<DiningTable[]>([]);
  useEffect(() => {
    let cancelled = false;
    getFloorData()
      .then((floor) => {
        if (!cancelled) {
          setHalls(floor.halls);
          setTables(floor.tables);
        }
      })
      .catch(() => {
        // The counts and meters below still work without the plan.
      });
    return () => {
      cancelled = true;
    };
  }, []);
  return { halls, tables };
}

/** "Залы сейчас": a live mini plan of one hall (pick another by clicking its
 * meter), free / busy / out-of-service totals and a load meter per hall. */
export function LiveHallCard({ stats }: { stats: DashboardStats }) {
  const { halls, tables } = useHallGeometry();
  const [pickedHallId, setPickedHallId] = useState<number | null>(null);
  const hallId = pickedHallId ?? stats.halls[0]?.hallId ?? null;
  const hall = halls.find((h) => h.id === hallId) ?? null;
  const states = new Map((stats.liveTables ?? []).map((t) => [t.id, t.state]));
  const shown = hall ? tables.filter((t) => t.hall_id === hall.id && states.has(t.id)) : [];
  const room = hallPlanSize(hall ?? {});
  const unit = planUnits(room.w);

  return (
    <DashboardCard
      title="Залы сейчас"
      action={
        hallId !== null && (
          <Link href={`/hostess/halls/${hallId}`} className={CARD_LINK}>
            План →
          </Link>
        )
      }
    >
      {hall && shown.length > 0 && (
        <div
          role="img"
          aria-label={`${hall.name}: ${shown.filter((t) => states.get(t.id) === "busy").length} из ${shown.length} столов заняты`}
          className="relative overflow-hidden rounded-2xl border border-[#2c2220] bg-[#181210] [container-type:inline-size]"
          style={{
            aspectRatio: `${room.w} / ${room.h}`,
            backgroundImage: "linear-gradient(#211816 1px, transparent 1px), linear-gradient(90deg, #211816 1px, transparent 1px)",
            backgroundSize: `${(40 / room.w) * 100}% ${(40 / room.h) * 100}%`,
          }}
        >
          {shown.map((t, i) => {
            const size = tableSize(t.shape, t.max_capacity);
            const state = states.get(t.id) ?? "free";
            return (
              <span
                key={t.id}
                title={`Стол ${t.label} — ${STATE_LABELS[state]}`}
                className={`absolute flex animate-[fp-fadein_.6s_both] items-center justify-center border font-mono ${STATE_CLASSES[state]}`}
                style={{
                  left: `${(t.pos_x / room.w) * 100}%`,
                  top: `${(t.pos_y / room.h) * 100}%`,
                  width: unit(size.w),
                  height: unit(size.h),
                  borderRadius: t.shape === "round" ? "50%" : "1.2cqw",
                  transform: `translate(-50%, -50%) rotate(${t.rotation ?? 0}deg)`,
                  fontSize: `max(8px, ${unit(18)})`,
                  animationDelay: `${i * 40}ms`,
                }}
              >
                <span style={{ transform: `rotate(${-(t.rotation ?? 0)}deg)` }}>{t.label}</span>
              </span>
            );
          })}
        </div>
      )}
      <div className="grid grid-cols-3 gap-2">
        {(
          [
            [stats.occupancy.free, "Свободно", "text-status-confirmed"],
            [stats.occupancy.occupied, "Занято", "text-status-pending"],
            [stats.occupancy.outOfService, "Не в строю", "text-[#a8958e]"],
          ] as const
        ).map(([value, label, color]) => (
          <div key={label} className="flex flex-col gap-0.5 rounded-[14px] border border-[#2c2220] p-2.5 text-center">
            <b className={`font-display text-2xl font-normal tabular-nums ${color}`}>{value}</b>
            <small className="text-[11px] text-[#a8958e]">{label}</small>
          </div>
        ))}
      </div>
      {stats.halls.map((h) => (
        <button
          key={h.hallId}
          type="button"
          onClick={() => setPickedHallId(h.hallId)}
          aria-pressed={h.hallId === hallId}
          aria-label={`${h.name}: занято ${h.occupied} из ${h.totalTables}. Показать на плане`}
          className={`-mx-2 flex flex-col gap-1.5 rounded-xl px-2 py-1.5 text-left transition-colors hover:bg-surface-raised ${
            h.hallId === hallId ? "bg-surface-raised" : ""
          }`}
        >
          <span className="flex justify-between text-xs">
            <b>{h.name}</b>
            <span className="text-muted">
              {h.occupied} из {h.totalTables}
            </span>
          </span>
          <span className="block h-1.5 overflow-hidden rounded-md bg-[#2c2220]" aria-hidden="true">
            <i
              className="block h-full origin-left animate-[db-grow_1.2s_.4s_cubic-bezier(.6,0,.2,1)_both] rounded-md bg-claret"
              style={{ width: `${h.percent}%` }}
            />
          </span>
        </button>
      ))}
    </DashboardCard>
  );
}
