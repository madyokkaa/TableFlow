import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthenticatedUser, requireStaff } from "@/lib/supabase/auth";
import { RESERVATION_STATUSES, STATUS_LABELS_RU, mapRpcError } from "@/lib/reservations";
import { DEFAULT_DURATION_MINUTES } from "@/lib/scheduling";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

// Staff-only: list reservations with optional filters.
export async function GET(request: NextRequest) {
  const staff = await requireStaff(request);
  if (!staff) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const hallIdParam = searchParams.get("hall_id");
  const status = searchParams.get("status");

  let hallId: number | null = null;
  if (hallIdParam) {
    hallId = Number(hallIdParam);
    if (!Number.isInteger(hallId)) {
      return NextResponse.json({ error: "hall_id должен быть целым числом" }, { status: 400 });
    }
  }
  if (status && !(RESERVATION_STATUSES as readonly string[]).includes(status)) {
    return NextResponse.json(
      { error: `статус должен быть одним из: ${RESERVATION_STATUSES.map((s) => STATUS_LABELS_RU[s]).join(", ")}` },
      { status: 400 }
    );
  }
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "формат даты: ГГГГ-ММ-ДД" }, { status: 400 });
  }

  const supabase = createAdminClient();
  let query = supabase
    .from("reservations")
    .select(
      "*, reservation_tables(table_id, dining_tables(id, label, hall_id, halls(id, name)))"
    )
    .order("date")
    .order("start_time");

  if (date) {
    query = query.eq("date", date);
  }
  if (status) {
    query = query.eq("status", status);
  }

  const { data, error } = await query;
  if (error) {
    console.error("[reservations.list] query failed", error);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  let results = data ?? [];
  if (hallId !== null) {
    results = results.filter((r: { reservation_tables: { dining_tables: { hall_id: number } }[] }) =>
      r.reservation_tables.some((rt) => rt.dining_tables.hall_id === hallId)
    );
  }

  return NextResponse.json(results);
}

// Public (guest, authenticated): create a single-table self-service reservation.
export async function POST(request: NextRequest) {
  const user = await getAuthenticatedUser(request);
  if (!user) {
    return NextResponse.json({ error: "требуется авторизация" }, { status: 401 });
  }

  const payload = await request.json().catch(() => ({}));
  const { table_id, date, start_time, guest_name, guest_phone, guest_email, party_size } = payload as Record<
    string,
    unknown
  >;

  const errors: Record<string, string> = {};
  if (typeof table_id !== "number" || !Number.isInteger(table_id)) errors.table_id = "обязательное поле";
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) errors.date = "формат даты: ГГГГ-ММ-ДД";
  if (typeof start_time !== "string" || !/^\d{2}:\d{2}(:\d{2})?$/.test(start_time)) errors.start_time = "формат времени: ЧЧ:ММ";

  if (typeof guest_name !== "string" || !guest_name.trim()) {
    errors.guest_name = "обязательное поле";
  } else if (guest_name.length > 120) {
    errors.guest_name = "не более 120 символов";
  }
  if (guest_phone !== undefined && guest_phone !== null && typeof guest_phone !== "string") {
    errors.guest_phone = "должно быть строкой";
  } else if (typeof guest_phone === "string" && guest_phone.length > 30) {
    errors.guest_phone = "не более 30 символов";
  }
  if (guest_email !== undefined && guest_email !== null && typeof guest_email !== "string") {
    errors.guest_email = "должно быть строкой";
  } else if (typeof guest_email === "string" && guest_email.length > 255) {
    errors.guest_email = "не более 255 символов";
  }
  if (!guest_phone && !guest_email && !errors.guest_phone && !errors.guest_email) {
    errors.guest_phone = "укажите телефон или email";
  }
  if (typeof party_size !== "number" || !Number.isInteger(party_size) || party_size < 1 || party_size > 100) {
    errors.party_size = "должно быть положительным целым числом (не более 100)";
  }
  if (typeof date === "string" && date < todayIsoDate()) {
    errors.date = "нельзя забронировать в прошлом";
  }

  if (Object.keys(errors).length > 0) {
    return NextResponse.json({ error: "validation_failed", details: errors }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: table, error: tableError } = await supabase
    .from("dining_tables")
    .select("id, max_capacity, is_active, manual_status")
    .eq("id", table_id as number)
    .maybeSingle();
  if (tableError) {
    console.error("[reservations.create] table lookup failed", tableError);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }
  if (!table || !table.is_active || table.manual_status === "out_of_service") {
    return NextResponse.json({ error: `стол ${table_id} недоступен` }, { status: 404 });
  }
  if ((party_size as number) > table.max_capacity) {
    return NextResponse.json(
      { error: "validation_failed", details: { party_size: `превышает вместимость стола (${table.max_capacity})` } },
      { status: 400 }
    );
  }

  const { data: reservationId, error: rpcError } = await supabase.rpc("create_reservation", {
    p_date: date as string,
    p_start_time: start_time as string,
    p_duration_minutes: DEFAULT_DURATION_MINUTES,
    p_guest_user_id: user.id,
    p_guest_name: (guest_name as string).trim(),
    p_guest_phone: (guest_phone as string | undefined) ?? null,
    p_guest_email: (guest_email as string | undefined) ?? null,
    p_party_size: party_size as number,
    p_created_by: null,
    p_table_ids: [table_id],
  });

  if (rpcError) {
    const mapped = mapRpcError(rpcError);
    return NextResponse.json(mapped.body, { status: mapped.status });
  }

  const { data: reservation, error: fetchError } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", reservationId as number)
    .single();
  if (fetchError) {
    console.error("[reservations.create] fetch-after-create failed", fetchError);
    return NextResponse.json({ error: "внутренняя ошибка сервера, попробуйте позже" }, { status: 500 });
  }

  return NextResponse.json(reservation, { status: 201 });
}
