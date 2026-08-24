import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import {
  loadPublishedExperiences,
  type PublicExperienceOption,
} from "@/lib/public-experiences";
import { createPublicServerClient } from "@/lib/supabase/public-server";

import "./page.css";

export const dynamic = "force-dynamic";

type IntentPageProps = {
  params: Promise<{
    country: string;
    city: string;
    intent: string;
  }>;
};

type IntentConfig = {
  label: string;
  kicker: string;
  heading: (city: string) => string;
  intro: (city: string) => string;
  title: (city: string) => string;
  description: (city: string) => string;
  matches: (option: PublicExperienceOption) => boolean;
};

function includesAirport(option: PublicExperienceOption) {
  const values = [
    option.experience.title,
    option.summary,
    option.fullDescription,
    option.experience.startLabel,
    option.experience.endLabel,
  ];

  return values.some((value) =>
    value?.toLowerCase().includes("airport")
  );
}

const intentConfigs: Record<string, IntentConfig> = {
  tram: {
    label: "Tram",
    kicker: "EDINBURGH BY TRAM",
    heading: (city) =>
      `Audio experiences for tram journeys through ${city}.`,
    intro: (city) =>
      `Discover what is outside the window while you travel by tram through ${city}. These location-aware audio experiences follow the journey and play stories as the places they belong to come into view.`,
    title: (city) =>
      `${city} Tram Audio Guides`,
    description: (city) =>
      `Location-aware audio guides for tram journeys through ${city}. Listen to stories and discover places as you travel.`,
    matches: (option) =>
      option.route.mode === "tram",
  },
  free: {
    label: "Free",
    kicker: "FREE TO LISTEN",
    heading: (city) =>
      `Free audio experiences for journeys through ${city}.`,
    intro: (city) =>
      `Explore ${city} from the public transport journey you are already making. These experiences are free to open and use, with stories triggered along the route as you travel.`,
    title: (city) =>
      `Free ${city} Audio Guides`,
    description: (city) =>
      `Free location-aware audio guides for public transport journeys through ${city}. Discover stories and places while you travel.`,
    matches: (option) =>
      option.accessType === "free",
  },
  airport: {
    label: "Airport",
    kicker: "START AT THE AIRPORT",
    heading: (city) =>
      `Make the journey from the airport part of your visit to ${city}.`,
    intro: (city) =>
      `Your introduction to ${city} can start before you reach the centre. These audio experiences follow public transport journeys connected with the airport, turning the transfer into part of the trip.`,
    title: (city) =>
      `${city} Airport Audio Guide`,
    description: (city) =>
      `Audio experiences for public transport journeys between the airport and ${city}. Start discovering the city while you travel.`,
    matches: includesAirport,
  },
};

function experienceHref(option: PublicExperienceOption) {
  if (
    option.countrySlug &&
    option.citySlug &&
    option.slug
  ) {
    return `/${option.countrySlug}/${option.citySlug}/experiences/${option.slug}`;
  }

  return `/tours?tour=${option.experience.id}`;
}

function formatPrice(option: PublicExperienceOption) {
  if (option.accessType === "free") {
    return "Free";
  }

  if (option.pricePence === undefined) {
    return option.accessType === "sponsored"
      ? "Sponsored"
      : "Paid";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: option.currency,
  }).format(option.pricePence / 100);
}

async function loadIntentPage(
  country: string,
  city: string,
  intent: string
) {
  const config = intentConfigs[intent];

  if (!config) {
    return null;
  }

  const tours =
    await loadPublishedExperiences(
      createPublicServerClient()
    );

  const cityTours = tours.filter(
    (tour) =>
      tour.countrySlug?.toLowerCase() ===
        country.toLowerCase() &&
      tour.citySlug?.toLowerCase() ===
        city.toLowerCase()
  );

  if (cityTours.length === 0) {
    return null;
  }

  const matchingTours =
    cityTours.filter(config.matches);

  if (matchingTours.length === 0) {
    return null;
  }

  const cityName =
    cityTours[0]?.city ??
    city
      .split("-")
      .map(
        (part) =>
          part.charAt(0).toUpperCase() +
          part.slice(1)
      )
      .join(" ");

  return {
    config,
    cityName,
    matchingTours,
  };
}

