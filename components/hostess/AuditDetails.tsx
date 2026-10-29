import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { StatusPill } from "@/components/StatusPill";
import { TelegramIcon } from "@/components/hostess/bookings/TelegramBadge";
import { HALL_OBJECT_META, isHallObjectKind } from "@/lib/floorPlan";
import { formatDateShort, guestsLabel } from "@/lib/ru";
import { STATUS_LABELS_RU, type ReservationStatus } from "@/lib/reservations";

export type AuditObject = Record<string, unknown>;

export type AuditItem = {
  id: number;
  at: string;
  actor_user_id: string | null;
  actor_role: "staff" | "guest" | "system";
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  details: {
    from?: string;
    to?: string;
    by?: string;
    via?: string;
    fields?: string[];
    changes?: Record<string, { from: unknown; to: unknown }>;
    count?: number;
    deleted?: number;
    hall_id?: number;
    existing_account?: boolean;
    [key: string]: unknown;
  };
  object: AuditObject | null;
};

/** Russian names for the fields the journal records. */
const FIELD_LABELS: Record<string, string> = {
  date: "Дата",
  start_time: "Время",
  duration_minutes: "Длительность",
  party_size: "Гостей",
  guest_name: "Имя гостя",
  guest_phone: "Телефон",
  guest_email: "Email",
  table_ids: "Столы",
  cancellation_reason: "Причина отмены",
  label: "Номер",
  shape: "Форма",
  min_capacity: "Мин. мест",
  max_capacity: "Макс. мест",
  pos_x: "Положение по X",
  pos_y: "Положение по Y",
  rotation: "Поворот",
  is_active: "Доступен для брони",
  manual_status: "Ручной статус",
  hall_id: "Зал",
  name: "Название",
  description: "Описание",
  width: "Ширина",
  height: "Глубина",
  kind: "Тип",
};

const SHAPES: Record<string, string> = { rectangle: "прямоугольный", round: "круглый", square: "квадратный" };
const MANUAL: Record<string, string> = { occupied: "занят", out_of_service: "не обслуживается" };
const SOURCES: Record<string, string> = { web: "сайт", staff: "персонал", telegram_ai: "Telegram-бот" };

export function statusLabel(status: unknown): string {
  return typeof status === "string" ? (STATUS_LABELS_RU[status as ReservationStatus] ?? status) : "—";
}

function formatValue(field: string, value: unknown, tableLabels: Record<string, string>): string {
  if (value === null || value === undefined || value === "") return "—";
  if (field === "date" && typeof value === "string") return formatDateShort(value);
  if (field === "start_time" && typeof value === "string") return value.slice(0, 5);
  if (field === "duration_minutes" && typeof value === "number") return `${value} мин`;
  if (field === "party_size" && typeof value === "number") return guestsLabel(value);
  if (field === "table_ids" && Array.isArray(value))
    return value.map((id) => tableLabels[String(id)] ?? `#${id}`).join(", ");
  if (field === "shape" && typeof value === "string") return SHAPES[value] ?? value;
  if (field === "manual_status" && typeof value === "string") return MANUAL[value] ?? value;
  if (field === "rotation" && typeof value === "number") return `${value}°`;
  if (typeof value === "boolean") return value ? "да" : "нет";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  return String(value);
}

type ReservationObject = {
  id: number;
  date: string;
  start_time: string;
  duration_minutes: number;
  party_size: number;
  guest_name: string;
  status: string;
  source?: string;
  cancelled_by?: string | null;
  cancellation_reason?: string | null;
  reservation_tables: { table_id: number; dining_tables: { label: string; halls: { name: string } | null } | null }[];
};

