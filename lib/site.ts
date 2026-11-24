/** The public address of the site for absolute URLs (metadata, sitemap,
 * links from the Telegram bot): NEXT_PUBLIC_SITE_URL, else Vercel's
 * production domain, else localhost in development. */
export function siteOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel.replace(/\/+$/, "")}`;
  return "http://localhost:3000";
}

export const SITE_NAME = "TableFlow";
export const SITE_TITLE = "TableFlow — бронирование столиков онлайн";
export const SITE_DESCRIPTION =
  "Забронируйте столик за минуту: выберите стол на схеме зала, дату и время — без регистрации. Администратор подтвердит бронь.";
