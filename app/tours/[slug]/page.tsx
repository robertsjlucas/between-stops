import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";
import { loadPublishedExperienceBySlug } from "@/lib/public-experiences";
import { createPublicServerClient } from "@/lib/supabase/public-server";

export const dynamic = "force-dynamic";

type TourPageProps = { params: Promise<{ slug: string }> };

const getTour = cache(
  async (slug: string) =>
    loadPublishedExperienceBySlug(
      createPublicServerClient(),
      slug
    )
);

export async function generateMetadata({ params }: TourPageProps): Promise<Metadata> {
  const { slug } = await params;
  let tour = null;

  try {
    tour = await getTour(slug);
  } catch {
    return {
      title: "Tour temporarily unavailable",
      robots: { index: false },
    };
  }

  if (!tour) return { title: "Tour not found" };
  const description = tour.summary || tour.fullDescription;

  return {
    title: tour.experience.title,
    description,
    alternates: { canonical: `/tours?tour=${tour.experience.id}` },
    openGraph: {
      title: tour.experience.title,
      description,
      type: "website",
      images: tour.coverImageUrl ? [{ url: tour.coverImageUrl }] : undefined,
    },
  };
}

export default async function TourPage({ params }: TourPageProps) {
  const { slug } = await params;
  const tour = await getTour(slug);

  if (!tour) notFound();
  redirect(`/tours?tour=${tour.experience.id}`);
}