/** One line under the action in the list: what the row is about. */
export function objectSummary(item: AuditItem): string | null {
  const o = item.object;
  if (!o) return null;
  switch (item.entity) {
    case "reservation": {
      const r = o as unknown as ReservationObject;
      return `${r.guest_name} · ${formatDateShort(r.date)}, ${r.start_time.slice(0, 5)} · ${guestsLabel(r.party_size)}`;
    }
    case "table":
      return `Стол ${o.label}${(o.halls as { name?: string } | null)?.name ? ` · ${(o.halls as { name: string }).name}` : ""}`;
    case "hall":
      return String(o.name);
    case "hall_object": {
      const kind = isHallObjectKind(o.kind) ? HALL_OBJECT_META[o.kind].name : String(o.kind);
      return `${kind}${o.label ? ` «${o.label}»` : ""}`;
    }
    case "staff":
      return String(o.email);
    default:
      return null;
  }
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[130px_minmax(0,1fr)] gap-3 py-1.5 text-sm">
      <dt className="text-muted">{label}</dt>
      <dd className="min-w-0 break-words text-ink">{children}</dd>
    </div>
  );
}

function OpenLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex min-h-9 items-center gap-1.5 text-[13px] font-semibold text-claret underline decoration-claret/40 underline-offset-4 transition-colors hover:text-claret-strong"
    >
      {children}
      <ArrowUpRight className="h-3.5 w-3.5" strokeWidth={2.2} aria-hidden="true" />
    </Link>
  );
}

function ObjectBlock({ item }: { item: AuditItem }) {
  const o = item.object;
  if (item.entity === "guest_data") return null;
  if (!o) {
    return (
      <p className="text-sm text-muted">
        {item.entity_id ? "Объект уже удалён — в журнале остался только его номер." : "Без привязки к объекту."}
      </p>
    );
  }

  if (item.entity === "reservation") {
    const r = o as unknown as ReservationObject;
    const tables = r.reservation_tables.map((rt) => rt.dining_tables).filter((t): t is NonNullable<typeof t> => !!t);
    return (
      <dl>
        <Row label="Гость">{r.guest_name}</Row>
        <Row label="Когда">
          {formatDateShort(r.date)}, {r.start_time.slice(0, 5)} · {r.duration_minutes} мин
        </Row>
        <Row label="Гостей">{guestsLabel(r.party_size)}</Row>
        <Row label="Стол">
          {tables.length
            ? `${tables.map((t) => t.label).join(", ")}${tables[0].halls ? ` · ${tables[0].halls.name}` : ""}`
            : "—"}
        </Row>
        <Row label="Статус сейчас">
          <StatusPill status={r.status} />
        </Row>
        {r.source && (
          <Row label="Источник">
            <span className="inline-flex items-center gap-1.5">
              {r.source === "telegram_ai" && <TelegramIcon />}
              {SOURCES[r.source] ?? r.source}
            </span>
          </Row>
        )}
        {r.status === "cancelled" && r.cancellation_reason && (
          <Row label="Причина отмены">
            {r.cancelled_by === "guest" ? "Гость: " : r.cancelled_by === "host" ? "Персонал: " : ""}
            {r.cancellation_reason}
          </Row>
        )}
        <div className="pt-2">
          <OpenLink href={`/hostess?reservation=${r.id}`}>Открыть бронь</OpenLink>
        </div>
      </dl>
    );
  }

  if (item.entity === "table") {
    const hall = o.halls as { name: string } | null;
    return (
      <dl>
        <Row label="Стол">{String(o.label)}</Row>
        {hall && <Row label="Зал">{hall.name}</Row>}
        <Row label="Мест">
          {String(o.min_capacity)}–{String(o.max_capacity)}
        </Row>
        <Row label="Доступен">{o.is_active ? "да" : "нет"}</Row>
        {typeof o.manual_status === "string" && (
          <Row label="Ручной статус">{MANUAL[o.manual_status] ?? o.manual_status}</Row>
        )}
        <div className="pt-2">
          <OpenLink href={`/hostess/halls/${o.hall_id}`}>Открыть схему зала</OpenLink>
        </div>
      </dl>
    );
  }

  if (item.entity === "hall") {
    return (
      <dl>
        <Row label="Зал">{String(o.name)}</Row>
        <div className="pt-2">
          <OpenLink href={`/hostess/halls/${o.id}`}>Открыть схему зала</OpenLink>
        </div>
      </dl>
    );
  }

  if (item.entity === "hall_object") {
    const hall = o.halls as { name: string } | null;
    return (
      <dl>
        <Row label="Объект">{objectSummary(item)}</Row>
        {hall && <Row label="Зал">{hall.name}</Row>}
        <div className="pt-2">
          <OpenLink href={`/hostess/halls/${o.hall_id}`}>Открыть схему зала</OpenLink>
        </div>
      </dl>
    );
  }

  if (item.entity === "staff") {
    return (
      <dl>
        <Row label="Сотрудник">{String(o.email)}</Row>
        <div className="pt-2">
          <OpenLink href="/hostess/staff">Открыть сотрудников</OpenLink>
        </div>
      </dl>
    );
  }
  return null;
}

