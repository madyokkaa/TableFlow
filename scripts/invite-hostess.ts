/**
 * Provisions a hostess account (email+password via Supabase Auth admin API,
 * then a row in public.staff) - there is no public signup route for staff
 * by design. Run with:
 *   npx tsx scripts/invite-hostess.ts <email> <password>
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

async function main() {
  const [, , email, password] = process.argv;
  if (!email || !password) {
    console.error("Usage: npx tsx scripts/invite-hostess.ts <email> <password>");
    process.exit(1);
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceRoleKey) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not configured");
  }
  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (createError) throw createError;

  const { error: staffError } = await admin.from("staff").insert({ user_id: created.user!.id, active: true });
  if (staffError) throw staffError;

  console.log(`Hostess account ready: ${email}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
