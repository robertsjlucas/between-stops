import type { MetadataRoute } from "next";
import { loadPublishedExperiences } from "@/lib/public-experiences";
import { createPublicServerClient } from "@/lib/supabase/public-server";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.beyondthestops.com";
  const entries: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/tours`, changeFrequency: "daily", priority: 0.9 },
    { url: `${baseUrl}/guides`, changeFrequency: "monthly", priority: 0.6 },
  ];
  try {
    const tours = await loadPublishedExperiences(createPublicServerClient());
    const cityPaths = new Set(
      tours
        .filter(
          (tour) =>
            tour.countrySlug &&
            tour.citySlug
        )
        .map(
          (tour) =>
            `/${tour.countrySlug}/${tour.citySlug}`
        )
    );

    entries.push(
      ...Array.from(cityPaths).map(
        (path) => ({
          url: `${baseUrl}${path}`,
          changeFrequency: "weekly" as const,
          priority: 0.9,
        })
      ),
      ...tours
        .filter(
          (tour) =>
            tour.countrySlug &&
            tour.citySlug &&
            tour.slug
        )
        .map((tour) => ({
          url:
            `${baseUrl}/${tour.countrySlug}/${tour.citySlug}/experiences/${tour.slug}`,
          changeFrequency: "weekly" as const,
          priority: 0.8,
        }))
    );
  } catch {
    // The base sitemap remains valid if the catalogue is temporarily unavailable.
  }
  return entries;
}
