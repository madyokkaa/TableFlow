export const RESERVATION_STATUSES = ["pending", "confirmed", "cancelled", "no-show", "completed"] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

export const STATUS_LABELS_RU: Record<ReservationStatus, string> = {
  pending: "Ожидает",
  confirmed: "Подтверждена",
  cancelled: "Отменена",
  "no-show": "Не пришли",
  completed: "Завершена",
};

// Terminal states (cancelled/no-show/completed) have no outgoing transitions.
export const ALLOWED_STATUS_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["cancelled", "no-show", "completed"],
  cancelled: [],
  "no-show": [],
  completed: [],
};

export function mapRpcError(error: { code?: string; message: string }): {
  status: number;
  body: Record<string, unknown>;
} {
  if (error.code === "23P01") {
    return { status: 409, body: { error: "этот стол уже занят на выбранное время" } };
  }
  if (error.code === "P0001") {
    // Postgres raise-exception text stays in English (see the migrations) -
    // translate the cases the UI actually surfaces rather than passing that
    // text straight through to a Russian-speaking hostess.
    const capacityMatch = error.message.match(/party_size (\d+) exceeds combined table capacity (\d+)/);
    if (capacityMatch) {
      return {
        status: 400,
        body: {
          error: "validation_failed",
          details: {
            party_size: `на ${capacityMatch[1]} гостей не хватает мест - вместимость выбранных столов ${capacityMatch[2]}`,
          },
        },
      };
    }
    if (error.message.includes("past")) {
      return { status: 400, body: { error: "validation_failed", details: { date: "нельзя забронировать в прошлом" } } };
    }
    if (error.message.includes("at least one table")) {
      return { status: 400, body: { error: "validation_failed", details: { table_ids: "укажите хотя бы один стол" } } };
    }
    if (error.message.includes("cannot move a reservation from")) {
      return { status: 409, body: { error: "нельзя изменить статус этой брони - обновите страницу и попробуйте снова" } };
    }
    if (error.message.includes("must start as pending")) {
      return { status: 400, body: { error: "новая бронь должна начинаться со статуса «ожидает»" } };
    }
    if (error.message.includes("not found")) {
      return { status: 404, body: { error: "бронь не найдена" } };
    }
    return { status: 400, body: { error: "не удалось сохранить бронь - проверьте данные и попробуйте снова" } };
  }
  console.error("[reservations] rpc failed", error);
  return { status: 500, body: { error: "внутренняя ошибка сервера, попробуйте позже" } };
}
