import type { Metadata } from "next";
import { I18nProvider } from "@/components/i18n/I18nProvider";

// Private screens: kept out of search results.
export const metadata: Metadata = {
  title: "Панель персонала",
  robots: { index: false, follow: false },
};

// The staff panel is Russian only, whatever language the guest site is in.
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider lang="ru" fixed>
      <div lang="ru" className="contents">
        {children}
      </div>
    </I18nProvider>
  );
}
