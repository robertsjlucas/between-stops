import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { TransportIcon } from "@/components/transport-icon";
import { getTranscriptAvailability } from "@/lib/experience";
import { loadPublishedExperienceBySlug } from "@/lib/public-experiences";
import { loadPublicPassengerReviews } from "@/lib/passenger-reviews";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import "./tour-page.css";

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
    alternates: { canonical: `/tours/${slug}` },
    openGraph: {
      title: tour.experience.title,
      description,
      type: "website",
      images: tour.coverImageUrl ? [{ url: tour.coverImageUrl }] : undefined,
    },
  };
}

function formatAvailability(from?: string, to?: string) {
  if (!from && !to) return "Available all year";
  const date = (value: string) => new Date(`${value}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  if (from && to) return `${date(from)} – ${date(to)}`;
  return from ? `From ${date(from)}` : `Until ${date(to!)}`;
}

export default async function TourPage({ params }: TourPageProps) {
  const { slug } = await params;
  const tour = await getTour(slug);
  if (!tour) notFound();
  const publicReviews = await loadPublicPassengerReviews(
    createPublicServerClient(),
    tour.experience.id
  ).catch(() => []);
  const transcriptAvailability = getTranscriptAvailability(
    tour.experience.stories
  );

  return (
    <main className="publicTourPage">
      <header className="publicTourHeader">
        <Link className="publicTourBrand" href="/"><img src="/branding/between-stops-icon.png" alt="" /><span>Between Stops</span></Link>
        <Link className="allToursLink" href="/tours">All tours</Link>
      </header>

      <section className="publicTourHero">
        <div className="publicTourCover">
          {tour.coverImageUrl ? <img src={tour.coverImageUrl} alt="" /> : <div className="publicTourFallback" />}
          <span className="publicTourRoute"><TransportIcon mode={tour.route.mode} />{tour.badge}</span>
        </div>
        <div className="publicTourIntro">
          <p className="publicTourKicker">{tour.experience.startLabel} → {tour.experience.endLabel}</p>
          <h1>{tour.experience.title}</h1>
          <p className="publicTourLead">{tour.summary}</p>
          <div className="publicTourFacts">
            {(tour.reviewCount ?? 0) > 0 && (
              <span className="publicTourRatingFact">
                <strong>★ {tour.averageRating?.toFixed(1)}</strong>
                {tour.reviewCount} {tour.reviewCount === 1 ? "rating" : "ratings"}
              </span>
            )}
            <span><strong>{tour.experience.durationMinutes}</strong> mins approx.</span>
            <span><strong>{tour.experience.stories.length}</strong> Stories</span>
            {transcriptAvailability !== "none" && <span><strong>{transcriptAvailability === "full" ? "Full" : "Some"}</strong> transcripts</span>}
            <span><strong>{tour.ageGuidance === "not_for_children" ? "Adults" : "All ages"}</strong></span>
          </div>
          <Link className="startPublicTour" href={`/tours?tour=${tour.experience.id}`}>Start experience →</Link>
          <p className="publicTourDataNote">Location access keeps the tour in sync. You can download the audio and images before setting off.</p>
        </div>
      </section>

      <section className="publicTourContent">
        <article className="publicTourDescription"><p className="publicTourKicker">ABOUT THIS TOUR</p><h2>See the journey differently.</h2><p>{tour.fullDescription}</p></article>
        <aside className="publicTourDetails">
          <div><span>Route</span><strong>{tour.transportLabel}</strong></div>
          <div><span>Availability</span><strong>{formatAvailability(tour.availableFrom, tour.availableTo)}</strong></div>
          <div><span>Suitable for</span><strong>{tour.ageGuidance === "not_for_children" ? "Not suitable for children" : "All ages"}</strong></div>
          <div><span>Access</span><strong>{tour.accessType === "free" ? "Free" : "Price shown before starting"}</strong></div>
        </aside>
      </section>

      {tour.galleryImageUrls.length > 0 && <section className="publicTourGallery" aria-label="Tour gallery">{tour.galleryImageUrls.map((url, index) => <img key={url} src={url} alt={`A view from the tour, image ${index + 1}`} />)}</section>}

      {((tour.reviewCount ?? 0) > 0 || publicReviews.length > 0) && (
        <section className="publicTourReviews">
          <div className="publicTourReviewsHeading">
            <div>
              <p className="publicTourKicker">PASSENGER REVIEWS</p>
              <h2>What passengers thought.</h2>
            </div>
            {(tour.reviewCount ?? 0) > 0 && (
              <div className="publicTourRatingSummary">
                <strong>{tour.averageRating?.toFixed(1)}</strong>
                <span>★★★★★</span>
                <small>
                  {tour.reviewCount} {tour.reviewCount === 1 ? "rating" : "ratings"}
                </small>
              </div>
            )}
          </div>

          {publicReviews.length > 0 ? (
            <div className="publicTourReviewGrid">
              {publicReviews.map((review) => (
                <article key={review.id}>
                  <span aria-label={`${review.rating} out of 5 stars`}>
                    {"★".repeat(review.rating)}
                    <i>{"★".repeat(5 - review.rating)}</i>
                  </span>
                  <p>“{review.reviewText}”</p>
                  <small>
                    Passenger · {new Date(review.createdAt).toLocaleDateString(
                      "en-GB",
                      { month: "short", year: "numeric" }
                    )}
                  </small>
                </article>
              ))}
            </div>
          ) : (
            <p className="publicTourRatingsOnly">
              Written passenger reviews will appear here after approval.
            </p>
          )}
        </section>
      )}

      <section className="publicStoryList">
        <div className="publicTourSectionHeading"><p className="publicTourKicker">ALONG THE WAY</p><h2>{tour.experience.stories.length} Stories woven into the route.</h2></div>
        <ol>{tour.experience.stories.map((story, index) => <li key={story.id}><span>{String(index + 1).padStart(2, "0")}</span><div><p>{story.directionalPrompt ? "SOMETHING TO SPOT" : "AUDIO STORY"}</p><h3>{story.title}</h3></div></li>)}</ol>
      </section>

      {tour.creator && <section className="publicCreatorBlock">
        {tour.creator.avatarUrl ? <img src={tour.creator.avatarUrl} alt="" /> : <div className="creatorInitial">{tour.creator.displayName.charAt(0)}</div>}
        <div><p className="publicTourKicker">CREATED BY</p><h2>{tour.creator.displayName}</h2><p>{tour.creator.bio}</p></div>
      </section>}

      <section className="publicTourFinalCta"><p className="publicTourKicker">READY WHEN YOU ARE</p><h2>Take the story with you.</h2><Link href={`/tours?tour=${tour.experience.id}`}>Start experience →</Link><small>Download the tour before travelling to avoid using mobile data for audio and images.</small></section>
      <footer className="publicTourFooter"><Link className="publicTourBrand" href="/"><img src="/branding/between-stops-icon.png" alt="" /><span>Between Stops</span></Link><Link href="/tours">Explore all tours</Link></footer>
    </main>
  );
}
