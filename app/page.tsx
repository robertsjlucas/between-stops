import type { Metadata } from "next";
import Link from "next/link";
import { TransportIcon } from "@/components/transport-icon";
import { loadPublishedExperiences, type PublicExperienceOption } from "@/lib/public-experiences";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import "./home.css";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Audio tours for journeys through the city",
  description: "Turn an ordinary bus or tram journey into a location-aware audio tour with Between Stops.",
  alternates: { canonical: "/" },
};

function tourHref(option: PublicExperienceOption) {
  return `/tours?tour=${option.experience.id}`;
}

function TourCard({ option }: { option: PublicExperienceOption }) {
  return (
    <Link className="landingTourCard" href={tourHref(option)}>
      <div className="landingTourImage">
        {option.coverImageUrl ? <img src={option.coverImageUrl} alt="" /> : <div className={`landingTourPlaceholder ${option.visualClass}`} />}
        <span className="landingRouteBadge"><TransportIcon mode={option.route.mode} />{option.badge}</span>
      </div>
      <div className="landingTourBody">
        <p>{option.creator?.displayName ?? "Between Stops"}</p>
        <h3>{option.experience.title}</h3>
        <span>{option.experience.durationMinutes} mins · {option.experience.stories.length} Stories</span>
      </div>
    </Link>
  );
}

export default async function LandingPage() {
  let tours: PublicExperienceOption[] = [];
  try {
    tours = await loadPublishedExperiences(createPublicServerClient());
  } catch {
    // Keep the introduction available if the catalogue is temporarily unavailable.
  }

  const featured = tours.filter((tour) => tour.featuredRank !== undefined).slice(0, 3);
  const seasonal = tours.filter((tour) => tour.availableFrom || tour.availableTo).slice(0, 3);
  const firstTours = (featured.length > 0 ? featured : tours).slice(0, 3);
  const heroTour = firstTours[0] ?? tours[0];

  return (
    <main className="landingPage">
      <header className="landingHeader">
        <Link className="landingBrand" href="/" aria-label="Between Stops home">
          <img src="/branding/between-stops-icon.png" alt="" /><span>Between Stops</span>
        </Link>
        <nav aria-label="Main navigation"><Link href="/tours">Tours</Link><Link href="/guides">For guides</Link><Link href="/login?next=/creator">Guide sign in</Link></nav>
      </header>

      <section className="landingHero">
        <div className="landingHeroCopy">
          <h1>Turn ordinary journeys into extraordinary experiences.</h1>
          <p>Stories, sights and sounds that unfold as you travel through the city.</p>
          <div className="landingActions">
            <Link className="primaryLandingButton" href="/tours">Take me to the tours</Link>
            <a className="secondaryLandingButton" href="#how-it-works">How it works</a>
          </div>
        </div>
        <div className="landingHeroVisual">
          {heroTour?.coverImageUrl ? <img src={heroTour.coverImageUrl} alt="" /> : <div className="landingWindowArtwork"><img src="/branding/between-stops-icon.png" alt="" /></div>}
          <div className="landingHeroCaption"><strong>Press play. Watch the city unfold.</strong><span>Made for the journey you&apos;re already taking.</span></div>
        </div>
      </section>

      <section className="howSection" id="how-it-works">
        <div className="landingSectionHeading"><p className="landingKicker">HOW IT WORKS</p><h2>Your journey becomes the tour.</h2></div>
        <div className="howGrid">
          <article><span>01</span><h3>Choose a route</h3><p>Find a tour on a bus or tram journey that suits where you&apos;re going.</p></article>
          <article><span>02</span><h3>Take your seat</h3><p>Use your own headphones and start when you&apos;re ready to travel.</p></article>
          <article><span>03</span><h3>Look up</h3><p>Stories and visual prompts unfold as the places outside come into view.</p></article>
        </div>
      </section>

      {firstTours.length > 0 && <section className="landingToursSection">
        <div className="landingSectionHeading rowHeading"><div><p className="landingKicker">START IN EDINBURGH</p><h2>{featured.length > 0 ? "Featured tours" : "Tours to try"}</h2></div><Link href="/tours">See all tours →</Link></div>
        <div className="landingTourGrid">{firstTours.map((option) => <TourCard key={option.experience.id} option={option} />)}</div>
      </section>}

      {seasonal.length > 0 && <section className="landingToursSection seasonalSection">
        <div className="landingSectionHeading"><p className="landingKicker">FOR A LIMITED TIME</p><h2>Seasonal journeys</h2></div>
        <div className="landingTourGrid">{seasonal.map((option) => <TourCard key={option.experience.id} option={option} />)}</div>
      </section>}

      <section className="creatorLandingCta"><div><p className="landingKicker">KNOW A STORY WORTH SHARING?</p><h2>Build an experience of your own.</h2></div><Link href="/guides">Become a guide →</Link></section>
      <footer className="landingFooter"><div className="landingBrand footerBrand"><img src="/branding/between-stops-icon.png" alt="" /><span>Between Stops</span></div><p>Stories for the space between A and B.</p><nav><Link href="/tours">Tours</Link><Link href="/guides">Guides</Link></nav></footer>
    </main>
  );
}
