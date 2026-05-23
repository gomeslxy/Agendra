import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/inbox", "/leads", "/agenda", "/reports", "/settings", "/onboarding"],
      },
    ],
    sitemap: "https://www.agendra.site/sitemap.xml",
  };
}
