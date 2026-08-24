import {
  absolutePublicUrl,
  formatCitySlug,
  getPublicIntentConfig,
  publicCityPath,
  publicExperiencePath,
  publicIntentPath,
} from "@/lib/public-seo";
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
  const config = getPublicIntentConfig(intent);

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
    formatCitySlug(city);

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
    publicIntentPath(
      country,
      city,
      intent
    );

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
    absolutePublicUrl(
      publicIntentPath(
        country,
        city,
        intent
      )
    );

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
              absolutePublicUrl(publicExperiencePath(tour)),
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
            href={publicCityPath(country, city)}
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
          <Link href={publicCityPath(country, city)}>
            {page.cityName}
          </Link>
          <span aria-hidden="true">/</span>
          <span>
            {page.config.label}
          </span>
        </div>

        <section className="intentHero">
          <p className="intentKicker">
            {page.config.kicker(page.cityName)}
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
                    publicExperiencePath(tour)
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
