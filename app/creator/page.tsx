"use client";

import { useEffect, useMemo, useState } from "react";
import { lineString, point } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import length from "@turf/length";
import { tramRouteCoordinates } from "@/data/tram-airport-west-end-geometry";

type Direction = "airport-west" | "west-airport";

type Story = {
  id: string;
  title: string;
  routeProgress: number;
  type: "audio" | "image" | "look" | "question";
  direction: "both" | Direction;
};

type LocationData = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

const starterStories: Story[] = [
  {
    id: "departure",
    title: "Your journey starts here",
    routeProgress: 2,
    type: "audio",
    direction: "both",
  },
  {
    id: "leaving-airport",
    title: "Leaving the airport behind",
    routeProgress: 14,
    type: "image",
    direction: "both",
  },
  {
    id: "gateway",
    title: "Watch the city begin to appear",
    routeProgress: 27,
    type: "look",
    direction: "both",
  },
  {
    id: "edinburgh-park",
    title: "A different Edinburgh",
    routeProgress: 43,
    type: "audio",
    direction: "both",
  },
  {
    id: "changing-character",
    title: "The journey changes character",
    routeProgress: 58,
    type: "image",
    direction: "both",
  },
  {
    id: "balgreen",
    title: "What do you notice first?",
    routeProgress: 75,
    type: "question",
    direction: "both",
  },
  {
    id: "murrayfield",
    title: "The centre is getting close",
    routeProgress: 87,
    type: "look",
    direction: "both",
  },
  {
    id: "arrival",
    title: "Almost there",
    routeProgress: 97,
    type: "audio",
    direction: "both",
  },
];

