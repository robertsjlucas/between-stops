import { notFound, permanentRedirect } from "next/navigation";
import { cache } from "react";

import { loadPublishedExperienceBySlug } from "@/lib/public-experiences";
import { createPublicServerClient } from "@/lib/supabase/public-server";

export const dynamic = "force-dynamic";

type TourPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{
    checkout?: string;
    session_id?: string;
    tip?: string;
  }>;
};

const getTour = cache(
  async (slug: string) =>
    loadPublishedExperienceBySlug(
      createPublicServerClient(),
      slug
    )
);

export default async function TourPage({
  params,
  searchParams,
}: TourPageProps) {
  const { slug } = await params;
  const query = await searchParams;
  const tour = await getTour(slug);

  if (!tour) notFound();

  const country = tour.countrySlug ?? "uk";
  const city = tour.citySlug ?? "edinburgh";
  const canonicalSlug = tour.slug ?? slug;

  const destination = new URL(
    `https://www.beyondthestops.com/${country}/${city}/experiences/${canonicalSlug}`
  );

  if (query.checkout) {
    destination.searchParams.set("checkout", query.checkout);
  }

  if (query.session_id) {
    destination.searchParams.set("session_id", query.session_id);
  }

  if (query.tip) {
    destination.searchParams.set("tip", query.tip);
  }

  permanentRedirect(
    `${destination.pathname}${destination.search}`
  );
}
