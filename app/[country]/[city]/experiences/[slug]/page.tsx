import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  loadPublishedExperienceByLocationSlug,
} from "@/lib/public-experiences";
import { createPublicServerClient } from "@/lib/supabase/public-server";

import "./page.css";

export const dynamic = "force-dynamic";

type ExperiencePageProps = {
  params: Promise<{
    country: string;
    city: string;
    slug: string;
  }>;
};

const getExperience = cache(
  async (
    country: string,
    city: string,
    slug: string
  ) =>
    loadPublishedExperienceByLocationSlug(
      createPublicServerClient(),
      country,
      city,
      slug
    )
);

function getCanonicalPath(
  country: string,
  city: string,
  slug: string
) {
  return `/${country}/${city}/experiences/${slug}`;
}

function formatPrice(
  accessType: "free" | "paid" | "sponsored",
  pricePence: number | undefined,
  currency: string
) {
  if (accessType === "free") return "Free";

  if (pricePence === undefined) {
    return accessType === "sponsored"
      ? "Sponsored"
      : "Paid";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency,
  }).format(pricePence / 100);
}

export async function generateMetadata({
  params,
}: ExperiencePageProps): Promise<Metadata> {
  const { country, city, slug } = await params;
  const tour = await getExperience(
    country,
    city,
    slug
  );

  if (!tour) {
    return {
      title: "Experience not found",
      robots: { index: false, follow: false },
    };
  }

  const cityName = tour.city ?? city;
  const description =
    tour.summary || tour.fullDescription;

  const canonical = getCanonicalPath(
    country,
    city,
    slug
  );

  return {
    title: `${tour.experience.title} | ${cityName} Audio Guide`,
    description,
    alternates: {
      canonical,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: `${tour.experience.title} | ${cityName} Audio Guide`,
      description,
      type: "website",
      url: canonical,
      images: tour.coverImageUrl
        ? [
            {
              url: tour.coverImageUrl,
              alt: tour.experience.title,
            },
          ]
        : undefined,
    },
  };
}

export default async function ExperiencePage({
  params,
}: ExperiencePageProps) {
  const { country, city, slug } = await params;
  const tour = await getExperience(
    country,
    city,
    slug
  );

  if (!tour) notFound();

  const cityName = tour.city ?? city;
  const passengerHref =
    `/htours?tour=${tour.experience.id}`;

  return (
    <main className="seoExperienceXPage">
      <header className="seoExperienceHeader">
        <Link
          className="seoExperienceBrand"
          href="/"
        >
          <img
            src="/branding/between-stops-logo-light.png?v=1"
            alt=""
          />
          <span>Beyond the Stops</span>
        </Link>

        <Link
          className="seoExperienceExplore"
          href="/tours"
        >
          Explore journeys
        </Link>
      </header>

      <article>
        <div className="seoExperienceBreadcrumb">
          <span>{country.toUpperCase()}</span>
          <span aria-hidden="true">/</span>
          <span>{cityName}</span>
          <span aria-hidden="true">/</span>
          <span>Experience</span>
        </div>

        {tour.coverImageUrl && (
          <div className="seoExperienceHeroImage">
            <img
              src={tour.coverImageUrl}
              alt={`${tour.experience.title} in ${cityName}`}
            />
          </div>
        )}

        <section className="seoExperienceIntro">
          <p className="seoExperienceKicker">
            {tour.transportLabel} audio experience · {cityName}
          </p>

          <h1>{tour.experience.title}</h1>

          {tour.creator && (
            <p className="seoExperienceCreator">
              By {tour.creator.displayName}
            </p>
          )}

          <p className="seoExperienceSummary">
            {tour.summary}
          </p>

          <div className="seoExperienceFacts">
            <div>
              <span>Journey</span>
              <strong>
                {tour.experience.startLabel} to{" "}
                {tour.experience.endLabel}
              </strong>
            </div>

            <div>
              <span>Transport</span>
              <strong>{tour.transportLabel}</strong>
            </div>

            <div>
              <span>Duration</span>
              <strong>
                Around {tour.experience.durationMinutes} mins
              </strong>
            </div>

            <div>
              <span>Price</span>
              <strong>
                {formatPrice(
                  tour.accessType,
                  tour.pricePence,
                  tour.currency
                )}
              </strong>
            </div>
          </div>

          <Link
            className="seoExperiencePrimaryAction"
            href={passengerHref}
          >
            Open this experience
          </Link>
        </section>

        {tour.fullDescription && (
          <section className="seoExperienceSection">
            <p className="seoExperienceKicker">
              ABOUT THIS JOURNEY
            </p>
            <h2>
              Discover more as you travel through {cityName}
            </h2>
            <p>{tour.fullDescription}</p>
          </section>
        )}

        {tour.experience.stories.length > 0 && (
          <section className="seoExperienceSection">
            <p className="seoExperienceKicker">
              ALONG THE WAY
            </p>
            <h2>Stories on this journey</h2>
            <ul className="seoStoryList">
              {tour.experience.stories.map(
                (story) => (
                  <li key={story.id}>
                    {story.title}
                  </li>
                )
              )}
            </ul>
          </section>
        )}

        <section className="seoExperienceSection seoExperienceHow">
          <p className="seoExperienceKicker">
            HOW IT WORKS
          </p>
          <h2>Listen as the journey unfolds</h2>
          <p>
            Beyond the Stops uses your location to play
            stories at the right moments while you travel.
            Use headphones, take your normal journey, and
            let the experience unfold along the route.
          </p>

          <Link
            className="seoExperienceSecondaryAction"
            href={passengerHref}
          >
            View journey details
          </Link>
        </section>
      </article>

      <footer className="seoExperienceFooter">
        <strong>Beyond the Stops</strong>
        <span>There&apos;s more to the journey.</span>
      </footer>
    </main>
  );
}
