"use client";

import { useEffect, useMemo, useState } from "react";
import { lineString, point } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import length from "@turf/length";

import { edinburghTramRoute } from "@/data/routes/tram";
import { route35MuseumToOceanTerminal } from "@/data/routes/bus35";

import { intoEdinburghExperience } from "@/data/experiences/into-edinburgh";
import { royalMileToShoreExperience } from "@/data/experiences/royal-mile-to-shore";

import {
  getJourneyProgress,
  getStoriesForJourney,
  isInsideExperienceSection,
} from "@/lib/experience";

import type {
  ExperienceDefinition,
  JourneyDirection,
  RouteDefinition,
} from "@/lib/types";

type Screen = "home" | "overview" | "journey";

type LocationData = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type MarkedSpot = {
  id: string;
  experienceId: string;
  label: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  routeProgress: number;
  distanceAlongKm: number;
  distanceFromRouteMetres: number;
  createdAt: string;
};

type ExperienceOption = {
  experience: ExperienceDefinition;
  route: RouteDefinition;
  badge: string;
  transportLabel: string;
  visualClass: string;
};

const experienceOptions: ExperienceOption[] = [
  {
    experience: intoEdinburghExperience,
    route: edinburghTramRoute,
    badge: "EDINBURGH TRAM",
    transportLabel: "Tram",
    visualClass: "tramExperience",
  },
  {
    experience: royalMileToShoreExperience,
    route: route35MuseumToOceanTerminal,
    badge: "BUS 35",
    transportLabel: "Bus 35",
    visualClass: "busExperience",
  },
];

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");

  const [selectedExperienceId, setSelectedExperienceId] =
    useState("into-edinburgh");

  const [direction, setDirection] =
    useState<JourneyDirection>("forward");

  const [location, setLocation] =
    useState<LocationData | null>(null);

  const [error, setError] = useState("");
  const [watching, setWatching] = useState(false);

  const [journeyProgress, setJourneyProgress] = useState(0);

  const [activeJourneyExperienceId, setActiveJourneyExperienceId] =
    useState<string | null>(null);

  const [activeJourneyDirection, setActiveJourneyDirection] =
    useState<JourneyDirection>("forward");

  const [testerOpen, setTesterOpen] = useState(false);

  const [markedSpots, setMarkedSpots] =
    useState<MarkedSpot[]>([]);

  const selectedOption =
    experienceOptions.find(
      (option) =>
        option.experience.id === selectedExperienceId
    ) ?? experienceOptions[0];

  const experience = selectedOption.experience;
  const route = selectedOption.route;

  const activeOption =
    experienceOptions.find(
      (option) =>
        option.experience.id === activeJourneyExperienceId
    ) ?? null;

  const routeLine = useMemo(
    () => lineString(route.coordinates),
    [route]
  );

  const routeLengthKm = useMemo(
    () =>
      length(routeLine, {
        units: "kilometers",
      }),
    [routeLine]
  );

  const journeyStories = useMemo(
    () =>
      getStoriesForJourney(
        experience,
        direction
      ),
    [experience, direction]
  );

  const directionStart =
    direction === "forward"
      ? experience.startLabel
      : experience.endLabel;

  const directionEnd =
    direction === "forward"
      ? experience.endLabel
      : experience.startLabel;

  const directionLabel = `${directionStart} → ${directionEnd}`;

  useEffect(() => {
    const saved = localStorage.getItem(
      "between-stops-marked-spots"
    );

    if (!saved) return;

    try {
      setMarkedSpots(JSON.parse(saved));
    } catch {
      // Ignore malformed prototype data.
    }
  }, []);

  useEffect(() => {
    if (!watching) return;

    if (!navigator.geolocation) {
      setError(
        "Location is not supported on this device."
      );
      return;
    }

    const watchId =
      navigator.geolocation.watchPosition(
        (position) => {
          setLocation({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
          });

          setError("");
        },
        (err) => {
          setError(err.message);
        },
        {
          enableHighAccuracy: true,
          maximumAge: 0,
          timeout: 10000,
        }
      );

    return () =>
      navigator.geolocation.clearWatch(watchId);
  }, [watching]);

  const routeMatch = useMemo(() => {
    if (!location) return null;

    const userPoint = point([
      location.longitude,
      location.latitude,
    ]);

    const snapped = nearestPointOnLine(
      routeLine,
      userPoint,
      {
        units: "kilometers",
      }
    );

    const distanceFromRouteKm =
      snapped.properties.dist ?? 0;

    const distanceAlongRouteKm =
      snapped.properties.location ?? 0;

    const routeProgress =
      routeLengthKm > 0
        ? (distanceAlongRouteKm / routeLengthKm) * 100
        : 0;

    const distanceFromRouteMetres =
      distanceFromRouteKm * 1000;

    const goodThreshold =
      route.mode === "bus" ? 70 : 50;

    const possibleThreshold =
      route.mode === "bus" ? 200 : 150;

    let status = "OFF ROUTE";

    if (distanceFromRouteMetres <= goodThreshold) {
      status = "GOOD";
    } else if (
      distanceFromRouteMetres <= possibleThreshold
    ) {
      status = "POSSIBLE";
    }

    return {
      status,
      routeProgress,
      distanceAlongRouteKm,
      distanceFromRouteMetres,
    };
  }, [
    location,
    routeLine,
    routeLengthKm,
    route.mode,
  ]);

  useEffect(() => {
    if (!routeMatch) return;

    if (
      activeJourneyExperienceId !== experience.id
    ) {
      return;
    }

    if (routeMatch.status === "OFF ROUTE") {
      return;
    }

    if (
      !isInsideExperienceSection(
        routeMatch.routeProgress,
        experience
      )
    ) {
      return;
    }

    const progress = getJourneyProgress(
      routeMatch.routeProgress,
      experience,
      direction
    );

    setJourneyProgress((current) =>
      Math.max(current, progress)
    );
  }, [
    routeMatch,
    experience,
    direction,
    activeJourneyExperienceId,
  ]);

  const currentStoryIndex = useMemo(() => {
    let index = 0;

    journeyStories.forEach(
      (story, storyIndex) => {
        if (
          journeyProgress >=
          story.journeyProgress
        ) {
          index = storyIndex;
        }
      }
    );

    return index;
  }, [journeyProgress, journeyStories]);

  const currentStory =
    journeyStories[currentStoryIndex];

  const previousStory =
    currentStoryIndex > 0
      ? journeyStories[currentStoryIndex - 1]
      : null;

  const nextStory =
    currentStoryIndex <
    journeyStories.length - 1
      ? journeyStories[currentStoryIndex + 1]
      : null;

  const relevantMarkedSpots =
    markedSpots.filter(
      (spot) =>
        spot.experienceId === experience.id
    );

  const selectedJourneyIsActive =
    activeJourneyExperienceId === experience.id;

  function selectExperience(
    experienceId: string
  ) {
    setSelectedExperienceId(experienceId);

    if (
      activeJourneyExperienceId === experienceId
    ) {
      setDirection(activeJourneyDirection);
    } else {
      setDirection("forward");
    }

    setScreen("overview");
  }

  function chooseDirection(
    newDirection: JourneyDirection
  ) {
    if (
      activeJourneyExperienceId === experience.id &&
      newDirection !== activeJourneyDirection
    ) {
      setJourneyProgress(0);
      setActiveJourneyExperienceId(null);
    }

    setDirection(newDirection);
  }

  function startExperience() {
    setJourneyProgress(0);

    setActiveJourneyExperienceId(
      experience.id
    );

    setActiveJourneyDirection(direction);

    setWatching(true);
    setScreen("journey");
  }

  function resumeExperience() {
    if (!activeJourneyExperienceId) return;

    const option =
      experienceOptions.find(
        (item) =>
          item.experience.id ===
          activeJourneyExperienceId
      );

    if (!option) return;

    setSelectedExperienceId(
      option.experience.id
    );

    setDirection(
      activeJourneyDirection
    );

    setWatching(true);
    setScreen("journey");
  }

  function goToExperienceOverview() {
    setScreen("overview");
  }

  function goHome() {
    setScreen("home");
  }

  function markCurrentSpot() {
    if (!location || !routeMatch) return;

    const suggested = `Spot ${
      relevantMarkedSpots.length + 1
    }`;

    const label = window.prompt(
      "What did you notice here?",
      suggested
    );

    if (!label?.trim()) return;

    const spot: MarkedSpot = {
      id: crypto.randomUUID(),

      experienceId: experience.id,

      label: label.trim(),

      latitude: location.latitude,
      longitude: location.longitude,

      accuracy: location.accuracy,

      routeProgress:
        routeMatch.routeProgress,

      distanceAlongKm:
        routeMatch.distanceAlongRouteKm,

      distanceFromRouteMetres:
        routeMatch.distanceFromRouteMetres,

      createdAt: new Date().toISOString(),
    };

    const updated = [
      ...markedSpots,
      spot,
    ];

    setMarkedSpots(updated);

    localStorage.setItem(
      "between-stops-marked-spots",
      JSON.stringify(updated)
    );
  }

  function deleteMarkedSpot(id: string) {
    const confirmed = window.confirm(
      "Delete this marked spot?"
    );

    if (!confirmed) return;

    const updated = markedSpots.filter(
      (spot) => spot.id !== id
    );

    setMarkedSpots(updated);

    localStorage.setItem(
      "between-stops-marked-spots",
      JSON.stringify(updated)
    );
  }

  function speakStory() {
    if (
      !currentStory ||
      !("speechSynthesis" in window)
    ) {
      return;
    }

    window.speechSynthesis.cancel();

    const utterance =
      new SpeechSynthesisUtterance(
        `${currentStory.title}. ${currentStory.text}`
      );

    utterance.rate = 0.95;

    window.speechSynthesis.speak(
      utterance
    );
  }

  /*
    HOME
  */

  if (screen === "home") {
    return (
      <main className="shell">
        <header className="brandHeader">
          <div className="brandMark">
            BS
          </div>

          <span>Between Stops</span>
        </header>

        <section className="hero">
          <p className="kicker">
            DISCOVER WHAT&apos;S BETWEEN
          </p>

          <h1>
            Turn ordinary journeys
            <br />
            into experiences.
          </h1>

          <p className="heroCopy">
            Stories, sights and sounds that
            unfold as you travel through the
            city.
          </p>
        </section>

        {activeOption && (
          <section
            style={{
              padding: "0 14px 26px",
            }}
          >
            <button
              className="experienceCard"
              onClick={resumeExperience}
              style={{
                background: "#171717",
                color: "white",
              }}
            >
              <div
                style={{
                  padding: "20px 22px",
                }}
              >
                <p
                  className="kicker"
                  style={{
                    color: "#aaa7a0",
                  }}
                >
                  CURRENT JOURNEY
                </p>

                <h3
                  style={{
                    margin: "0 0 6px",
                    fontSize: "24px",
                  }}
                >
                  {
                    activeOption.experience
                      .title
                  }
                </h3>

                <p
                  style={{
                    margin: 0,
                    color: "#c9c6bf",
                    fontSize: "13px",
                  }}
                >
                  {Math.round(
                    journeyProgress
                  )}
                  % complete
                </p>

                <div
                  style={{
                    marginTop: "18px",
                    fontWeight: 700,
                    fontSize: "13px",
                  }}
                >
                  Resume journey →
                </div>
              </div>
            </button>
          </section>
        )}

        <section className="discoverSection">
          <div className="sectionHeading">
            <div>
              <p className="kicker">
                EDINBURGH
              </p>

              <h2>
                Available experiences
              </h2>
            </div>

            <span className="countPill">
              {experienceOptions.length}
            </span>
          </div>

          <div className="experienceList">
            {experienceOptions.map(
              (option) => (
                <button
                  key={option.experience.id}
                  className="experienceCard"
                  onClick={() =>
                    selectExperience(
                      option.experience.id
                    )
                  }
                  style={{
                    marginBottom: "18px",
                  }}
                >
                  <div
                    className={`experienceImage ${option.visualClass}`}
                  >
                    <div className="tramLine">
                      <span />
                      <span />
                      <span />
                      <span />
                    </div>

                    <div className="imageBadge">
                      {option.badge}
                    </div>
                  </div>

                  <div className="experienceBody">
                    <p className="routeLabel">
                      {
                        option.experience
                          .startLabel
                      }{" "}
                      <span>⇄</span>{" "}
                      {
                        option.experience
                          .endLabel
                      }
                    </p>

                    <h3>
                      {
                        option.experience
                          .title
                      }
                    </h3>

                    <p>
                      {
                        option.experience
                          .description
                      }
                    </p>

                    <div className="metaRow">
                      <span>
                        {
                          option.transportLabel
                        }
                      </span>

                      <span>🎧 Audio</span>
                      <span>◫ Images</span>

                      <span>
                        ◉ Things to spot
                      </span>
                    </div>

                    <div className="cardFooter">
                      <span>
                        Approx.{" "}
                        {
                          option.experience
                            .durationMinutes
                        }{" "}
                        mins
                      </span>

                      <strong>
                        Explore →
                      </strong>
                    </div>
                  </div>
                </button>
              )
            )}
          </div>
        </section>
      </main>
    );
  }

  /*
    EXPERIENCE OVERVIEW
  */

  if (screen === "overview") {
    return (
      <main className="shell">
        <header className="topBar">
          <button
            className="textButton"
            onClick={goHome}
          >
            ← Home
          </button>

          <span className="miniBrand">
            Between Stops
          </span>
        </header>

        <section className="overviewHero">
          <div
            className={`overviewArt ${selectedOption.visualClass}`}
          >
            <div className="imageBadge">
              {selectedOption.badge}
            </div>
          </div>

          <p className="kicker">
            {experience.startLabel.toUpperCase()}
            {" ⇄ "}
            {experience.endLabel.toUpperCase()}
          </p>

          <h1>{experience.title}</h1>

          <p className="lead">
            {experience.description}
          </p>

          <div className="overviewMeta">
            <span>
              About{" "}
              {experience.durationMinutes} mins
            </span>

            <span>
              {experience.stories.length} stories
            </span>

            <span>
              {selectedOption.transportLabel}
            </span>

            <span>
              Mostly seated
            </span>
          </div>

          <div
            className="directionSwitch"
            style={{
              margin: "28px 22px 0",
            }}
          >
            <button
              className={
                direction === "forward"
                  ? "active"
                  : ""
              }
              onClick={() =>
                chooseDirection("forward")
              }
            >
              {experience.startLabel} →{" "}
              {experience.endLabel}
            </button>

            <button
              className={
                direction === "reverse"
                  ? "active"
                  : ""
              }
              onClick={() =>
                chooseDirection("reverse")
              }
            >
              {experience.endLabel} →{" "}
              {experience.startLabel}
            </button>
          </div>
        </section>

        <section className="journeyOutline">
          <p className="kicker">
            YOUR JOURNEY
          </p>

          <div className="timeline">
            <div className="timelineStop startStop">
              <span className="timelineDot" />

              <div>
                <strong>
                  {directionStart}
                </strong>

                <small>
                  Start here
                </small>
              </div>
            </div>

            {journeyStories.map(
              (story) => (
                <div
                  className="timelineMoment"
                  key={story.id}
                >
                  <span className="timelineDot small" />

                  <div>
                    <small>
                      {story.eyebrow}
                    </small>

                    <strong>
                      {story.title}
                    </strong>
                  </div>
                </div>
              )
            )}

            <div className="timelineStop">
              <span className="timelineDot" />

              <div>
                <strong>
                  {directionEnd}
                </strong>

                <small>
                  Journey ends
                </small>
              </div>
            </div>
          </div>
        </section>

        <div className="stickyAction">
          {selectedJourneyIsActive ? (
            <button
              className="primaryButton"
              onClick={resumeExperience}
            >
              Resume experience
            </button>
          ) : (
            <button
              className="primaryButton"
              onClick={startExperience}
            >
              Start experience
            </button>
          )}

          <p>
            Location access is used to keep
            the experience in sync with your
            journey.
          </p>
        </div>
      </main>
    );
  }

  /*
    JOURNEY PLAYER
  */

  return (
    <main className="journeyShell">
      <header className="journeyHeader">
        <div>
          <span className="miniBrand">
            Between Stops
          </span>

          <p>
            {selectedOption.transportLabel}
            {" · "}
            {directionLabel}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          <button
            className="textButton"
            onClick={goToExperienceOverview}
            style={{
              padding: "8px",
            }}
          >
            Tour
          </button>

          <button
            className="textButton"
            onClick={goHome}
            style={{
              padding: "8px",
            }}
          >
            Home
          </button>

          <button
            className="iconButton"
            onClick={() =>
              setTesterOpen(!testerOpen)
            }
            aria-label="Toggle field tools"
          >
            •••
          </button>
        </div>
      </header>

      <div className="progressTrack">
        <div
          className="progressFill"
          style={{
            width: `${Math.min(
              100,
              journeyProgress
            )}%`,
          }}
        />
      </div>

      {routeMatch?.status ===
        "OFF ROUTE" && (
        <div className="routeNotice">
          <strong>
            {route.mode === "bus"
              ? "Waiting to join the bus route"
              : "Waiting to join the tram route"}
          </strong>

          <span>
            Your experience will begin
            progressing once you&apos;re near
            the expected route.
          </span>
        </div>
      )}

      <section className="cueStack">
        {previousStory && (
          <article className="cueCard previousCue">
            <p className="kicker">
              JUST PASSED
            </p>

            <h3>
              {previousStory.title}
            </h3>
          </article>
        )}

        {currentStory && (
          <article className="cueCard activeCue">
            <div className="cueTop">
              <p className="kicker">
                {currentStory.eyebrow}
              </p>

              <span className="cueNumber">
                {currentStoryIndex + 1} /{" "}
                {journeyStories.length}
              </span>
            </div>

            {currentStory.type === "image" && (
              <div className="mediaPlaceholder">
                <span>
                  TEST IMAGE
                </span>
              </div>
            )}

            {currentStory.type === "look" && (
              <div className="lookPanel">
                <span className="lookArrow">
                  ◉
                </span>

                <span>
                  Something to spot
                </span>
              </div>
            )}

            {currentStory.type ===
              "question" && (
              <div className="questionMarker">
                ?
              </div>
            )}

            <h1>
              {currentStory.title}
            </h1>

            <p className="cueCopy">
              {currentStory.text}
            </p>

            {currentStory.type === "audio" && (
              <button
                className="audioButton"
                onClick={speakStory}
              >
                <span className="playIcon">
                  ▶
                </span>

                <span>
                  <strong>
                    Play test audio
                  </strong>

                  <small>
                    Temporary voice for
                    prototype
                  </small>
                </span>
              </button>
            )}

            {currentStory.type ===
              "question" && (
              <div className="answerChoices">
                <button>
                  Buildings
                </button>

                <button>
                  Landscape
                </button>

                <button>
                  People
                </button>
              </div>
            )}
          </article>
        )}

        {nextStory && (
          <article className="cueCard nextCue">
            <p className="kicker">
              COMING UP
            </p>

            <h3>
              {nextStory.title}
            </h3>

            <p>
              {nextStory.eyebrow}
            </p>
          </article>
        )}
      </section>

      {testerOpen && (
        <section className="testerPanel">
          <div className="testerHeading">
            <div>
              <p className="kicker">
                FIELD TOOLS
              </p>

              <h2>
                Mark what you notice
              </h2>
            </div>

            <button
              className="textButton"
              onClick={() =>
                setTesterOpen(false)
              }
            >
              Close
            </button>
          </div>

          <p
            style={{
              color: "#aaa7a0",
              fontSize: "12px",
              lineHeight: 1.5,
              marginTop: "10px",
            }}
          >
            Riding the route? Mark somewhere
            that could become a story. Give it
            a quick label now and refine the
            exact subject later in Creator.
          </p>

          <button
            className="markButton"
            onClick={markCurrentSpot}
            disabled={
              !location ||
              !routeMatch
            }
          >
            📍 Mark this spot
          </button>

          {relevantMarkedSpots.length >
            0 && (
            <div className="markedList">
              <p className="kicker">
                FIELD NOTES (
                {relevantMarkedSpots.length})
              </p>

              {relevantMarkedSpots.map(
                (spot) => (
                  <div
                    className="markedSpot"
                    key={spot.id}
                  >
                    <strong>
                      {spot.label}
                    </strong>

                    <span>
                      {spot.routeProgress.toFixed(
                        1
                      )}
                      % ·{" "}
                      {spot.distanceAlongKm.toFixed(
                        2
                      )}
                      km along route
                    </span>

                    <small>
                      GPS ±
                      {Math.round(
                        spot.accuracy
                      )}
                      m ·{" "}
                      {Math.round(
                        spot.distanceFromRouteMetres
                      )}
                      m from route
                    </small>

                    <button
                      className="textButton"
                      style={{
                        color: "#d88f86",
                        marginTop: "6px",
                        textAlign: "left",
                      }}
                      onClick={() =>
                        deleteMarkedSpot(
                          spot.id
                        )
                      }
                    >
                      Delete
                    </button>
                  </div>
                )
              )}
            </div>
          )}

          <div
            style={{
              marginTop: "28px",
              paddingTop: "22px",
              borderTop:
                "1px solid #414141",
            }}
          >
            <p className="kicker">
              DIAGNOSTICS
            </p>

            <div className="diagnosticGrid">
              <div>
                <small>
                  Transport
                </small>

                <strong>
                  {route.mode === "bus"
                    ? "Bus"
                    : "Tram"}
                </strong>
              </div>

              <div>
                <small>
                  GPS accuracy
                </small>

                <strong>
                  {location
                    ? `±${Math.round(
                        location.accuracy
                      )}m`
                    : "—"}
                </strong>
              </div>

              <div>
                <small>
                  Route match
                </small>

                <strong>
                  {routeMatch?.status ??
                    "—"}
                </strong>
              </div>

              <div>
                <small>
                  Route position
                </small>

                <strong>
                  {routeMatch
                    ? `${routeMatch.routeProgress.toFixed(
                        1
                      )}%`
                    : "—"}
                </strong>
              </div>

              <div>
                <small>
                  Journey progress
                </small>

                <strong>
                  {journeyProgress.toFixed(
                    1
                  )}
                  %
                </strong>
              </div>

              <div>
                <small>
                  From route
                </small>

                <strong>
                  {routeMatch
                    ? `${Math.round(
                        routeMatch.distanceFromRouteMetres
                      )}m`
                    : "—"}
                </strong>
              </div>
            </div>
          </div>

          <button
            className="resetButton"
            onClick={() =>
              setJourneyProgress(0)
            }
          >
            Reset journey progress
          </button>
        </section>
      )}

      {error && (
        <div className="errorNotice">
          {error}
        </div>
      )}
    </main>
  );
}