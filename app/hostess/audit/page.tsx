"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import { apiFetch, parseError } from "@/lib/api";
import { AdminShell } from "@/components/hostess/AdminShell";
import { CAPTION, INPUT } from "@/components/hostess/hall-editor/controls";
import { ChevronDown } from "lucide-react";
import { AuditDetails, objectSummary, statusLabel, type AuditItem } from "@/components/hostess/AuditDetails";

const NETWORK_ERROR = "Не удалось связаться с сервером. Проверьте подключение и попробуйте снова.";

const ACTION_LABELS: Record<string, string> = {
  "reservation.status_changed": "Смена статуса брони",
  "reservation.cancelled": "Отмена брони",
  "reservation.updated": "Изменение брони",
  "table.created": "Новый стол",
  "table.updated": "Изменение стола",
  "table.deleted": "Удаление стола",
  "hall.created": "Новый зал",
  "hall.updated": "Изменение зала",
  "hall.deleted": "Удаление зала",
  "hall_object.created": "Новый объект на схеме",
  "hall_object.updated": "Изменение объекта на схеме",
  "hall_object.deleted": "Удаление объекта со схемы",
  "staff.added": "Доступ сотруднику",
  "staff.email_changed": "Смена email сотрудника",
  "staff.deactivated": "Доступ сотрудника отключён",
  "staff.removed": "Сотрудник удалён",
  "staff.password_reset": "Ссылка для сброса пароля",
  "guest_data.erased": "Удаление данных по запросу гостя",
  "reservation.cleanup": "Плановая очистка старых броней",
};

const ENTITY_LABELS: Record<string, string> = {
  reservation: "Бронь",
  table: "Стол",
  hall: "Зал",
  hall_object: "Объект схемы",
  staff: "Сотрудник",
  guest_data: "Данные гостя",
};

const ENTITY_FILTERS = ["", "reservation", "table", "hall", "hall_object", "staff"] as const;

