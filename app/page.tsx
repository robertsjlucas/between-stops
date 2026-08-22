import type { Metadata } from "next";
import Link from "next/link";

import { TransportIcon } from "@/components/transport-icon";
import {
  loadPublishedExperiences,
  type PublicExperienceOption,
} from "@/lib/public-experiences";
import {
  chooseHomepageImages,
  loadHomepageImages,
} from "@/lib/homepage-images";
import { createPublicServerClient } from "@/lib/supabase/public-server";

import "./home.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Audio tours for journeys through the city",
  description:
    "Stories, sights and sounds that unfold as you travel by bus or tram.",
  alternates: {
    canonical: "/",
  },
};

const CURRENT_CITY = "Edinburgh";

function tourHref(
  option: PublicExperienceOption
) {
  return `/tours?tour=${option.experience.id}`;
}

function formatPrice(
  option: PublicExperienceOption
) {
  if (
    option.accessType === "free" ||
    option.pricePence === undefined
  ) {
    return option.accessType === "free"
      ? "Free"
      : "Explore";
  }

  return new Intl.NumberFormat(
    "en-GB",
    {
      style: "currency",
      currency: option.currency,
    }
  ).format(
    option.pricePence / 100
  );
}

function TourListing({
  option,
  number,
}: {
  option: PublicExperienceOption;
  number: number;
}) {
  return (
    <Link
      className="editorialTour"
      href={tourHref(option)}
    >
      <span className="editorialTourNumber">
        {String(number).padStart(2, "0")}
      </span>

      <div className="editorialTourMain">
        <p>
          <TransportIcon
            mode={option.route.mode}
          />
          {option.badge}
        </p>

        <h3>
          {option.experience.title}
        </h3>

        <span>
          {option.creator?.displayName ??
            "Between Stops"}
        </span>
      </div>

      <div className="editorialTourMeta">
        <span>
          About{" "}
          {
            option.experience
              .durationMinutes
          }{" "}
          mins
        </span>

        <strong>
          {formatPrice(option)}
        </strong>
      </div>

      <span
        className="editorialTourArrow"
        aria-hidden="true"
      >
        ↗
      </span>
    </Link>
  );
}

