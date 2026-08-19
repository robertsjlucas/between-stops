import type { Metadata } from "next";
import Link from "next/link";
import "./guides.css";

export const metadata: Metadata = {
  title: "Create a tour",
  description:
    "Turn your knowledge of a place into a public-transport audio experience with Between Stops.",
  alternates: { canonical: "/guides" },
};

export default function GuidesPage() {
  return (
    <main className="guidesPage">
      <header className="guidesHeader">
        <Link className="guidesBrand" href="/">
          <img src="/branding/between-stops-icon.png" alt="" />
          <span>Between Stops</span>
        </Link>

        <Link className="guideSignIn" href="/login?next=/creator">
          Guide sign in
        </Link>
      </header>

      <section className="guidesHero">
        <div>
          <p className="guidesKicker">FOR LOCAL VOICES AND CURIOUS MINDS</p>
          <h1>Guide people through the stories you know.</h1>
          <p>
            Build an audio experience around an existing bus or tram route.
            Add your stories, photographs and voice, then submit it for review.
          </p>

          <div className="guidesActions">
            <Link className="guidePrimary" href="/login?next=/creator">
              Sign in to Creator Studio
            </Link>
            <Link className="guideSecondary" href="/creator/help">
              How to build an experience
            </Link>
          </div>
        </div>

        <aside className="guideStudioPreview">
          <p className="guidesKicker">CREATOR STUDIO</p>
          <div className="guideRouteLine"><span /><span /><span /><span /></div>
          <h2>Your knowledge.<br />Their journey.</h2>
          <p>No coding, mapping software or app-store publishing required.</p>
        </aside>
      </section>

      <section className="guideSteps">
        <article><span>01</span><h2>Choose the journey</h2><p>Select a supported route and the section your experience covers.</p></article>
        <article><span>02</span><h2>Place your Stories</h2><p>Pin each subject to the map, then add its audio and optional image.</p></article>
        <article><span>03</span><h2>Submit for review</h2><p>Preview the passenger view and send the finished experience for approval.</p></article>
      </section>

      <section className="guidePrinciples">
        <p className="guidesKicker">WHAT MAKES A GOOD EXPERIENCE?</p>
        <h2>Clear, human and made for the view outside.</h2>
        <ul>
          <li>Tell stories passengers would otherwise miss.</li>
          <li>Keep each piece focused enough for the journey.</li>
          <li>Use your own voice and only media you have permission to publish.</li>
        </ul>
      </section>

      <section className="guideFinalCta">
        <div><p className="guidesKicker">ALREADY A GUIDE?</p><h2>Continue building.</h2></div>
        <Link href="/login?next=/creator">Guide sign in →</Link>
      </section>

      <footer className="guidesFooter">
        <Link className="guidesBrand" href="/"><img src="/branding/between-stops-icon.png" alt="" /><span>Between Stops</span></Link>
        <Link href="/tours">Explore tours</Link>
      </footer>
    </main>
  );
}