function formatAt(iso: string): string {
  return new Date(iso).toLocaleString("ru-RU", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function actorLabel(item: AuditItem): string {
  if (item.actor_role === "guest") return "Гость";
  if (item.actor_role === "system") return "Система";
  return item.actor_email ?? "Сотрудник (удалён)";
}

function detailsLabel(item: AuditItem): string | null {
  const { from, to, fields, count, deleted, changes } = item.details;
  if (from && to) return `${statusLabel(from)} → ${statusLabel(to)}`;
  const changed = [...new Set([...Object.keys(changes ?? {}), ...(fields ?? [])])];
  if (changed.length) return `Изменено полей: ${changed.length}`;
  if (typeof count === "number") return `Обезличено записей: ${count}`;
  if (typeof deleted === "number") return `Удалено броней: ${deleted}`;
  return null;
}

function AuditJournal() {
  const [items, setItems] = useState<AuditItem[] | null>(null);
  const [nextBefore, setNextBefore] = useState<number | null>(null);
  const [entity, setEntity] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [openId, setOpenId] = useState<number | null>(null);
  const [tableLabels, setTableLabels] = useState<Record<string, string>>({});

  const fetchPage = useCallback(
    async (before: number | null) => {
      const params = new URLSearchParams({ limit: "50" });
      if (before !== null) params.set("before", String(before));
      if (entity) params.set("entity", entity);
      const res = await apiFetch(`/api/audit?${params}`);
      if (!res.ok) throw new Error(await parseError(res));
      return (await res.json()) as {
        items: AuditItem[];
        table_labels?: Record<string, string>;
        next_before: number | null;
      };
    },
    [entity]
  );

  useEffect(() => {
    let cancelled = false;
    fetchPage(null)
      .then((page) => {
        if (cancelled) return;
        setItems(page.items);
        setTableLabels(page.table_labels ?? {});
        setNextBefore(page.next_before);
        setError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setItems([]);
        setError(err instanceof TypeError ? NETWORK_ERROR : (err as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [fetchPage]);

  async function loadMore() {
    if (nextBefore === null) return;
    setLoadingMore(true);
    try {
      const page = await fetchPage(nextBefore);
      setItems((current) => [...(current ?? []), ...page.items]);
      setTableLabels((current) => ({ ...current, ...page.table_labels }));
      setNextBefore(page.next_before);
    } catch (err) {
      setError(err instanceof TypeError ? NETWORK_ERROR : (err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[40px] font-normal leading-[1.05] tracking-[-0.02em]">Журнал действий</h1>
          <p className="mt-1 text-sm text-muted">Кто и что менял в бронях, залах и доступе сотрудников.</p>
        </div>
        <label className="flex w-full flex-col gap-2 sm:w-56">
          <span className={CAPTION}>Объект</span>
          <select
            value={entity}
            onChange={(e) => {
              setItems(null);
              setEntity(e.target.value);
            }}
            className={INPUT}
          >
            {ENTITY_FILTERS.map((value) => (
              <option key={value} value={value}>
                {value ? ENTITY_LABELS[value] : "Все"}
              </option>
            ))}
          </select>
        </label>
      </div>

      <section aria-label="Журнал действий" className="overflow-hidden rounded-[22px] border border-line bg-[#1a1412]">
        {items === null ? (
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="skeleton h-12 rounded-xl" />
            ))}
          </div>
        ) : error && items.length === 0 ? (
          <p role="alert" className="px-4 py-8 text-center text-sm text-status-cancelled">
            {error}
          </p>
        ) : items.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted">Записей пока нет.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-[#2a201d]">
                  {["Время", "Кто", "Действие", "Объект", ""].map((h) => (
                    <th key={h} scope="col" className={`${CAPTION} px-5 py-3 font-normal`}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const details = detailsLabel(item);
                  const summary = objectSummary(item);
                  const open = openId === item.id;
                  const toggle = () => setOpenId(open ? null : item.id);
                  return (
                    <Fragment key={item.id}>
                      <tr
                        onClick={toggle}
                        className={`cursor-pointer border-b border-[#2a201d] transition-colors hover:bg-surface-raised ${open ? "bg-surface-raised" : ""}`}
                      >
                        <td className="whitespace-nowrap px-5 py-3 font-mono text-xs tabular-nums text-muted">
                          <time dateTime={item.at}>{formatAt(item.at)}</time>
                        </td>
                        <td className="max-w-[220px] truncate px-5 py-3" title={item.actor_email ?? undefined}>
                          {actorLabel(item)}
                        </td>
                        <td className="px-5 py-3">
                          <span className="font-semibold text-ink">{ACTION_LABELS[item.action] ?? item.action}</span>
                          {details && <span className="block text-xs text-muted">{details}</span>}
                        </td>
                        <td className="max-w-[320px] px-5 py-3 text-muted">
                          <span className="whitespace-nowrap">
                            {ENTITY_LABELS[item.entity] ?? item.entity}
                            {item.entity_id && item.entity !== "staff" && (
                              <span className="font-mono text-xs"> #{item.entity_id}</span>
                            )}
                          </span>
                          {summary ? (
                            <span className="block truncate text-xs text-ink/80">{summary}</span>
                          ) : (
                            item.entity_id && <span className="block text-xs">удалён</span>
                          )}
                        </td>
                        <td className="w-12 px-3 py-3 text-right">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggle();
                            }}
                            aria-expanded={open}
                            aria-label={open ? "Скрыть подробности" : "Показать подробности"}
                            className="inline-flex h-9 w-9 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-[#2a201d] hover:text-ink"
                          >
                            <ChevronDown
                              className={`h-4 w-4 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
                              strokeWidth={2.2}
                              aria-hidden="true"
                            />
                          </button>
                        </td>
                      </tr>
                      {open && (
                        <tr className="border-b border-[#2a201d]">
                          <td colSpan={5} className="p-0">
                            <AuditDetails item={item} tableLabels={tableLabels} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {error && items && items.length > 0 && (
        <p role="alert" className="rounded-[13px] bg-status-cancelled-tint px-3 py-2 text-sm text-status-cancelled">
          {error}
        </p>
      )}
      {nextBefore !== null && (
        <button
          type="button"
          onClick={loadMore}
          disabled={loadingMore}
          className="inline-flex h-11 items-center justify-center self-center rounded-[13px] border border-line-strong px-[18px] text-sm font-semibold text-ink transition-colors hover:bg-surface-raised disabled:opacity-50"
        >
          {loadingMore ? "Загружаем…" : "Показать ещё"}
        </button>
      )}
    </div>
  );
}

export default function AuditPage() {
  return (
    <AdminShell>
      <AuditJournal />
    </AdminShell>
  );
}
