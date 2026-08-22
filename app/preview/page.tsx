"use client";

import {
  useEffect,
  useState,
} from "react";
import length from "@turf/length";
import { lineString } from "@turf/helpers";

import "./preview.css";

import {
  TransportIcon,
} from "@/components/transport-icon";
import {
  loadExperiencePreview,
} from "@/lib/public-experiences";
import type {
  PublicExperienceOption,
} from "@/lib/public-experiences";
import {
  createClient,
} from "@/lib/supabase/client";

function formatDate(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString(
    "en-GB",
    { day: "numeric", month: "short", year: "numeric" }
  );
}

export default function PreviewPage() {
  const [option, setOption] =
    useState<PublicExperienceOption | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [returnPath, setReturnPath] = useState("/creator");

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const experienceId = parameters.get("id");
    setReturnPath(parameters.get("from") === "admin" ? "/admin" : "/creator");

    if (!experienceId) {
      setError("No experience was selected.");
      setLoading(false);
      return;
    }

    void loadExperiencePreview(createClient(), experienceId)
      .then((loadedOption) => {
        if (!loadedOption) {
          throw new Error("This experience could not be found or you do not have access to it.");
        }
        setOption(loadedOption);
      })
      .catch((loadError) =>
        setError(
          loadError instanceof Error
            ? loadError.message
            : "The preview could not be loaded."
        )
      )
      .finally(() => setLoading(false));
  }, []);

  if (loading || error || !option) {
    return (
      <main className="previewMessage">
        <img src="/branding/between-stops-logo-light.png?v=1" alt="" />
        <h1>{loading ? "Loading preview…" : "Preview unavailable"}</h1>
        {error && <p>{error}</p>}
        <a href={returnPath}>← Return</a>
      </main>
    );
  }

  const { experience, route } = option;
  const routeDistanceKm =
    length(lineString(route.coordinates), {
      units: "kilometers",
    }) *
    (Math.abs(experience.endProgress - experience.startProgress) / 100);
  const routeDistanceMiles = routeDistanceKm * 0.621371;
  const availability =
    option.availableFrom && option.availableTo
      ? `${formatDate(option.availableFrom)} to ${formatDate(option.availableTo)}`
      : option.availableFrom
        ? `From ${formatDate(option.availableFrom)}`
        : option.availableTo
          ? `Until ${formatDate(option.availableTo)}`
          : "Available all year";

  return (
    <main className="shell previewShell">
      <div className="previewBanner">
        <strong>Private experience preview</strong>
        <span>Only the creator and administrators can see this page.</span>
        <a href={returnPath}>← Return</a>
      </div>

      <header className="topBar">
        <span className="miniBrand">
          <img src="/branding/between-stops-logo-light.png?v=1" alt="" />
          <span>Beyond the Stops</span>
        </span>
      </header>

      <section className="overviewHero">
        <div className={`overviewArt ${option.visualClass}`}>
          {option.coverImageUrl && (
            <img className="experienceCoverImage" src={option.coverImageUrl} alt="" />
          )}
          <div className="imageBadge">
            <TransportIcon mode={route.mode} />
            {option.badge}
          </div>
        </div>

        <p className="kicker">
          {experience.startLabel.toUpperCase()} ⇄ {experience.endLabel.toUpperCase()}
        </p>
        <h1>{experience.title}</h1>
        <p className="lead">{option.fullDescription || option.summary}</p>

        {option.creator && (
          <>
            <div className="overviewCreator">
              {option.creator.avatarUrl && <img src={option.creator.avatarUrl} alt="" />}
              <div>
                <small>Created by</small>
                <strong>{option.creator.displayName}</strong>
                {option.creator.bio && <p className="creatorBio expanded">{option.creator.bio}</p>}
              </div>
            </div>

            {(option.creator.leftPromptUrl || option.creator.rightPromptUrl) && (
              <div className="previewDirectionPrompts">
                <p className="kicker">GUIDE VOICE PROMPTS</p>
                <div>
                  {option.creator.leftPromptUrl && (
                    <label>
                      Look left
                      <audio controls preload="metadata" src={option.creator.leftPromptUrl} />
                    </label>
                  )}
                  {option.creator.rightPromptUrl && (
                    <label>
                      Look right
                      <audio controls preload="metadata" src={option.creator.rightPromptUrl} />
                    </label>
                  )}
                </div>
              </div>
            )}
          </>
        )}

        {option.galleryImageUrls.length > 0 && (
          <div className="tourGallery">
            {option.galleryImageUrls.map((url, index) => (
              <img key={url} src={url} alt={`Tour preview ${index + 1}`} />
            ))}
          </div>
        )}

        <div className="overviewMeta">
          <span>About {experience.durationMinutes} mins</span>
          <span>
            Approx. {routeDistanceMiles < 10 ? routeDistanceMiles.toFixed(1) : Math.round(routeDistanceMiles)} miles
          </span>
          <span>{experience.stories.length} Stories</span>
          <span>{option.ageGuidance === "not_for_children" ? "Not suitable for children" : "Suitable for all ages"}</span>
          <span>{availability}</span>
        </div>
      </section>

      <section className="previewStories">
        <p className="kicker">REVIEW EVERY STORY</p>
        <h2>Journey content</h2>

        {experience.stories.length === 0 ? (
          <p>No Stories have been added.</p>
        ) : (
          experience.stories.map((story, index) => (
            <article key={story.id}>
              <span>{index + 1}</span>
              <div>
                <small>{story.eyebrow}</small>
                <h3>{story.title}</h3>
                {story.text && <p>{story.text}</p>}
                {story.imageUrl && <img src={story.imageUrl} alt="" />}
                {story.audioUrl ? (
                  <audio controls preload="metadata" src={story.audioUrl} />
                ) : story.type === "audio" ? (
                  <em>No audio file attached</em>
                ) : null}
              </div>
            </article>
          ))
        )}
      </section>
    </main>
  );
}
