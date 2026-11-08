import type { Metadata } from "next";
import { Fraunces, JetBrains_Mono, Manrope } from "next/font/google";
import "./globals.css";
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, siteOrigin } from "@/lib/site";
import { getLang } from "@/lib/i18n/server";
import { I18nProvider } from "@/components/i18n/I18nProvider";

// Fraunces ships no Cyrillic, so Russian headings fall through to Georgia -
// a deliberate pairing (the prototypes do the same). Disabling the
// metric-adjusted fallback keeps Georgia, not a Times clone, next in line.
const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  axes: ["opsz", "SOFT", "WONK"],
  fallback: ["Georgia", "serif"],
  adjustFontFallback: false,
});

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600", "700"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500"],
});

// What search engines and link previews show for the site.
export const metadata: Metadata = {
  metadataBase: new URL(siteOrigin()),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: "/",
  },
  twitter: { card: "summary", title: SITE_TITLE, description: SITE_DESCRIPTION },
  formatDetection: { telephone: false },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The guest's language (KZ/RU/EN switch) lives in a cookie.
  const lang = await getLang();
  return (
    <html
      lang={lang}
      className={`${fraunces.variable} ${manrope.variable} ${jetbrainsMono.variable} h-full`}
    >
      <body className="min-h-full flex flex-col overflow-x-hidden font-sans">
        <I18nProvider lang={lang}>{children}</I18nProvider>
      </body>
    </html>
  );
}
