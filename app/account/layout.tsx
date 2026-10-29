import type { Metadata } from "next";

// Private screens: kept out of search results.
export const metadata: Metadata = {
  title: "Аккаунт",
  robots: { index: false, follow: false },
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
