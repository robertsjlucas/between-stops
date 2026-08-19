import type { MetadataRoute } from "next";
import { loadPublishedExperiences } from "@/lib/public-experiences";
import { createPublicServerClient } from "@/lib/supabase/public-server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://between-stops.vercel.app";
  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/tours`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/guides`, changeFrequency: "monthly", priority: 0.6 },
  ];
  try {
    const tours = await loadPublishedExperiences(createPublicServerClient());
    entries.push(...tours.filter((tour) => tour.slug).map((tour) => ({
      url: `${baseUrl}/tours/${tour.slug}`,
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })));
  } catch {
    // The base sitemap remains valid if the catalogue is temporarily unavailable.
  }
  return entries;
}
