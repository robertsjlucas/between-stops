import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://between-stops.vercel.app";
  return {
    rules: [{
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/creator", "/login", "/preview"],
    }],
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
