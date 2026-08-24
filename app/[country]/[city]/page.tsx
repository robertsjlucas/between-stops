import {
  absolutePublicUrl,
  breadcrumbStructuredData,
  getAvailablePublicIntents,
  getPublicIntentConfig,
  publicCityPath,
  publicExperiencePath,
  publicIntentPath,
} from "@/lib/public-seo";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  type PublicExperienceOption,
  loadPublishedExperiences,
} from "@/lib/public-experiences";
import { createPublicServerClient } from "@/lib/supabase/public-server";

import "./page.css";

export const dynamic = "force-dynamic";

type CityPageProps = {
  params: Promise<{
    country: string;
    city: string;
  }>;
};

const getCityExperiences = cache(
  async (
    country: string,
    city: string
  ): Promise<PublicExperienceOption[]> => {
    const tours = await loadPublishedExperiences(
      createPublicServerClient()
    );

    return tours.filter(
      (tour) =>
        tour.countrySlug?.toLowerCase() ===
          country.toLowerCase() &&
        tour.citySlug?.toLowerCase() ===
          city.toLowerCase()
    );
  }
);

function formatPrice(
  option: PublicExperienceOption
) {
  if (option.accessType === "free") {
    return "Free";
  }

  if (option.pricePence === undefined) {
    return option.accessType === "sponsored"
      ? "Sponsored"
      : "Explore";
  }

  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: option.currency,
  }).format(option.pricePence / 100);
}

export async function generateMetadata({
  params,
}: CityPageProps): Promise<Metadata> {
  const { country, city } = await params;
  const tours = await getCityExperiences(
    country,
    city
  );

  if (tours.length === 0) {
    return {
      title: "City journeys not found",
      robots: {
        index: false,
        follow: false,
      },
    };
  }

  const cityName =
    tours[0].city ?? city;
  const canonical =
    publicCityPath(
      country,
      city
    );

  return {
    title: `${cityName} Audio Guides for Bus & Tram Journeys`,
    description:
      `Discover ${cityName} through location-aware audio experiences that unfold as you travel by public transport. Find free and paid journeys, stories and places along the way.`,
    alternates: {
      canonical,
    },
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title:
        `${cityName} Audio Guides for Bus & Tram Journeys`,
      description:
        `Discover ${cityName} through audio experiences made for journeys you are already taking.`,
      type: "website",
      url: canonical,
    },
    twitter: {
      card: "summary",
      title:
        `${cityName} Audio Guides for Bus & Tram Journeys`,
      description:
        `Discover ${cityName} through audio experiences made for journeys you are already taking.`,
    },
  };
}