export default async function LandingPage() {
  const supabase =
    createPublicServerClient();

  let tours:
    PublicExperienceOption[] = [];

  let platformImages =
    await loadHomepageImages(
      supabase,
      {
        city: CURRENT_CITY,
      }
    ).catch(() => []);

  try {
    tours =
      await loadPublishedExperiences(
        supabase
      );
  } catch {
    // Keep the public introduction
    // available if the catalogue is
    // temporarily unavailable.
  }

  platformImages =
    chooseHomepageImages(
      platformImages,
      CURRENT_CITY
    );

  const heroImage =
    platformImages.find(
      (image) => image.isHero
    ) ??
    platformImages[0] ??
    null;

  const secondaryImage =
    platformImages.find(
      (image) =>
        image.id !== heroImage?.id
    ) ??
    null;

  const thirdImage =
    platformImages.find(
      (image) =>
        image.id !== heroImage?.id &&
        image.id !==
          secondaryImage?.id
    ) ??
    null;

  const featured =
    tours
      .filter(
        (tour) =>
          tour.featuredRank !==
          undefined
      )
      .slice(0, 4);

  const shownTours =
    (
      featured.length > 0
        ? featured
        : tours
    ).slice(0, 4);

  return (
    <main className="landingPage">
      <header className="landingHeader">
        <Link
          className="landingBrand"
          href="/"
          aria-label="Between Stops home"
        >
          <img
            src="/branding/between-stops-logo-light.png?v=1"
            alt=""
          />
          <span>
            Between Stops
          </span>
        </Link>

        <nav
          aria-label="Main navigation"
        >
          <Link href="/tours">
            Explore tours
          </Link>

          <Link href="/guides">
            Create a tour
          </Link>

          <Link
            className="landingSignIn"
            href="/login?next=/creator"
          >
            Guide sign in
          </Link>
        </nav>
      </header>

      <section className="landingHero">
        <div className="landingHeroCopy">
          <p className="landingKicker">
            STORIES FOR THE JOURNEY
          </p>

          <h1>
            Look out.
            <br />
            Listen in.
          </h1>

          <p className="landingIntro">
            Audio experiences that
            unfold as you travel
            through the city.
          </p>

          <div className="landingActions">
            <Link
              className="primaryLandingButton"
              href="/tours"
            >
              Explore tours
              <span>↗</span>
            </Link>

            <a
              className="secondaryLandingButton"
              href="#how-it-works"
            >
              How it works
            </a>
          </div>
        </div>

        <div className="landingHeroMedia">
          <div className="windowFrame heroWindow">
            {heroImage?.imageUrl ? (
              <img
                src={
                  heroImage.imageUrl
                }
                alt={
                  heroImage.altText
                }
              />
            ) : (
              <div className="brandFallback">
                <img
                  src="/branding/between-stops-logo-light.png?v=1"
                  alt=""
                />
              </div>
            )}
          </div>

          <p className="heroLocation">
            <span />
            {CURRENT_CITY}
          </p>
        </div>
      </section>

      <section
        className="landingStatement"
        id="how-it-works"
      >
        <div>
          <p className="landingKicker">
            BETWEEN A AND B
          </p>

          <h2>
            The journey was
            interesting all along.
          </h2>
        </div>

        <p>
          Between Stops turns
          ordinary public transport
          journeys into
          location-aware audio
          experiences. Take your
          seat, put on your
          headphones and notice what
          you would otherwise pass
          by.
        </p>
      </section>

      <section className="journeyMethod">
        <div className="methodSteps">
          <article>
            <span>01</span>
            <div>
              <h3>
                Pick a journey
              </h3>
              <p>
                Choose a tour that
                follows a bus or tram
                route.
              </p>
            </div>
          </article>

          <article>
            <span>02</span>
            <div>
              <h3>
                Take your seat
              </h3>
              <p>
                Start when you are on
                board. Your location
                keeps the experience
                in sync.
              </p>
            </div>
          </article>

          <article>
            <span>03</span>
            <div>
              <h3>
                Look outside
              </h3>
              <p>
                Stories arrive as the
                places they belong to
                come into view.
              </p>
            </div>
          </article>
        </div>

        {secondaryImage?.imageUrl ? (
          <div className="windowFrame methodWindow">
            <img
              src={
                secondaryImage.imageUrl
              }
              alt={
                secondaryImage.altText
              }
            />
          </div>
        ) : (
          <div className="windowFrame methodWindow brandWindow">
            <span>
              Your journey.
              <br />
              More to notice.
            </span>
          </div>
        )}
      </section>

      {shownTours.length > 0 && (
        <section className="landingToursSection">
          <header className="landingSectionHeading">
            <div>
              <p className="landingKicker">
                START IN{" "}
                {CURRENT_CITY.toUpperCase()}
              </p>

              <h2>
                Find a story for
                your journey.
              </h2>
            </div>

            <Link href="/tours">
              All tours
              <span>↗</span>
            </Link>
          </header>

          <div className="editorialTourList">
            {shownTours.map(
              (option, index) => (
                <TourListing
                  key={
                    option.experience
                      .id
                  }
                  option={option}
                  number={index + 1}
                />
              )
            )}
          </div>
        </section>
      )}

      <section className="creatorLanding">
        {thirdImage?.imageUrl && (
          <div className="windowFrame creatorWindow">
            <img
              src={
                thirdImage.imageUrl
              }
              alt={
                thirdImage.altText
              }
            />
          </div>
        )}

        <div className="creatorLandingCopy">
          <p className="landingKicker">
            FOR GUIDES
          </p>

          <h2>
            Your knowledge.
            <br />
            Their journey.
          </h2>

          <p>
            Turn the places and
            stories you know into an
            experience passengers can
            discover as they travel.
          </p>

          <Link href="/guides">
            Create with Between Stops
            <span>↗</span>
          </Link>
        </div>
      </section>

      <footer className="landingFooter">
        <strong>Between Stops</strong>

        <p>
          Stories for the space
          between A and B.
        </p>

        <nav>
          <Link href="/tours">
            Tours
          </Link>
          <Link href="/guides">
            Guides
          </Link>
        </nav>
      </footer>
    </main>
  );
}
