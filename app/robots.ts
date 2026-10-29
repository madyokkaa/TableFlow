import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/hostess", "/account", "/api/", "/auth/"] },
    sitemap: `${siteOrigin()}/sitemap.xml`,
  };
}