export default async function CityPage({
  params,
}: CityPageProps) {
  const { country, city } = await params;
  const tours = await getCityExperiences(
    country,
    city
  );

  if (tours.length === 0) {
    notFound();
  }

  const cityName =
    tours[0].city ?? city;

  const cityPath =
    publicCityPath(
      country,
      city
    );

  const canonicalUrl =
    absolutePublicUrl(cityPath);

  const availableIntents =
    getAvailablePublicIntents(tours);

  const breadcrumbData =
    breadcrumbStructuredData([
      {
        name: "Beyond the Stops",
        path: "/",
      },
      {
        name: cityName,
        path: cityPath,
      },
    ]);

  const structuredData = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name:
      `${cityName} audio guides and public transport experiences`,
    description:
      `Location-aware audio experiences for bus and tram journeys through ${cityName}.`,
    url: canonicalUrl,
    about: {
      "@type": "City",
      name: cityName,
    },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: tours.length,
      itemListElement:
        tours.map(
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

  const freeCount =
    tours.filter(
      (tour) =>
        tour.accessType === "free"
    ).length;

  return (
    <main className="cityPage">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html:
            JSON.stringify(
              structuredData
            ),
        }}
      />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html:
            JSON.stringify(
              breadcrumbData
            ),
        }}
      />

      <header className="cityHeader">
        <Link
          className="cityBrand"
          href="/"
          aria-label="Beyond the Stops home"
        >
          <img
            src="/branding/between-stops-logo-light.png?v=1"
            alt=""
          />
          <span>Beyond the Stops</span>
        </Link>

        <nav
          aria-label="Main navigation"
        >
          <Link href="/tours">
            Explore journeys
          </Link>
          <Link href="/guides">
            For guides
          </Link>
        </nav>
      </header>

      <section className="cityHero">
        <div>
          <p className="cityKicker">
            BEYOND THE STOPS · {cityName.toUpperCase()}
          </p>

          <h1>
            Discover more of{" "}
            {cityName}
            <br />
            while you&apos;re
            already moving.
          </h1>

          <p className="cityIntro">
            Location-aware audio
            experiences for bus and
            tram journeys through{" "}
            {cityName}. Put on your
            headphones and discover
            the stories, places and
            people outside the
            window.
          </p>
        </div>

        <aside className="cityHeroPanel">
          <span>
            {String(
              tours.length
            ).padStart(2, "0")}
          </span>
          <p>
            journeys available
            in {cityName}
          </p>

          {freeCount > 0 && (
            <strong>
              {freeCount} free{" "}
              {freeCount === 1
                ? "experience"
                : "experiences"}
            </strong>
          )}
        </aside>
      </section>

      <section className="cityStatement">
        <p className="cityKicker">
          SEE THE CITY DIFFERENTLY
        </p>

        <div>
          <h2>
            An audio guide built
            around the journey,
            not a walking route.
          </h2>

          <p>
            Beyond the Stops works
            with journeys you can
            already make on public
            transport. Choose a
            route, take your seat
            and hear stories at the
            places they belong to.
          </p>
        </div>
      </section>

      <section
        className="cityJourneys"
        id="journeys"
      >
        <header>
          <div>
            <p className="cityKicker">
              JOURNEYS IN{" "}
              {cityName.toUpperCase()}
            </p>

            <h2>
              Pick a journey.
              <br />
              See what&apos;s
              between the stops.
            </h2>
          </div>

          <Link href="/tours">
            Explore all
            <span>↗</span>
          </Link>
        </header>

        <div className="cityJourneyList">
          {tours.map(
            (tour, index) => (
              <Link
                className="cityJourney"
                href={publicExperiencePath(
                  tour
                )}
                key={
                  tour.experience.id
                }
              >
                <span className="cityJourneyNumber">
                  {String(
                    index + 1
                  ).padStart(
                    2,
                    "0"
                  )}
                </span>

                <div className="cityJourneyMain">
                  <p>
                    {tour.badge}
                  </p>

                  <h3>
                    {
                      tour
                        .experience
                        .title
                    }
                  </h3>

                  <span>
                    {
                      tour
                        .experience
                        .startLabel
                    }{" "}
                    to{" "}
                    {
                      tour
                        .experience
                        .endLabel
                    }
                  </span>
                </div>

                <div className="cityJourneyMeta">
                  <span>
                    About{" "}
                    {
                      tour
                        .experience
                        .durationMinutes
                    }{" "}
                    mins
                  </span>

                  <strong>
                    {formatPrice(
                      tour
                    )}
                  </strong>
                </div>

                <span
                  className="cityJourneyArrow"
                  aria-hidden="true"
                >
                  ↗
                </span>
              </Link>
            )
          )}
        </div>
      </section>

      <section className="citySearchIntent">
        <div>
          <p className="cityKicker">
            MADE FOR PUBLIC TRANSPORT
          </p>

          <h2>
            {cityName} by tram.
            {cityName} by bus.
            More than the view
            from A to B.
          </h2>
        </div>

        <div>
          <p>
            These self-guided audio
            experiences are designed
            to work while you travel,
            including journeys from
            airports, city centres,
            neighbourhoods and
            waterfront routes where
            available.
          </p>

          <p>
            Some experiences are
            free. Others support
            independent creators
            who turn local knowledge
            into something you can
            discover from your seat.
          </p>
        </div>
      </section>

      {availableIntents.length > 0 && (
        <section className="cityStatement">
          <p className="cityKicker">
            EXPLORE {cityName.toUpperCase()}
          </p>

          <div>
            <h2>
              Find the journey that
              fits how you&apos;re
              travelling.
            </h2>

            <p>
              {availableIntents.map(
                (intent, index) => {
                  const config =
                    getPublicIntentConfig(
                      intent
                    );

                  return (
                    <span key={intent}>
                      {index > 0 && " · "}
                      <Link
                        href={publicIntentPath(
                          country,
                          city,
                          intent
                        )}
                      >
                        {config.label} audio guides
                      </Link>
                    </span>
                  );
                }
              )}
            </p>
          </div>
        </section>
      )}

      <footer className="cityFooter">
        <Link
          className="cityBrand"
          href="/"
        >
          <img
            src="/branding/between-stops-logo-light.png?v=1"
            alt=""
          />
          <span>Beyond the Stops</span>
        </Link>

        <p>
          There&apos;s more to the
          journey.
        </p>

        <nav>
          <Link href="/tours">
            Journeys
          </Link>
          <Link href="/guides">
            For guides
          </Link>
        </nav>
      </footer>
    </main>
  );
}
