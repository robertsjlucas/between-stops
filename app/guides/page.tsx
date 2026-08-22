import type { Metadata } from "next";
import Link from "next/link";

import {
  chooseHomepageImages,
  loadHomepageImages,
} from "@/lib/homepage-images";
import { createPublicServerClient } from "@/lib/supabase/public-server";

import "./guides.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Create a tour",
  description:
    "Turn your knowledge of a place into a public-transport audio experience with Beyond the Stops.",
  alternates: {
    canonical: "/guides",
  },
};

const CURRENT_CITY = "Edinburgh";

export default async function GuidesPage() {
  const supabase =
    createPublicServerClient();

  const platformImages =
    chooseHomepageImages(
      await loadHomepageImages(
        supabase,
        {
          city: CURRENT_CITY,
        }
      ).catch(() => []),
      CURRENT_CITY
    );

  const guideImage =
    platformImages[1] ??
    platformImages[0] ??
    null;

  return (
    <main className="guidesPage">
      <header className="guidesHeader">
        <Link
          className="guidesBrand"
          href="/"
        >
          <img
            src="/branding/between-stops-logo-light.png?v=1"
            alt=""
          />
          <span>Beyond the Stops</span>
        </Link>

        <nav>
          <Link href="/tours">
            Explore journeys
          </Link>

          <Link
            className="guideSignIn"
            href="/login?next=/creator"
          >
            Guide sign in
          </Link>
        </nav>
      </header>

      <section className="guidesHero">
        <div className="guidesHeroCopy">
          <p className="guidesKicker">
            CREATE WITH BEYOND THE STOPS
          </p>

          <h1>
            Put your stories
            <br />
            on the journey.
          </h1>

          <p>
            Turn what you know about
            a place into an audio
            experience that unfolds
            as passengers travel.
          </p>

          <div className="guidesActions">
            <Link
              className="guidePrimary"
              href="/login?next=/creator"
            >
              Open Creator Studio
              <span>↗</span>
            </Link>

            <Link
              className="guideSecondary"
              href="/creator/help"
            >
              How it works
            </Link>
          </div>
        </div>

        <aside className="guideSignature">
          <div className="guideSignatureInner">
            <p className="guidesKicker">
              BEYOND THE STOPS
            </p>

            <h2>
              Your knowledge.
              <br />
              Their journey.
            </h2>

            <div className="guideSignal">
              <span />
              <span />
              <span />
              <span />
            </div>
          </div>
        </aside>
      </section>

      <section className="guideIntroduction">
        <div>
          <p className="guidesKicker">
            YOU BRING THE STORY
          </p>

          <h2>
            We handle the journey.
          </h2>
        </div>

        <p>
          Choose a supported bus or
          tram route, place your
          stories where they belong,
          add your voice and images,
          then submit the finished
          experience for review.
          Beyond the Stops handles the
          location-aware delivery to
          passengers.
        </p>
      </section>

      <section className="guideProcess">
        <div className="guideProcessList">
          <article>
            <span>01</span>

            <div>
              <h3>
                Choose the journey
              </h3>
              <p>
                Select the route and
                the part of it your
                experience covers.
              </p>
            </div>
          </article>

          <article>
            <span>02</span>

            <div>
              <h3>
                Place your Stories
              </h3>
              <p>
                Pin each subject to
                the map, then add its
                audio, image or
                something for
                passengers to spot.
              </p>
            </div>
          </article>

          <article>
            <span>03</span>

            <div>
              <h3>
                Publish
              </h3>
              <p>
                Preview the passenger
                experience and submit
                it for approval.
              </p>
            </div>
          </article>
        </div>

        <div className="guideProcessVisual">
          {guideImage?.imageUrl ? (
            <img
              src={guideImage.imageUrl}
              alt={guideImage.altText}
            />
          ) : (
            <div className="guideFallback">
              <span>
                Stories belong
                <br />
                to places.
              </span>
            </div>
          )}
        </div>
      </section>

      <section className="guidePrinciples">
        <div className="guidePrinciplesIntro">
          <p className="guidesKicker">
            MADE FOR THE VIEW OUTSIDE
          </p>

          <h2>
            Good tours notice
            what others miss.
          </h2>
        </div>

        <div className="guidePrincipleList">
          <article>
            <span>01</span>
            <p>
              Tell passengers
              something worth
              noticing on the
              journey.
            </p>
          </article>

          <article>
            <span>02</span>
            <p>
              Keep each Story focused
              enough to fit the place
              and moment.
            </p>
          </article>

          <article>
            <span>03</span>
            <p>
              Use your own voice and
              only media you have the
              right to publish.
            </p>
          </article>
        </div>
      </section>

      <section className="guideFinalCta">
        <div>
          <p className="guidesKicker">
            READY TO CREATE?
          </p>

          <h2>
            Start with what
            you already know.
          </h2>
        </div>

        <Link href="/login?next=/creator">
          Open Creator Studio
          <span>↗</span>
        </Link>
      </section>

      <footer className="guidesFooter">
        <strong>Beyond the Stops</strong>

        <p>
          Stories for the space
          between A and B.
        </p>

        <Link href="/tours">
          Explore journeys
        </Link>
      </footer>
    </main>
  );
}