/** The expanded view of one journal row: who did what, to which object,
 * and what changed - values where the journal kept them, field names where
 * it deliberately didn't (guest name, phone, email, cancellation reason). */
export function AuditDetails({ item, tableLabels }: { item: AuditItem; tableLabels: Record<string, string> }) {
  const d = item.details;
  const changes = d.changes ?? {};
  const namesOnly = (d.fields ?? []).filter((f) => !(f in changes));
  const at = new Date(item.at).toLocaleString("ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="grid gap-6 border-t border-[#2a201d] bg-surface-raised/40 px-5 py-5 md:grid-cols-2">
      <section className="flex flex-col gap-1">
        <h3 className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">Что произошло</h3>
        <dl>
          <Row label="Когда">{at}</Row>
          <Row label="Кто">
            {item.actor_role === "guest"
              ? `Гость${d.via === "telegram" ? " (через Telegram)" : ""}`
              : item.actor_role === "system"
                ? "Система (плановая очистка)"
                : (item.actor_email ?? "Сотрудник (удалён)")}
          </Row>
          {d.from && d.to && (
            <Row label="Статус">
              <span className="inline-flex flex-wrap items-center gap-2">
                <StatusPill status={d.from} /> → <StatusPill status={d.to} />
              </span>
            </Row>
          )}
          {typeof d.count === "number" && <Row label="Обезличено броней">{d.count}</Row>}
          {typeof d.deleted === "number" && <Row label="Удалено броней">{d.deleted}</Row>}
          {typeof d.existing_account === "boolean" && (
            <Row label="Аккаунт">
              {d.existing_account ? "уже существовал — отправлена ссылка для пароля" : "создан новый"}
            </Row>
          )}
        </dl>

        {(Object.keys(changes).length > 0 || namesOnly.length > 0) && (
          <>
            <h3 className="mb-1 mt-4 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">Изменения</h3>
            <dl>
              {Object.entries(changes).map(([field, change]) => (
                <Row key={field} label={FIELD_LABELS[field] ?? field}>
                  <span className="text-muted line-through decoration-muted/60">
                    {formatValue(field, change.from, tableLabels)}
                  </span>
                  {" → "}
                  <span className="font-semibold">{formatValue(field, change.to, tableLabels)}</span>
                </Row>
              ))}
              {namesOnly.map((field) => (
                <Row key={field} label={FIELD_LABELS[field] ?? field}>
                  <span className="text-muted">изменено (значение в журнал не пишется)</span>
                </Row>
              ))}
            </dl>
          </>
        )}
      </section>

      <section className="flex flex-col gap-1">
        <h3 className="mb-1 font-mono text-[10.5px] uppercase tracking-[0.16em] text-muted">
          {item.entity === "reservation" ? `Бронь #${item.entity_id} сейчас` : "Объект сейчас"}
        </h3>
        <ObjectBlock item={item} />
      </section>
    </div>
  );
}
