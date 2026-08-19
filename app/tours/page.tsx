"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { lineString, point } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import length from "@turf/length";

import { edinburghTramRoute } from "@/data/routes/tram";
import { route35MuseumToOceanTerminal } from "@/data/routes/bus35";

import { intoEdinburghExperience } from "@/data/experiences/into-edinburgh";
import { royalMileToShoreExperience } from "@/data/experiences/royal-mile-to-shore";

import {
  createClient,
} from "@/lib/supabase/client";

import {
  loadPublishedExperiences,
} from "@/lib/public-experiences";

import type {
  PublicExperienceOption,
} from "@/lib/public-experiences";

import {
  getJourneyProgress,
  getStoriesForJourney,
  isInsideExperienceSection,
} from "@/lib/experience";

import type {
  JourneyDirection,
} from "@/lib/types";

import {
  TransportIcon,
} from "@/components/transport-icon";

type Screen = "home" | "overview" | "journey";

type DirectionMode = "automatic" | "manual";

type CompletedJourney = {
  id: string;
  experienceId: string;
  direction: JourneyDirection;
  completedAt: string;
};

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

function getTourDistanceKm(
  option: PublicExperienceOption
) {
  if (
    option.route.coordinates.length < 2
  ) {
    return 0;
  }

  const wholeRouteDistance =
    length(
      lineString(
        option.route.coordinates
      ),
      {
        units: "kilometers",
      }
    );
  const sectionShare =
    Math.abs(
      option.experience.endProgress -
        option.experience.startProgress
    ) / 100;

  return (
    wholeRouteDistance *
    sectionShare
  );
}

function formatTourDistance(
  distanceKm: number
) {
  const miles =
    distanceKm * 0.621371;

  return `${
    miles < 10
      ? miles.toFixed(1)
      : Math.round(miles)
  } miles`;
}

const fallbackExperienceOptions: PublicExperienceOption[] = [
  {
    experience: intoEdinburghExperience,
    route: edinburghTramRoute,
    badge: "EDINBURGH TRAM",
    transportLabel: "Tram",
    visualClass: "tramExperience",
    summary:
      intoEdinburghExperience.description,
    fullDescription:
      intoEdinburghExperience.description,
    accessType: "free",
    currency: "GBP",
    galleryImageUrls: [],
    ageGuidance: "all_ages",
    startCoordinates:
      edinburghTramRoute.coordinates[0],
  },
  {
    experience: royalMileToShoreExperience,
    route: route35MuseumToOceanTerminal,
    badge: "BUS 35",
    transportLabel: "Bus 35",
    visualClass: "busExperience",
    summary:
      royalMileToShoreExperience.description,
    fullDescription:
      royalMileToShoreExperience.description,
    accessType: "free",
    currency: "GBP",
    galleryImageUrls: [],
    ageGuidance: "all_ages",
    startCoordinates:
      route35MuseumToOceanTerminal
        .coordinates[0],
  },
];

function getDistanceKilometres(
  first: [number, number],
  second: [number, number]
) {
  const toRadians =
    (degrees: number) =>
      (degrees * Math.PI) /
      180;

  const [firstLongitude, firstLatitude] =
    first;

  const [secondLongitude, secondLatitude] =
    second;

  const latitudeDifference =
    toRadians(
      secondLatitude -
        firstLatitude
    );

  const longitudeDifference =
    toRadians(
      secondLongitude -
        firstLongitude
    );

  const calculation =
    Math.sin(
      latitudeDifference / 2
    ) ** 2 +
    Math.cos(
      toRadians(firstLatitude)
    ) *
      Math.cos(
        toRadians(secondLatitude)
      ) *
      Math.sin(
        longitudeDifference / 2
      ) ** 2;

  return (
    6371 *
    2 *
    Math.atan2(
      Math.sqrt(calculation),
      Math.sqrt(1 - calculation)
    )
  );
}