export default function CreatorPage() {
  const [stories, setStories] = useState<Story[]>(starterStories);
  const [direction, setDirection] =
    useState<Direction>("airport-west");

  const [location, setLocation] =
    useState<LocationData | null>(null);

  const [watching, setWatching] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newProgress, setNewProgress] = useState("50");

  const routeLine = useMemo(
    () => lineString(tramRouteCoordinates),
    []
  );

  const routeLengthKm = useMemo(
    () => length(routeLine, { units: "kilometers" }),
    [routeLine]
  );

  useEffect(() => {
    const stored = localStorage.getItem("between-stops-stories");

    if (stored) {
      try {
        setStories(JSON.parse(stored));
      } catch {
        setStories(starterStories);
      }
    }
  }, []);

  function saveStories(updated: Story[]) {
    setStories(updated);

    localStorage.setItem(
      "between-stops-stories",
      JSON.stringify(updated)
    );
  }

  useEffect(() => {
    if (!watching) return;

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });
      },
      () => {},
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [watching]);

  const currentRoutePosition = useMemo(() => {
    if (!location) return null;

    const userPoint = point([
      location.longitude,
      location.latitude,
    ]);

    const snapped = nearestPointOnLine(routeLine, userPoint, {
      units: "kilometers",
    });

    const distanceAlongKm =
      snapped.properties.location ?? 0;

    const distanceFromRouteMetres =
      (snapped.properties.dist ?? 0) * 1000;

    const progress =
      (distanceAlongKm / routeLengthKm) * 100;

    return {
      progress,
      distanceAlongKm,
      distanceFromRouteMetres,
    };
  }, [location, routeLine, routeLengthKm]);

  const displayedStories = useMemo(() => {
    const filtered = stories.filter(
      (story) =>
        story.direction === "both" ||
        story.direction === direction
    );

    return [...filtered].sort((a, b) =>
      direction === "airport-west"
        ? a.routeProgress - b.routeProgress
        : b.routeProgress - a.routeProgress
    );
  }, [stories, direction]);

  function addStory(progress?: number) {
    const title = newTitle.trim() || "Untitled story";

    const routeProgress =
      progress ??
      Math.min(
        100,
        Math.max(0, Number(newProgress) || 0)
      );

    const story: Story = {
      id: crypto.randomUUID(),
      title,
      routeProgress,
      type: "audio",
      direction: "both",
    };

    saveStories([...stories, story]);

    setNewTitle("");
  }

  function markCurrentPosition() {
    if (!currentRoutePosition) return;

    addStory(currentRoutePosition.progress);
  }

  function deleteStory(id: string) {
    saveStories(
      stories.filter((story) => story.id !== id)
    );
  }

  function renameStory(id: string) {
    const current = stories.find(
      (story) => story.id === id
    );

    if (!current) return;

    const title = window.prompt(
      "Story title",
      current.title
    );

    if (!title?.trim()) return;

    saveStories(
      stories.map((story) =>
        story.id === id
          ? { ...story, title: title.trim() }
          : story
      )
    );
  }

  return (
    <main className="creatorShell">
      <header className="creatorHeader">
        <div>
          <p className="kicker">BETWEEN STOPS</p>
          <h1>Creator</h1>
        </div>

        <a href="/" className="creatorPreviewLink">
          Passenger view →
        </a>
      </header>

      <section className="creatorRoute">
        <p className="kicker">EXPERIENCE</p>

        <h2>Into Edinburgh</h2>

        <p>Edinburgh Tram · Airport ⇄ West End</p>

        <div className="directionSwitch">
          <button
            className={
              direction === "airport-west"
                ? "active"
                : ""
            }
            onClick={() =>
              setDirection("airport-west")
            }
          >
            Airport → West End
          </button>

          <button
            className={
              direction === "west-airport"
                ? "active"
                : ""
            }
            onClick={() =>
              setDirection("west-airport")
            }
          >
            West End → Airport
          </button>
        </div>
      </section>

      <section className="creatorStories">
        <div className="creatorSectionHeading">
          <div>
            <p className="kicker">STORIES</p>
            <h2>
              {displayedStories.length} along this journey
            </h2>
          </div>
        </div>

        <div className="storyList">
          {displayedStories.map((story, index) => (
            <article
              className="creatorStoryCard"
              key={story.id}
            >
              <div className="storyOrder">
                {index + 1}
              </div>

              <div className="creatorStoryMain">
                <span className="storyType">
                  {story.type}
                </span>

                <h3>{story.title}</h3>

                <p>
                  {story.routeProgress.toFixed(1)}% along
                  canonical route
                </p>

                <small>
                  {story.direction === "both"
                    ? "Both directions"
                    : story.direction ===
                        "airport-west"
                      ? "Airport → West End only"
                      : "West End → Airport only"}
                </small>
              </div>

              <div className="storyActions">
                <button
                  onClick={() =>
                    renameStory(story.id)
                  }
                >
                  Edit
                </button>

                <button
                  className="deleteAction"
                  onClick={() =>
                    deleteStory(story.id)
                  }
                >
                  Delete
                </button>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="creatorAdd">
        <p className="kicker">ADD STORY</p>

        <h2>Add by route position</h2>

        <label>
          Story title
          <input
            value={newTitle}
            onChange={(event) =>
              setNewTitle(event.target.value)
            }
            placeholder="Something worth noticing"
          />
        </label>

        <label>
          Route position %
          <input
            type="number"
            min="0"
            max="100"
            step="0.1"
            value={newProgress}
            onChange={(event) =>
              setNewProgress(event.target.value)
            }
          />
        </label>

        <button
          className="creatorPrimaryButton"
          onClick={() => addStory()}
        >
          + Add story
        </button>
      </section>

      <section className="creatorLocation">
        <p className="kicker">ON LOCATION</p>

        <h2>Mark a spot while travelling</h2>

        <p>
          When you see somewhere worth using in an
          experience, mark your current position. Between
          Stops will snap it to the tram route.
        </p>

        {!watching ? (
          <button
            className="creatorSecondaryButton"
            onClick={() => setWatching(true)}
          >
            Enable live location
          </button>
        ) : (
          <>
            {currentRoutePosition ? (
              <div className="locationReadout">
                <div>
                  <small>Route position</small>
                  <strong>
                    {currentRoutePosition.progress.toFixed(
                      1
                    )}
                    %
                  </strong>
                </div>

                <div>
                  <small>Along route</small>
                  <strong>
                    {currentRoutePosition.distanceAlongKm.toFixed(
                      2
                    )}
                    km
                  </strong>
                </div>

                <div>
                  <small>Distance from line</small>
                  <strong>
                    {Math.round(
                      currentRoutePosition.distanceFromRouteMetres
                    )}
                    m
                  </strong>
                </div>

                <div>
                  <small>GPS accuracy</small>
                  <strong>
                    ±
                    {Math.round(
                      location?.accuracy ?? 0
                    )}
                    m
                  </strong>
                </div>
              </div>
            ) : (
              <p>Waiting for location…</p>
            )}

            <button
              className="creatorPrimaryButton"
              onClick={markCurrentPosition}
              disabled={!currentRoutePosition}
            >
              📍 Mark this spot as a story
            </button>
          </>
        )}
      </section>
    </main>
  );
}