export async function generateMetadata({
  params,
}: IntentPageProps): Promise<Metadata> {
  const { country, city, intent } =
    await params;

  const page = await loadIntentPage(
    country,
    city,
    intent
  );

  if (!page) {
    return {
      title: "Page not found",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const canonical =
    `/${country}/${city}/${intent}`;

  return {
    title: page.config.title(
      page.cityName
    ),
    description:
      page.config.description(
        page.cityName
      ),
    alternates: {
      canonical,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: page.config.title(
        page.cityName
      ),
      description:
        page.config.description(
          page.cityName
        ),
      type: "website",
      url: canonical,
    },
  };
}

export default async function IntentPage({
  params,
}: IntentPageProps) {
  const { country, city, intent } =
    await params;

  const page = await loadIntentPage(
    country,
    city,
    intent
  );

  if (!page) {
    notFound();
  }

  const canonicalUrl =
    `https://www.beyondthestops.com/${country}/${city}/${intent}`;

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: page.config.title(
      page.cityName
    ),
    description:
      page.config.description(
        page.cityName
      ),
    url: canonicalUrl,
    about: {
      "@type": "City",
      name: page.cityName,
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems:
        page.matchingTours.length,
      itemListElement:
        page.matchingTours.map(
          (tour, index) => ({
            "@type": "ListItem",
            position: index + 1,
            name: tour.experience.title,
            url:
              `https://www.beyondthestops.com${experienceHref(tour)}`,
          })
        ),
    },
  };

  return (
    <main className="intentPage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html:
            JSON.stringify(
              structuredData
            ),
        }}
      />

      <header className="intentHeader">
        <Link
          className="intentBrand"
          href="/"
          aria-label="Beyond the Stops home"
        >
          <img
            src="/branding/between-stops-logo-light.png?v=1"
            alt=""
          />
          <span>Beyond the Stops</span>
        </Link>

        <nav aria-label="Page navigation">
          <Link
            href={`/${country}/${city}`}
          >
            {page.cityName}
          </Link>
          <Link href="/tours">
            Explore journeys
          </Link>
        </nav>
      </header>

      <article className="intentContent">
        <div className="intentBreadcrumb">
          <Link href={`/${country}/${city}`}>
            {page.cityName}
          </Link>
          <span aria-hidden="true">/</span>
          <span>
            {page.config.label}
          </span>
        </div>

        <section className="intentHero">
          <p className="intentKicker">
            {page.config.kicker}
          </p>

          <h1>
            {page.config.heading(
              page.cityName
            )}
          </h1>

          <p className="intentIntro">
            {page.config.intro(
              page.cityName
            )}
          </p>
        </section>

        <section className="intentJourneys">
          <header>
            <p className="intentKicker">
              AVAILABLE JOURNEYS
            </p>
            <h2>
              Choose an experience.
            </h2>
          </header>

          <div className="intentJourneyList">
            {page.matchingTours.map(
              (tour, index) => (
                <Link
                  className="intentJourney"
                  href={
                    experienceHref(tour)
                  }
                  key={
                    tour.experience.id
                  }
                >
                  <span className="intentJourneyNumber">
                    {String(
                      index + 1
                    ).padStart(2, "0")}
                  </span>

                  <div className="intentJourneyMain">
                    <p>
                      {tour.transportLabel}
                    </p>
                    <h3>
                      {
                        tour.experience
                          .title
                      }
                    </h3>
                    <span>
                      {
                        tour.experience
                          .startLabel
                      }{" "}
                      to{" "}
                      {
                        tour.experience
                          .endLabel
                      }
                    </span>
                  </div>

                  <div className="intentJourneyMeta">
                    <span>
                      About{" "}
                      {
                        tour.experience
                          .durationMinutes
                      }{" "}
                      mins
                    </span>
                    <strong>
                      {formatPrice(tour)}
                    </strong>
                  </div>

                  <span
                    className="intentJourneyArrow"
                    aria-hidden="true"
                  >
                    ↗
                  </span>
                </Link>
              )
            )}
          </div>
        </section>

        <section className="intentExplanation">
          <p className="intentKicker">
            THERE&apos;S MORE TO THE JOURNEY
          </p>
          <h2>
            Listen while you travel.
          </h2>
          <p>
            Beyond the Stops uses
            your location to keep
            stories in sync with the
            route. Put on your
            headphones, take the
            normal public transport
            journey and hear about
            the places you are
            passing.
          </p>
        </section>
      </article>

      <footer className="intentFooter">
        <strong>
          Beyond the Stops
        </strong>
        <span>
          There&apos;s more to the
          journey.
        </span>
      </footer>
    </main>
  );
}