function formatAvailability(
  option: PublicExperienceOption
) {
  if (!option.availableFrom && !option.availableTo) {
    return "Available all year";
  }

  const formatDate = (value: string) =>
    new Date(`${value}T12:00:00`).toLocaleDateString(
      "en-GB",
      { day: "numeric", month: "short", year: "numeric" }
    );

  if (option.availableFrom && option.availableTo) {
    return `${formatDate(option.availableFrom)} to ${formatDate(option.availableTo)}`;
  }

  return option.availableFrom
    ? `Available from ${formatDate(option.availableFrom)}`
    : `Available until ${formatDate(option.availableTo!)}`;
}

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");

  const [
    experienceOptions,
    setExperienceOptions,
  ] = useState<
    PublicExperienceOption[]
  >([]);

  const [
    catalogueLoading,
    setCatalogueLoading,
  ] = useState(true);

  const [
    catalogueError,
    setCatalogueError,
  ] = useState("");

  const [
    favouriteIds,
    setFavouriteIds,
  ] = useState<Set<string>>(
    new Set()
  );

  const [
    locatingNearby,
    setLocatingNearby,
  ] = useState(false);

  const [
    descriptionExpanded,
    setDescriptionExpanded,
  ] = useState(false);

  const [
    creatorBioExpanded,
    setCreatorBioExpanded,
  ] = useState(false);

  const [selectedExperienceId, setSelectedExperienceId] =
    useState("");

  const [direction, setDirection] =
    useState<JourneyDirection>("forward");

  const [directionMode, setDirectionMode] =
    useState<DirectionMode>("automatic");

  const [directionDetecting, setDirectionDetecting] =
    useState(false);

  const [location, setLocation] =
    useState<LocationData | null>(null);

  const [error, setError] = useState("");
  const [watching, setWatching] = useState(false);

  const [journeyProgress, setJourneyProgress] = useState(0);

  const [journeyCompleted, setJourneyCompleted] =
    useState(false);

  const [completedJourneys, setCompletedJourneys] =
    useState<CompletedJourney[]>([]);

  const detectionStartProgress = useRef<number | null>(null);
  const journeyStartedNearOrigin = useRef(false);

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
    ) ??
    experienceOptions[0] ??
    fallbackExperienceOptions[0];

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
    let isActive = true;

    async function loadCatalogue() {
      try {
        const options =
          await loadPublishedExperiences(
            createClient()
          );

        if (!isActive) {
          return;
        }

        setExperienceOptions(
          options
        );

        const requestedTourId =
          new URLSearchParams(
            window.location.search
          ).get("tour");

        const requestedTourExists =
          requestedTourId &&
          options.some(
            (option) =>
              option.experience.id ===
              requestedTourId
          );

        if (requestedTourExists) {
          setScreen("overview");
        }

        setSelectedExperienceId(
          (current) =>
            requestedTourExists
              ? requestedTourId
              :
            options.some(
              (option) =>
                option.experience.id ===
                current
            )
              ? current
              : options[0]
                  ?.experience.id ?? ""
        );

        setCatalogueError("");
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        const detail =
          loadError instanceof Error
            ? loadError.message
            : "Unknown error";

        setCatalogueError(
          `Tours could not be loaded: ${detail}`
        );
      } finally {
        if (isActive) {
          setCatalogueLoading(false);
        }
      }
    }

    void loadCatalogue();

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    const savedFavourites =
      localStorage.getItem(
        "between-stops-favourites"
      );

    if (savedFavourites) {
      try {
        setFavouriteIds(
          new Set(
            JSON.parse(
              savedFavourites
            ) as string[]
          )
        );
      } catch {
        // Ignore malformed saved favourites.
      }
    }

    const savedCompletions =
      localStorage.getItem(
        "between-stops-completed-journeys"
      );

    if (savedCompletions) {
      try {
        setCompletedJourneys(
          JSON.parse(
            savedCompletions
          ) as CompletedJourney[]
        );
      } catch {
        // Ignore malformed completion data.
      }
    }

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

    const sectionSpan = Math.abs(
      experience.endProgress -
        experience.startProgress
    );
    const endpointThreshold = Math.max(
      2,
      Math.min(6, sectionSpan * 0.12)
    );
    const distanceFromStart = Math.abs(
      routeMatch.routeProgress -
        experience.startProgress
    );
    const distanceFromEnd = Math.abs(
      routeMatch.routeProgress -
        experience.endProgress
    );

    let resolvedDirection = direction;

    if (directionMode === "automatic") {
      if (
        detectionStartProgress.current === null
      ) {
        detectionStartProgress.current =
          routeMatch.routeProgress;
      }

      const movement =
        routeMatch.routeProgress -
        detectionStartProgress.current;

      const detectedDirection:
        | JourneyDirection
        | null =
        distanceFromStart <= endpointThreshold
          ? "forward"
          : distanceFromEnd <= endpointThreshold
            ? "reverse"
            : Math.abs(movement) >= 0.75
              ? movement > 0
                ? "forward"
                : "reverse"
              : null;

      if (detectedDirection) {
        resolvedDirection = detectedDirection;
        setDirection(detectedDirection);
        setActiveJourneyDirection(
          detectedDirection
        );
        setDirectionDetecting(false);
      }
    }

    const originDistance =
      resolvedDirection === "forward"
        ? distanceFromStart
        : distanceFromEnd;

    if (
      originDistance <= endpointThreshold
    ) {
      journeyStartedNearOrigin.current = true;
    }

    const progress = getJourneyProgress(
      routeMatch.routeProgress,
      experience,
      resolvedDirection
    );

    setJourneyProgress((current) =>
      Math.max(current, progress)
    );

    const destinationDistance =
      resolvedDirection === "forward"
        ? distanceFromEnd
        : distanceFromStart;

    if (
      !journeyCompleted &&
      journeyStartedNearOrigin.current &&
      progress >= 85 &&
      destinationDistance <= endpointThreshold
    ) {
      const completion: CompletedJourney = {
        id: crypto.randomUUID(),
        experienceId: experience.id,
        direction: resolvedDirection,
        completedAt: new Date().toISOString(),
      };

      setJourneyCompleted(true);
      setJourneyProgress(100);
      setCompletedJourneys((current) => {
        const updated = [
          completion,
          ...current,
        ];

        localStorage.setItem(
          "between-stops-completed-journeys",
          JSON.stringify(updated)
        );

        return updated;
      });
    }
  }, [
    routeMatch,
    experience,
    direction,
    directionMode,
    journeyCompleted,
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

  const selectedJourneyWasCompleted =
    completedJourneys.some(
      (completion) =>
        completion.experienceId ===
        experience.id
    );

  const featuredOptions =
    experienceOptions.filter(
      (option) =>
        option.featuredRank !==
        undefined
    );

  const favouriteOptions =
    experienceOptions.filter(
      (option) =>
        favouriteIds.has(
          option.experience.id
        )
    );

  const nearbyOptions =
    useMemo(() => {
      if (!location) {
        return experienceOptions;
      }

      const passengerCoordinates:
        [number, number] = [
          location.longitude,
          location.latitude,
        ];

      return [
        ...experienceOptions,
      ].sort(
        (first, second) =>
          getDistanceKilometres(
            passengerCoordinates,
            first.startCoordinates
          ) -
          getDistanceKilometres(
            passengerCoordinates,
            second.startCoordinates
          )
      );
    }, [
      experienceOptions,
      location,
    ]);

  function toggleFavourite(
    experienceId: string
  ) {
    setFavouriteIds(
      (current) => {
        const updated =
          new Set(current);

        if (
          updated.has(
            experienceId
          )
        ) {
          updated.delete(
            experienceId
          );
        } else {
          updated.add(
            experienceId
          );
        }

        localStorage.setItem(
          "between-stops-favourites",
          JSON.stringify(
            Array.from(updated)
          )
        );

        return updated;
      }
    );
  }

  function findNearbyTours() {
    if (!navigator.geolocation) {
      setCatalogueError(
        "Location is not supported on this device."
      );
      return;
    }

    setLocatingNearby(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude:
            position.coords.latitude,
          longitude:
            position.coords.longitude,
          accuracy:
            position.coords.accuracy,
        });
        setCatalogueError("");
        setLocatingNearby(false);
      },
      (locationError) => {
        setCatalogueError(
          locationError.message
        );
        setLocatingNearby(false);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 60000,
        timeout: 10000,
      }
    );
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
    setDirectionMode("manual");
    setDirectionDetecting(false);
  }

  function chooseAutomaticDirection() {
    setDirectionMode("automatic");
    setDirectionDetecting(false);
    detectionStartProgress.current = null;
  }

  function startExperience() {
    setJourneyProgress(0);
    setJourneyCompleted(false);
    journeyStartedNearOrigin.current = false;
    detectionStartProgress.current = null;
    setDirectionDetecting(
      directionMode === "automatic"
    );

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
    setDirectionMode("manual");
    setDirectionDetecting(false);

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

  function renderTourCard(
    option: PublicExperienceOption
  ) {
    const isFavourite =
      favouriteIds.has(
        option.experience.id
      );

    const distance =
      location
        ? getDistanceKilometres(
            [
              location.longitude,
              location.latitude,
            ],
            option.startCoordinates
          )
        : null;

    const tourDistance =
      getTourDistanceKm(option);

    return (
      <article
        className="experienceCard"
        key={option.experience.id}
      >
        <Link
          className="experienceCardMain"
          href={
            option.slug
              ? `/tours/${option.slug}`
              : `/tours?tour=${option.experience.id}`
          }
        >
          <div
            className={`experienceImage ${option.visualClass}`}
          >
            {option.coverImageUrl ? (
              <img
                className="experienceCoverImage"
                src={option.coverImageUrl}
                alt=""
              />
            ) : (
              <div className="tramLine">
                <span />
                <span />
                <span />
                <span />
              </div>
            )}

            <div className="imageBadge">
              <TransportIcon
                mode={option.route.mode}
              />
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
              {option.experience.title}
            </h3>

            {option.creator && (
              <div className="cardCreator">
                {option.creator
                  .avatarUrl && (
                  <img
                    src={
                      option.creator
                        .avatarUrl
                    }
                    alt=""
                  />
                )}

                <span>
                  By {option.creator.displayName}
                </span>
              </div>
            )}

            <p className="tourCardSummary">
              {option.summary}
            </p>

            <div className="metaRow">
              <span>
                {option.transportLabel}
              </span>

              <span>
                {option.experience.stories.length}{" "}
                Stories
              </span>

              <span>
                About{" "}
                {option.experience.durationMinutes}{" "}
                mins
              </span>

              <span>
                Approx. {formatTourDistance(
                  tourDistance
                )}
              </span>

              <span>
                {option.accessType ===
                "free"
                  ? "Free"
                  : option.pricePence !==
                        undefined
                    ? new Intl.NumberFormat(
                        "en-GB",
                        {
                          style: "currency",
                          currency:
                            option.currency,
                        }
                      ).format(
                        option.pricePence /
                          100
                      )
                    : "Paid"}
              </span>
            </div>

            <div className="cardFooter">
              <span>
                {distance !== null
                  ? `${
                      distance < 10
                        ? distance.toFixed(
                            1
                          )
                        : Math.round(
                            distance
                          )
                    } km to start`
                  : `Approx. ${option.experience.durationMinutes} mins`}
              </span>

              <strong>
                Explore →
              </strong>
            </div>
          </div>
        </Link>

        <button
          className={
            isFavourite
              ? "favouriteButton active"
              : "favouriteButton"
          }
          onClick={() =>
            toggleFavourite(
              option.experience.id
            )
          }
          aria-label={
            isFavourite
              ? "Remove from favourites"
              : "Add to favourites"
          }
          aria-pressed={isFavourite}
        >
          {isFavourite ? "♥" : "♡"}
        </button>
      </article>
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
            <img
              src="/branding/between-stops-icon.png"
              alt=""
            />
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

        <section className="nearbyPrompt">
          <div>
            <p className="kicker">
              START NEARBY
            </p>

            <strong>
              {location
                ? "Tours are sorted by distance to their starting point."
                : "Find tours closest to where you are now."}
            </strong>
          </div>

          <button
            onClick={findNearbyTours}
            disabled={locatingNearby}
          >
            {locatingNearby
              ? "Finding…"
              : location
                ? "Update location"
                : "Use my location"}
          </button>
        </section>

        {catalogueError && (
          <div className="catalogueNotice error">
            {catalogueError}
          </div>
        )}

        {catalogueLoading && (
          <div className="catalogueNotice">
            Loading published tours…
          </div>
        )}

        {!catalogueLoading &&
          experienceOptions.length ===
            0 && (
          <div className="catalogueEmpty">
            <p className="kicker">
              EDINBURGH
            </p>

            <h2>
              Tours are being prepared
            </h2>

            <p>
              Published experiences will
              appear here as soon as they
              are ready to travel.
            </p>
          </div>
        )}

        {favouriteOptions.length >
          0 && (
          <section className="discoverSection catalogueSection">
            <div className="sectionHeading">
              <div>
                <p className="kicker">
                  SAVED
                </p>

                <h2>
                  Your favourites
                </h2>
              </div>

              <span className="countPill">
                {favouriteOptions.length}
              </span>
            </div>

            <div className="experienceList">
              {favouriteOptions.map(
                renderTourCard
              )}
            </div>
          </section>
        )}

        {featuredOptions.length > 0 && (
          <section className="discoverSection catalogueSection">
            <div className="sectionHeading">
              <div>
                <p className="kicker">
                  SELECTED FOR YOU
                </p>

                <h2>
                  Featured tours
                </h2>
              </div>

              <span className="countPill">
                {featuredOptions.length}
              </span>
            </div>

            <div className="experienceList">
              {featuredOptions.map(
                renderTourCard
              )}
            </div>
          </section>
        )}

        {experienceOptions.length > 0 && (
          <section className="discoverSection catalogueSection">
            <div className="sectionHeading">
              <div>
                <p className="kicker">
                  EDINBURGH
                </p>

                <h2>
                  {location
                    ? "Tours near you"
                    : "Explore all tours"}
                </h2>
              </div>

              <span className="countPill">
                {experienceOptions.length}
              </span>
            </div>

            <div className="experienceList">
              {nearbyOptions.map(
                renderTourCard
              )}
            </div>
          </section>
        )}
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
            className="textButton homeBubbleButton"
            onClick={goHome}
          >
            ← Tours
          </button>

          <span className="miniBrand">
            <img
              src="/branding/between-stops-icon.png"
              alt=""
            />
            <span>Between Stops</span>
          </span>
        </header>

        <section className="overviewHero">
          <div
            className={`overviewArt ${selectedOption.visualClass}`}
          >
            {selectedOption.coverImageUrl && (
              <img
                className="experienceCoverImage"
                src={
                  selectedOption.coverImageUrl
                }
                alt=""
              />
            )}

            <div className="imageBadge">
              <TransportIcon
                mode={selectedOption.route.mode}
              />
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
            {descriptionExpanded
              ? selectedOption.fullDescription
              : selectedOption.summary}
          </p>

          {selectedOption.fullDescription !==
            selectedOption.summary && (
            <button
              className="readMoreButton"
              onClick={() =>
                setDescriptionExpanded(
                  (current) =>
                    !current
                )
              }
            >
              {descriptionExpanded
                ? "Show less"
                : "Read more"}
            </button>
          )}

          {selectedOption.creator && (
            <div className="overviewCreator">
              {selectedOption.creator
                .avatarUrl && (
                <img
                  src={
                    selectedOption.creator
                      .avatarUrl
                  }
                  alt=""
                />
              )}

              <div>
                <small>
                  Created by
                </small>

                <strong>
                  {
                    selectedOption.creator
                      .displayName
                  }
                </strong>

                {selectedOption.creator
                  .bio && (
                  <p
                    className={
                      creatorBioExpanded
                        ? "creatorBio expanded"
                        : "creatorBio"
                    }
                  >
                    {
                      selectedOption.creator
                        .bio
                    }
                  </p>
                )}

                {selectedOption.creator
                  .bio.length > 150 && (
                  <button
                    className="creatorReadMoreButton"
                    onClick={() =>
                      setCreatorBioExpanded(
                        (current) =>
                          !current
                      )
                    }
                  >
                    {creatorBioExpanded
                      ? "Show less"
                      : "Read more"}
                  </button>
                )}
              </div>
            </div>
          )}

          {selectedOption.galleryImageUrls.length > 0 && (
            <div className="tourGallery" aria-label="Tour photographs">
              {selectedOption.galleryImageUrls.map((imageUrl, index) => (
                <img
                  key={imageUrl}
                  src={imageUrl}
                  alt={`Tour preview ${index + 1}`}
                />
              ))}
            </div>
          )}

          <div className="overviewMeta">
            <span>
              About{" "}
              {experience.durationMinutes} mins
            </span>

            <span>
              {experience.stories.length} stories
            </span>

            <span>
              Approx. {formatTourDistance(
                getTourDistanceKm(
                  selectedOption
                )
              )}
            </span>

            <span>
              {selectedOption.transportLabel}
            </span>

            <span>
              Mostly seated
            </span>

            <span>
              {selectedOption.ageGuidance === "not_for_children"
                ? "Not suitable for children"
                : "Suitable for all ages"}
            </span>

            <span>
              {formatAvailability(selectedOption)}
            </span>

            {selectedJourneyWasCompleted && (
              <span className="completedMeta">
                ✓ Completed on this device
              </span>
            )}
          </div>

          <div className="directionChoiceBlock">
            <div className="directionChoiceHeading">
              <div>
                <strong>Journey direction</strong>
                <span>
                  We can detect this when you start moving.
                </span>
              </div>

              <button
                className={
                  directionMode === "automatic"
                    ? "automaticDirectionButton active"
                    : "automaticDirectionButton"
                }
                onClick={chooseAutomaticDirection}
              >
                Automatic
              </button>
            </div>

            <div className="directionSwitch">
              <button
                className={
                  directionMode === "manual" &&
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
                  directionMode === "manual" &&
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
            Location access keeps the experience in sync. Audio and images are streamed and may use mobile data.
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
            <img
              src="/branding/between-stops-icon.png"
              alt=""
            />
            <span>Between Stops</span>
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
            className="textButton homeBubbleButton"
            onClick={goHome}
          >
            Tours
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

      {directionDetecting && (
        <div className="directionNotice">
          <span className="directionPulse" />
          <div>
            <strong>Detecting your direction</strong>
            <span>
              Keep this page open as the vehicle begins to move. You can choose manually from the Tour screen if needed.
            </span>
          </div>
        </div>
      )}

      {!directionDetecting &&
        directionMode === "automatic" &&
        routeMatch &&
        routeMatch.status !== "OFF ROUTE" && (
        <div className="detectedDirectionNotice">
          Direction detected · {directionLabel}
        </div>
      )}

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

      {journeyCompleted && (
        <section className="journeyCompleteCard">
          <span>✓</span>
          <p className="kicker">JOURNEY COMPLETE</p>
          <h2>You made it to {directionEnd}.</h2>
          <p>
            This completion has been saved on this device. It will later unlock your rating and review.
          </p>
          <button onClick={goToExperienceOverview}>
            View tour details
          </button>
        </section>
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

            {currentStory.imageUrl ? (
              <img
                className="storyImage"
                src={currentStory.imageUrl}
                alt=""
              />
            ) : currentStory.type ===
              "image" ? (
              <div className="mediaPlaceholder">
                <span>
                  IMAGE
                </span>
              </div>
            ) : null}

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

            {(currentStory.type === "audio" ||
              currentStory.type === "look") && (
              currentStory.audioUrl ? (
                <audio
                  className="storyAudioPlayer"
                  controls
                  preload="metadata"
                  src={currentStory.audioUrl}
                />
              ) : (
                <button
                  className="audioButton"
                  onClick={speakStory}
                >
                  <span className="playIcon">
                    ▶
                  </span>

                  <span>
                    <strong>
                      Play narration
                    </strong>

                    <small>
                      Temporary voice
                    </small>
                  </span>
                </button>
              )
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
