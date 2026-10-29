/** True when a Supabase/PostgREST error means "that column or table doesn't
 * exist yet" - i.e. code written for a newer migration is running against a
 * database that hasn't had it applied. Routes use this to degrade (empty
 * list, clear message) instead of failing with a generic 500. */
export function isMissingSchemaError(error: { code?: string } | null | undefined): boolean {
  if (!error?.code) return false;
  return (
    error.code === "PGRST204" || // column not in PostgREST's schema cache
    error.code === "PGRST205" || // table not in PostgREST's schema cache
    error.code === "PGRST202" || // function not in PostgREST's schema cache
    error.code === "42703" || // undefined_column
    error.code === "42P01" || // undefined_table
    error.code === "42883" // undefined_function
  );
}

export const MIGRATION_PENDING_MESSAGE =
  "эта настройка появится после применения миграции базы данных (supabase db push)";
