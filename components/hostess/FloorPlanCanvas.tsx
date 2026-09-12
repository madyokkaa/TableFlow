"use client";

import { useRef, useState } from "react";
import type { DiningTable } from "./TableForm";
import { SHAPE_SIZE } from "@/lib/tableShapes";

const DRAG_THRESHOLD_PX = 4;

function statusStyle(table: DiningTable, reservedToday: boolean): { label: string; className: string } {
  if (table.manual_status === "out_of_service") {
    return { label: "Не работает", className: "border-status-noshow bg-status-noshow-tint text-status-noshow" };
  }
  if (table.manual_status === "occupied") {
    return { label: "Занят", className: "border-status-cancelled bg-status-cancelled-tint text-status-cancelled" };
  }
  if (reservedToday) {
    return { label: "Забронирован сегодня", className: "border-status-pending bg-status-pending-tint text-status-pending" };
  }
  return { label: "Свободен", className: "border-status-confirmed bg-status-confirmed-tint text-status-confirmed" };
}

export function FloorPlanCanvas({
  tables,
  reservedTodayIds,
  onMove,
  onSelect,
}: {
  tables: DiningTable[];
  reservedTodayIds: Set<number>;
  onMove: (tableId: number, x: number, y: number) => void;
  onSelect: (table: DiningTable) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [dragState, setDragState] = useState<{ id: number; offsetX: number; offsetY: number } | null>(null);
  const [livePositions, setLivePositions] = useState<Record<number, { x: number; y: number }>>({});
  // Tracks whether the pointer actually moved past a small threshold during
  // the current gesture. Reading `dragState`/`dragging` in onClick doesn't
  // work: pointerup clears dragState synchronously, so by the time the
  // click event fires React has already re-rendered with dragging=false and
  // every drag ends by also opening the edit modal.
  const pointerDownAtRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef(false);

  function handlePointerDown(e: React.PointerEvent, table: DiningTable) {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const currentX = livePositions[table.id]?.x ?? table.pos_x;
    const currentY = livePositions[table.id]?.y ?? table.pos_y;
    pointerDownAtRef.current = { x: e.clientX, y: e.clientY };
    movedRef.current = false;
    setDragState({
      id: table.id,
      offsetX: e.clientX - rect.left - currentX,
      offsetY: e.clientY - rect.top - currentY,
    });
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent) {
    if (!dragState) return;
    const container = containerRef.current;
    if (!container) return;
    const start = pointerDownAtRef.current;
    if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) > DRAG_THRESHOLD_PX) {
      movedRef.current = true;
    }
    const rect = container.getBoundingClientRect();
    const table = tables.find((t) => t.id === dragState.id);
    const size = table ? SHAPE_SIZE[table.shape] : { w: 84, h: 84 };
    const x = Math.max(0, Math.min(rect.width - size.w, e.clientX - rect.left - dragState.offsetX));
    const y = Math.max(0, Math.min(rect.height - size.h, e.clientY - rect.top - dragState.offsetY));
    setLivePositions((prev) => ({ ...prev, [dragState.id]: { x, y } }));
  }

  function handlePointerUp() {
    if (!dragState) return;
    const pos = livePositions[dragState.id];
    if (pos && movedRef.current) onMove(dragState.id, Math.round(pos.x), Math.round(pos.y));
    setDragState(null);
  }

  function handleClick(table: DiningTable) {
    if (movedRef.current) return;
    onSelect(table);
  }

  return (
    <div
      ref={containerRef}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      className="relative h-[560px] w-full overflow-hidden rounded-2xl border border-line bg-paper"
      style={{
        backgroundImage: "radial-gradient(color-mix(in srgb, var(--color-line) 70%, transparent) 1px, transparent 1px)",
        backgroundSize: "24px 24px",
      }}
    >
      {tables.length === 0 && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-muted">
          Добавьте стол, чтобы разместить его здесь.
        </p>
      )}
      {tables.map((table) => {
        const size = SHAPE_SIZE[table.shape];
        const pos = livePositions[table.id] ?? { x: table.pos_x, y: table.pos_y };
        const status = statusStyle(table, reservedTodayIds.has(table.id));
        const dragging = dragState?.id === table.id;
        return (
          <button
            key={table.id}
            type="button"
            onPointerDown={(e) => handlePointerDown(e, table)}
            onClick={() => handleClick(table)}
            className={`absolute flex touch-none flex-col items-center justify-center border-2 text-center transition-shadow ${size.className} ${status.className} ${
              dragging ? "cursor-grabbing shadow-lg" : "cursor-grab shadow-sm hover:shadow-md"
            } ${!table.is_active ? "opacity-50" : ""}`}
            style={{ width: size.w, height: size.h, left: pos.x, top: pos.y, touchAction: "none" }}
            title={`${table.label} · ${status.label}`}
          >
            <span className="font-mono text-sm font-medium">{table.label}</span>
            <span className="text-[10px] tabular-nums opacity-80">
              {table.min_capacity}–{table.max_capacity}
            </span>
          </button>
        );
      })}
    </div>
  );
}
