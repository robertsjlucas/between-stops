"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  loadPlatformAudio,
} from "@/lib/platform-audio";
import type {
  PlatformAudioKey,
} from "@/lib/platform-audio";

import type {
  PublicExperienceOption,
} from "@/lib/public-experiences";

import {
  downloadTourForOfflineUse,
  formatDownloadSize,
  getOfflineTourRecords,
  getOfflineTourOptions,
  mergeWithOfflineTours,
  removeOfflineTour,
} from "@/lib/offline-tours";

import type {
  OfflineTourRecord,
} from "@/lib/offline-tours";

import {
  loadDestinationRecommendations,
  getRecommendationCategoryLabel,
} from "@/lib/destination-recommendations";

import type {
  DestinationRecommendation,
} from "@/lib/destination-recommendations";

import {
  loadPublicPassengerReviews,
  submitPassengerReview,
} from "@/lib/passenger-reviews";

import type {
  PublicPassengerReview,
} from "@/lib/passenger-reviews";

import {
  loadAndSyncPassengerFavourites,
  savePassengerFavourite,
} from "@/lib/passenger-favourites";

import {
  getDirectionalSide,
  getJourneyProgress,
  getStoriesForJourney,
  getTranscriptAvailability,
  isInsideExperienceSection,
} from "@/lib/experience";

import type {
  JourneyDirection,
} from "@/lib/types";

import {
  TransportIcon,
} from "@/components/transport-icon";
import {
  RecommendationArt,
} from "@/components/recommendation-art";
import { recordTourAnalyticsEvent } from "@/lib/platform-analytics";

type Screen = "home" | "overview" | "preflight" | "journey";

type DirectionMode = "automatic" | "manual";

type RouteMatchStatus = "GOOD" | "POSSIBLE" | "OFF ROUTE";

type SimulatorCondition = "good" | "poor" | "off-route";

type LocationCheckStatus =
  | "idle"
  | "requesting"
  | "granted"
  | "denied";

type AudioPlaybackStatus =
  | "idle"
  | "playing"
  | "paused"
  | "blocked"
  | "error";

type DiagnosticEventType =
  | "journey_started"
  | "direction_changed"
  | "direction_detected"
  | "route_status_changed"
  | "story_triggered"
  | "story_changed"
  | "audio_queued"
  | "audio_started"
  | "direction_prompt_started"
  | "direction_prompt_missing"
  | "audio_paused"
  | "audio_finished"
  | "audio_blocked"
  | "media_error"
  | "story_skipped"
  | "brand_announcement"
  | "journey_completed"
  | "journey_interrupted"
  | "journey_resumed"
  | "journey_restored"
  | "simulator_changed"
  | "progress_reset";

type DiagnosticEvent = {
  at: string;
  type: DiagnosticEventType;
  detail: string;
  source: "gps" | "simulator";
  journeyProgress?: number;
  routeProgress?: number;
  distanceFromRouteMetres?: number;
};

type RouteMatch = {
  status: RouteMatchStatus;
  routeProgress: number;
  distanceAlongRouteKm: number;
  distanceFromRouteMetres: number;
};

type JourneyPhase =
  | "locating"
  | "travelling"
  | "handover"
  | "exploring";

type JourneyStructure =
  | "single"
  | "multi_leg";

type PersistedJourneyState = {
  version: 1 | 2;
  experienceId: string;
  direction: JourneyDirection;
  directionMode: DirectionMode;
  journeyProgress: number;
  journeyCompleted: boolean;
  journeyStructure?: JourneyStructure;
  journeyPhase?: JourneyPhase;
  activeLegId?: string | null;
  events: DiagnosticEvent[];
  triggeredStoryIds?: string[];
  audioQueueIds?: string[];
  activeAudioStoryId?: string | null;
  savedAt: string;
};

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
  speed: number | null;
  capturedAt: number;
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
    endCoordinates:
      edinburghTramRoute.coordinates[
        edinburghTramRoute.coordinates.length - 1
      ],
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
    endCoordinates:
      route35MuseumToOceanTerminal
        .coordinates[
          route35MuseumToOceanTerminal.coordinates.length - 1
        ],
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

const passengerReviewDeviceKey =
  "between-stops-review-device";
const submittedReviewsKey =
  "between-stops-submitted-reviews";

function getPassengerReviewDeviceToken() {
  const existing = localStorage.getItem(
    passengerReviewDeviceKey
  );

  if (existing) return existing;

  const token = crypto.randomUUID();
  localStorage.setItem(passengerReviewDeviceKey, token);
  return token;
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
    onlineExperienceOptions,
    setOnlineExperienceOptions,
  ] = useState<PublicExperienceOption[]>([]);

  const [
    offlineTourRecords,
    setOfflineTourRecords,
  ] = useState<OfflineTourRecord[]>([]);

  const [
    downloadProgress,
    setDownloadProgress,
  ] = useState<{
    completed: number;
    total: number;
  } | null>(null);

  const [downloadError, setDownloadError] = useState("");

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

  const [passengerSignedIn, setPassengerSignedIn] = useState(false);

  const [purchasedExperienceIds, setPurchasedExperienceIds] =
    useState<Set<string>>(new Set());

  const [startedPurchasedExperienceIds, setStartedPurchasedExperienceIds] =
    useState<Set<string>>(new Set());

  const [completedPurchasedExperienceIds, setCompletedPurchasedExperienceIds] =
    useState<Set<string>>(new Set());

  const [checkoutLoading, setCheckoutLoading] =
    useState(false);

  const [checkoutError, setCheckoutError] =
    useState("");

  const [
    locatingNearby,
    setLocatingNearby,
  ] = useState(false);

  const [
    descriptionExpanded,
    setDescriptionExpanded,
  ] = useState(false);

  const [
    shareMessage,
    setShareMessage,
  ] = useState("");

  const [
    creatorBioExpanded,
    setCreatorBioExpanded,
  ] = useState(false);

  const [showTranscripts, setShowTranscripts] =
    useState(false);

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

  const [destinationRecommendations, setDestinationRecommendations] =
    useState<DestinationRecommendation[]>([]);

  const [destinationRecommendationsLoading, setDestinationRecommendationsLoading] =
    useState(false);

  const [completedJourneys, setCompletedJourneys] =
    useState<CompletedJourney[]>([]);

  const [
    completedJourneysOpen,
    setCompletedJourneysOpen,
  ] = useState(false);

  const [publicPassengerReviews, setPublicPassengerReviews] =
    useState<PublicPassengerReview[]>([]);

  const [publicReviewsLoading, setPublicReviewsLoading] =
    useState(false);

  const [submittedReviewExperienceIds, setSubmittedReviewExperienceIds] =
    useState<Set<string>>(new Set());

  const [reviewRating, setReviewRating] = useState(0);
  const [reviewText, setReviewText] = useState("");
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewMessage, setReviewMessage] = useState("");

  const [selectedTipPence, setSelectedTipPence] =
    useState<number | null>(null);
  const [customTipValue, setCustomTipValue] =
    useState("");
  const [tipLoading, setTipLoading] =
    useState(false);
  const [tipMessage, setTipMessage] =
    useState("");

  const detectionStartProgress = useRef<number | null>(null);
  const journeyStartedNearOrigin = useRef(false);
  const analyticsJourneyIdRef = useRef<string | null>(null);

  const [activeJourneyExperienceId, setActiveJourneyExperienceId] =
    useState<string | null>(null);

  const [activeJourneyDirection, setActiveJourneyDirection] =
    useState<JourneyDirection>("forward");

  const [
    activeJourneyStructure,
    setActiveJourneyStructure,
  ] = useState<JourneyStructure>("single");

  const [
    journeyPhase,
    setJourneyPhase,
  ] = useState<JourneyPhase>("travelling");

  const [
    activeJourneyLegId,
    setActiveJourneyLegId,
  ] = useState<string | null>(null);

  const [testerOpen, setTesterOpen] = useState(false);

  const [completionPreviewEnabled, setCompletionPreviewEnabled] =
    useState(false);

  const [simulatorEnabled, setSimulatorEnabled] =
    useState(false);

  const [simulatorProgress, setSimulatorProgress] =
    useState(0);

  const [simulatorCondition, setSimulatorCondition] =
    useState<SimulatorCondition>("good");

  const [diagnosticEvents, setDiagnosticEvents] =
    useState<DiagnosticEvent[]>([]);

  const [journeyStateReady, setJourneyStateReady] =
    useState(false);

  const [locationCheckStatus, setLocationCheckStatus] =
    useState<LocationCheckStatus>("idle");

  const [audioTestStatus, setAudioTestStatus] =
    useState<"idle" | "testing" | "ready" | "error">(
      "idle"
    );

  const [triggeredStoryIds, setTriggeredStoryIds] =
    useState<string[]>([]);

  const [audioQueueIds, setAudioQueueIds] =
    useState<string[]>([]);

  const [activeAudioStoryId, setActiveAudioStoryId] =
    useState<string | null>(null);

  const [audioPlaybackStatus, setAudioPlaybackStatus] =
    useState<AudioPlaybackStatus>("idle");

  const audioElementRef = useRef<HTMLAudioElement | null>(null);
  const audioTestTimerRef = useRef<number | null>(null);
  const wakeLockRef = useRef<{ release: () => Promise<void> } | null>(null);
  const resumeAfterTimestampRef = useRef<number | null>(null);
  const interruptedStoryIdRef = useRef<string | null>(null);
  const activeAudioStoryIdRef = useRef<string | null>(null);
  const brandAnnouncementRef = useRef<PlatformAudioKey | null>(null);
  const finalAnnouncementPlayedRef = useRef(false);
  const endAnnouncementPlayedRef = useRef(false);
  const completionOccurredThisSessionRef = useRef(false);
  const previousMotionReadingRef = useRef<{
    routeProgress: number;
    capturedAt: number;
  } | null>(null);

  const previousRouteStatus = useRef<RouteMatchStatus | null>(null);
  const previousStoryId = useRef<string | null>(null);
  const [pageHidden, setPageHidden] = useState(false);
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const [vehicleMoving, setVehicleMoving] =
    useState(false);
  const [brandAnnouncement, setBrandAnnouncement] =
    useState<PlatformAudioKey | null>(null);
  const [platformAudioUrls, setPlatformAudioUrls] =
    useState<Partial<Record<PlatformAudioKey, string>>>({});

  const [markedSpots, setMarkedSpots] =
    useState<MarkedSpot[]>([]);

  useEffect(() => {
    activeAudioStoryIdRef.current =
      activeAudioStoryId;
  }, [activeAudioStoryId]);

  useEffect(() => {
    brandAnnouncementRef.current =
      brandAnnouncement;
  }, [brandAnnouncement]);

  const recordDiagnostic = useCallback(
    (
      type: DiagnosticEventType,
      detail: string,
      readings?: Partial<DiagnosticEvent>
    ) => {
      setDiagnosticEvents((current) => [
        ...current,
        {
          at: new Date().toISOString(),
          type,
          detail,
          source: simulatorEnabled ? "simulator" : "gps",
          ...readings,
        },
      ]);
    },
    [simulatorEnabled]
  );

  const selectedOption =
    experienceOptions.find(
      (option) =>
        option.experience.id === selectedExperienceId
    ) ??
    experienceOptions[0] ??
    fallbackExperienceOptions[0];

  const selectedOfflineRecord =
    offlineTourRecords.find(
      (record) =>
        record.experienceId === selectedOption.experience.id
    );

  const selectedOnlineOption =
    onlineExperienceOptions.find(
      (option) =>
        option.experience.id === selectedOption.experience.id
    );

  const baseExperience =
    selectedOption.experience;

  const activeJourneyLeg =
    selectedOption.journeyStructure ===
      "multi_leg" &&
    activeJourneyLegId
      ? (selectedOption.legs ?? []).find(
          (leg) =>
            leg.id ===
            activeJourneyLegId
        ) ?? null
      : null;

  const experience = useMemo(
    () => {
      if (!activeJourneyLeg) {
        return baseExperience;
      }

      const activeStoryIds =
        new Set(
          activeJourneyLeg.storyIds
        );

      return {
        ...baseExperience,
        routeId:
          activeJourneyLeg.routeId,
        startProgress:
          activeJourneyLeg.startProgress,
        endProgress:
          activeJourneyLeg.endProgress,
        startLabel:
          activeJourneyLeg.startLabel,
        endLabel:
          activeJourneyLeg.endLabel,
        stories:
          baseExperience.stories.filter(
            (story) =>
              activeStoryIds.has(
                story.id
              )
          ),
      };
    },
    [
      activeJourneyLeg,
      baseExperience,
    ]
  );

  const route =
    activeJourneyLeg?.route ??
    selectedOption.route;

  const orderedJourneyLegs =
    useMemo(
      () =>
        (selectedOption.legs ?? [])
          .slice()
          .sort(
            (first, second) =>
              first.position -
              second.position
          ),
      [selectedOption.legs]
    );

  const activeJourneyLegIndex =
    activeJourneyLeg
      ? orderedJourneyLegs.findIndex(
          (leg) =>
            leg.id ===
            activeJourneyLeg.id
        )
      : -1;

  const nextJourneyLeg =
    activeJourneyLegIndex >= 0
      ? orderedJourneyLegs[
          activeJourneyLegIndex + 1
        ] ??
        (
          selectedOption.isLoop
            ? orderedJourneyLegs[0] ??
              null
            : null
        )
      : null;

  const activeHandover =
    activeJourneyLeg &&
    nextJourneyLeg
      ? (selectedOption.handovers ?? []).find(
          (handover) =>
            handover.fromLegId ===
              activeJourneyLeg.id &&
            handover.toLegId ===
              nextJourneyLeg.id
        ) ?? null
      : null;

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
        route,
        experience,
        direction
      ),
    [route, experience, direction]
  );

  const activeAudioStory =
    journeyStories.find(
      (story) => story.id === activeAudioStoryId
    ) ?? null;

  const directionStart =
    direction === "forward"
      ? experience.startLabel
      : experience.endLabel;

  const directionEnd =
    direction === "forward"
      ? experience.endLabel
      : experience.startLabel;

  const directionLabel = `${directionStart} → ${directionEnd}`;

  const destinationStopId = useMemo(() => {
    const savedStopId =
      activeJourneyLeg
        ? direction === "forward"
          ? activeJourneyLeg.endStopId
          : activeJourneyLeg.startStopId
        : direction === "forward"
          ? selectedOption.endStopId
          : selectedOption.startStopId;

    if (savedStopId) return savedStopId;

    const targetProgress =
      direction === "forward"
        ? experience.endProgress
        : experience.startProgress;

    return route.stops?.reduce<
      { id: string; difference: number } | undefined
    >((closest, stop) => {
      const difference = Math.abs(
        stop.routeProgress - targetProgress
      );

      return !closest || difference < closest.difference
        ? { id: stop.id, difference }
        : closest;
    }, undefined)?.id;
  }, [
    direction,
    experience.endProgress,
    experience.startProgress,
    route.stops,
    selectedOption.endStopId,
    selectedOption.startStopId,
    activeJourneyLeg,
  ]);

  const finalAnnouncementJourneyProgress = useMemo(() => {
    const sectionStops = (route.stops ?? [])
      .filter((stop) =>
        isInsideExperienceSection(stop.routeProgress, experience)
      )
      .map((stop) => ({
        ...stop,
        journeyProgress: getJourneyProgress(
          stop.routeProgress,
          experience,
          direction
        ),
      }))
      .sort(
        (first, second) =>
          first.journeyProgress - second.journeyProgress
      );

    if (sectionStops.length < 2) return 90;
    return Math.min(
      96,
      sectionStops[sectionStops.length - 2].journeyProgress + 0.6
    );
  }, [direction, experience, route.stops]);

  useEffect(() => {
    let active = true;

    if (!journeyCompleted || !destinationStopId) {
      Promise.resolve().then(() => {
        if (active) {
          setDestinationRecommendations([]);
          setDestinationRecommendationsLoading(false);
        }
      });

      return () => {
        active = false;
      };
    }

    setDestinationRecommendationsLoading(true);

    void loadDestinationRecommendations(
      createClient(),
      route.id,
      destinationStopId
    )
      .then((recommendations) => {
        if (active) {
          setDestinationRecommendations(recommendations);
        }
      })
      .catch(() => {
        if (active) {
          setDestinationRecommendations([]);
        }
      })
      .finally(() => {
        if (active) {
          setDestinationRecommendationsLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    destinationStopId,
    journeyCompleted,
    route.id,
  ]);

  useEffect(() => {
    let active = true;

    if (screen !== "overview") {
      return () => {
        active = false;
      };
    }

    setPublicReviewsLoading(true);

    void loadPublicPassengerReviews(
      createClient(),
      experience.id
    )
      .then((reviews) => {
        if (active) setPublicPassengerReviews(reviews);
      })
      .catch(() => {
        if (active) setPublicPassengerReviews([]);
      })
      .finally(() => {
        if (active) setPublicReviewsLoading(false);
      });

    return () => {
      active = false;
    };
  }, [experience.id, screen]);

  useEffect(() => {
    let active = true;

    void loadPlatformAudio(createClient())
      .then((items) => {
        if (!active) return;

        const urls:
          Partial<Record<PlatformAudioKey, string>> = {};

        items.forEach((item) => {
          if (item.url) {
            urls[item.key] = item.url;
          }
        });

        setPlatformAudioUrls(urls);
      })
      .catch(() => {
        // Missing platform audio must never stop a tour.
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioElementRef.current = audio;

    return () => {
      if (audioTestTimerRef.current !== null) {
        window.clearTimeout(audioTestTimerRef.current);
      }
      audio.pause();
      audio.removeAttribute("src");
      audio.load();
      audioElementRef.current = null;
    };
  }, []);

  useEffect(() => {
    let active = true;
    const supabase = createClient();

    async function syncAccountFavourites() {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) return;

      setPassengerSignedIn(true);
      const saved = localStorage.getItem("between-stops-favourites");
      let localIds: string[] = [];
      try {
        localIds = saved ? JSON.parse(saved) as string[] : [];
      } catch {
        localIds = [];
      }

      try {
        const syncedIds = await loadAndSyncPassengerFavourites(supabase, localIds);
        if (!active) return;
        const syncedSet = new Set(syncedIds);
        setFavouriteIds(syncedSet);
        localStorage.setItem("between-stops-favourites", JSON.stringify(syncedIds));
      } catch {
        // Local favourites remain available if account syncing is interrupted.
      }
    }

    void syncAccountFavourites();
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) setPassengerSignedIn(Boolean(session?.user));
    });

    return () => {
      active = false;
      authListener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (screen !== "journey") {
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
      setWakeLockActive(false);
      return;
    }

    void requestJourneyWakeLock();

    const handleVisibilityChange = () => {
      const hidden = document.visibilityState !== "visible";
      setPageHidden(hidden);

      if (hidden) {
        const audio = audioElementRef.current;
        const interruptedStoryId =
          activeAudioStoryIdRef.current;
        const interruptedAnnouncement =
          brandAnnouncementRef.current;

        if (interruptedStoryId) {
          interruptedStoryIdRef.current =
            interruptedStoryId;
        }

        if (interruptedAnnouncement === "next_stop") {
          finalAnnouncementPlayedRef.current = false;
        }

        if (interruptedAnnouncement === "tour_end") {
          endAnnouncementPlayedRef.current = false;
        }

        audio?.pause();

        if (audio) {
          audio.currentTime = 0;
        }

        setBrandAnnouncement(null);
        setAudioQueueIds([]);
        setActiveAudioStoryId(null);
        setAudioPlaybackStatus("idle");
        resumeAfterTimestampRef.current = Date.now();
        void wakeLockRef.current?.release().catch(() => undefined);
        wakeLockRef.current = null;
        setWakeLockActive(false);
      } else {
        void requestJourneyWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void wakeLockRef.current?.release().catch(() => undefined);
      wakeLockRef.current = null;
      setWakeLockActive(false);
    };
  }, [screen]);

  useEffect(() => {
    let isActive = true;

    async function loadCatalogue() {
      const savedRecords = getOfflineTourRecords();
      const savedOptions = getOfflineTourOptions();

      setOfflineTourRecords(savedRecords);

      if (savedOptions.length > 0) {
        setExperienceOptions(savedOptions);
      }

      if ("serviceWorker" in navigator) {
        void navigator.serviceWorker
          .register(
            "/between-stops-sw.js",
            { scope: "/", updateViaCache: "none" }
          )
          .catch(() => {
            // Streaming remains available if this browser blocks offline mode.
          });
      }

      try {
        const response = await fetch(
          "/api/public-experiences",
          { cache: "no-store" }
        );

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as
            | { error?: string }
            | null;

          throw new Error(
            payload?.error ??
              "Published experiences could not be loaded."
          );
        }

        const options =
          (await response.json()) as PublicExperienceOption[];

        if (!isActive) {
          return;
        }

        const mergedOptions = mergeWithOfflineTours(options);
        setOnlineExperienceOptions(options);
        setExperienceOptions(mergedOptions);

        const requestedTourId =
          new URLSearchParams(
            window.location.search
          ).get("tour");

        const requestedTourExists =
          requestedTourId &&
          mergedOptions.some(
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
            mergedOptions.some(
              (option) =>
                option.experience.id ===
                current
            )
              ? current
              : mergedOptions[0]
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

        if (savedOptions.length > 0) {
          setCatalogueError(
            "You are offline. Showing tours saved on this device."
          );
        } else {
          setCatalogueError(
            `Tours could not be loaded: ${detail}`
          );
        }
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

    const savedReviewIds = localStorage.getItem(
      submittedReviewsKey
    );

    if (savedReviewIds) {
      try {
        setSubmittedReviewExperienceIds(
          new Set(JSON.parse(savedReviewIds) as string[])
        );
      } catch {
        // Ignore malformed local review history.
      }
    }

    setShowTranscripts(
      localStorage.getItem(
        "between-stops-show-transcripts"
      ) === "true"
    );

    const savedJourney = localStorage.getItem(
      "between-stops-active-journey"
    );

    if (savedJourney) {
      try {
        const restored = JSON.parse(
          savedJourney
        ) as PersistedJourneyState;

        if (
          (restored.version === 1 ||
            restored.version === 2) &&
          restored.experienceId &&
          (restored.direction === "forward" ||
            restored.direction === "reverse")
        ) {
          const restoredAt = new Date().toISOString();
          const restoredEvents = Array.isArray(restored.events)
            ? restored.events.slice(-199)
            : [];

          const restoredJourneyStructure:
            JourneyStructure =
            restored.version === 2 &&
            restored.journeyStructure ===
              "multi_leg"
              ? "multi_leg"
              : "single";

          const restoredJourneyPhase:
            JourneyPhase =
            restored.version === 2 &&
            (
              restored.journeyPhase === "locating" ||
              restored.journeyPhase === "travelling" ||
              restored.journeyPhase === "handover" ||
              restored.journeyPhase === "exploring"
            )
              ? restored.journeyPhase
              : "travelling";

          setActiveJourneyExperienceId(
            restored.experienceId
          );
          setSelectedExperienceId(
            restored.experienceId
          );
          setDirection(restored.direction);
          setActiveJourneyDirection(
            restored.direction
          );

          setActiveJourneyStructure(
            restoredJourneyStructure
          );

          setJourneyPhase(
            restoredJourneyPhase
          );

          setActiveJourneyLegId(
            restored.version === 2 &&
            typeof restored.activeLegId ===
              "string"
              ? restored.activeLegId
              : null
          );

          setDirectionMode(
            restored.directionMode === "automatic"
              ? "automatic"
              : "manual"
          );
          setJourneyProgress(
            Math.max(
              0,
              Math.min(100, restored.journeyProgress || 0)
            )
          );
          setJourneyCompleted(
            Boolean(restored.journeyCompleted)
          );
          setDiagnosticEvents([
            ...restoredEvents,
            {
              at: restoredAt,
              type: "journey_restored",
              detail: "Saved journey recovered after the app reopened.",
              source: "gps",
              journeyProgress: Math.max(
                0,
                Math.min(100, restored.journeyProgress || 0)
              ),
            },
          ]);
          setTriggeredStoryIds(
            Array.isArray(restored.triggeredStoryIds)
              ? restored.triggeredStoryIds
              : []
          );

          const interruptedAudioIds = [
            restored.activeAudioStoryId,
            ...(Array.isArray(restored.audioQueueIds)
              ? restored.audioQueueIds
              : []),
          ].filter(
            (storyId): storyId is string =>
              typeof storyId === "string"
          );

          setAudioQueueIds(
            Array.from(new Set(interruptedAudioIds))
          );
        }
      } catch {
        localStorage.removeItem(
          "between-stops-active-journey"
        );
      }
    }

    setJourneyStateReady(true);

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
    if (!journeyStateReady) return;

    if (!activeJourneyExperienceId) {
      localStorage.removeItem(
        "between-stops-active-journey"
      );
      return;
    }

    const state: PersistedJourneyState = {
      version: 2,
      experienceId: activeJourneyExperienceId,
      direction: activeJourneyDirection,
      directionMode,
      journeyProgress,
      journeyCompleted,
      journeyStructure:
        activeJourneyStructure,
      journeyPhase,
      activeLegId:
        activeJourneyLegId,
      events: diagnosticEvents.slice(-200),
      triggeredStoryIds,
      audioQueueIds,
      activeAudioStoryId,
      savedAt: new Date().toISOString(),
    };

    localStorage.setItem(
      "between-stops-active-journey",
      JSON.stringify(state)
    );
  }, [
    activeJourneyDirection,
    activeJourneyExperienceId,
    activeJourneyStructure,
    activeJourneyLegId,
    activeAudioStoryId,
    audioQueueIds,
    diagnosticEvents,
    directionMode,
    journeyCompleted,
    journeyPhase,
    journeyProgress,
    journeyStateReady,
    triggeredStoryIds,
  ]);

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
            speed: position.coords.speed,
            capturedAt: position.timestamp || Date.now(),
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

  const gpsRouteMatch = useMemo<RouteMatch | null>(() => {
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

    let status: RouteMatchStatus = "OFF ROUTE";

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

  const loopLegMatch = useMemo(() => {
    if (
      !location ||
      simulatorEnabled ||
      activeJourneyStructure !==
        "multi_leg" ||
      !selectedOption.isLoop ||
      journeyPhase !== "locating" ||
      activeJourneyLegId
    ) {
      return null;
    }

    const userPoint = point([
      location.longitude,
      location.latitude,
    ]);

    const matches =
      orderedJourneyLegs
        .map((leg) => {
          if (
            leg.route.coordinates.length <
              2
          ) {
            return null;
          }

          const legLine =
            lineString(
              leg.route.coordinates
            );

          const legLengthKm =
            length(
              legLine,
              {
                units: "kilometers",
              }
            );

          if (legLengthKm <= 0) {
            return null;
          }

          const snapped =
            nearestPointOnLine(
              legLine,
              userPoint,
              {
                units: "kilometers",
              }
            );

          const distanceFromRouteMetres =
            (
              snapped.properties.dist ??
              0
            ) * 1000;

          const distanceAlongRouteKm =
            snapped.properties.location ??
            0;

          const routeProgress =
            (
              distanceAlongRouteKm /
              legLengthKm
            ) * 100;

          const sectionStart =
            Math.min(
              leg.startProgress,
              leg.endProgress
            );

          const sectionEnd =
            Math.max(
              leg.startProgress,
              leg.endProgress
            );

          const insideLegSection =
            routeProgress >=
              sectionStart - 1 &&
            routeProgress <=
              sectionEnd + 1;

          if (!insideLegSection) {
            return null;
          }

          const goodThreshold =
            leg.route.mode === "bus"
              ? 70
              : 50;

          if (
            distanceFromRouteMetres >
            goodThreshold
          ) {
            return null;
          }

          return {
            leg,
            routeProgress,
            distanceAlongRouteKm,
            distanceFromRouteMetres,
          };
        })
        .filter(
          (
            match
          ): match is NonNullable<
            typeof match
          > => Boolean(match)
        )
        .sort(
          (first, second) =>
            first.distanceFromRouteMetres -
            second.distanceFromRouteMetres
        );

    return matches[0] ?? null;
  }, [
    activeJourneyLegId,
    activeJourneyStructure,
    journeyPhase,
    location,
    orderedJourneyLegs,
    selectedOption.isLoop,
    simulatorEnabled,
  ]);

  const simulatedRouteMatch = useMemo<RouteMatch>(() => {
    const sectionStart = experience.startProgress;
    const sectionEnd = experience.endProgress;
    const sectionShare = simulatorProgress / 100;
    const routeProgress =
      direction === "forward"
        ? sectionStart + (sectionEnd - sectionStart) * sectionShare
        : sectionEnd - (sectionEnd - sectionStart) * sectionShare;

    const status: RouteMatchStatus =
      simulatorCondition === "good"
        ? "GOOD"
        : simulatorCondition === "poor"
          ? "POSSIBLE"
          : "OFF ROUTE";

    const distanceFromRouteMetres =
      simulatorCondition === "good"
        ? 8
        : simulatorCondition === "poor"
          ? route.mode === "bus"
            ? 120
            : 90
          : 350;

    return {
      status,
      routeProgress,
      distanceAlongRouteKm:
        (routeProgress / 100) * routeLengthKm,
      distanceFromRouteMetres,
    };
  }, [
    direction,
    experience.endProgress,
    experience.startProgress,
    route.mode,
    routeLengthKm,
    simulatorCondition,
    simulatorProgress,
  ]);

  const routeMatch = simulatorEnabled
    ? simulatedRouteMatch
    : gpsRouteMatch;

  useEffect(() => {
    if (
      journeyPhase !== "locating" ||
      activeJourneyStructure !==
        "multi_leg" ||
      !selectedOption.isLoop ||
      !loopLegMatch ||
      activeJourneyLegId
    ) {
      return;
    }

    const detectedLeg =
      loopLegMatch.leg;

    setActiveJourneyLegId(
      detectedLeg.id
    );

    setDirection(
      detectedLeg.journeyDirection
    );

    setActiveJourneyDirection(
      detectedLeg.journeyDirection
    );

    setDirectionMode("manual");
    setDirectionDetecting(false);

    /*
      Unlike a linear journey, joining
      halfway through a loop leg is valid.
      This allows its eventual handover
      endpoint to count normally.
    */
    journeyStartedNearOrigin.current =
      true;

    setJourneyProgress(0);

    detectionStartProgress.current =
      null;
    previousRouteStatus.current =
      null;
    previousStoryId.current =
      null;
    previousMotionReadingRef.current =
      null;
    resumeAfterTimestampRef.current =
      null;
    finalAnnouncementPlayedRef.current =
      false;

    setJourneyPhase("travelling");

    recordDiagnostic(
      "journey_resumed",
      `Loop joined on leg ${
        detectedLeg.position + 1
      } near ${
        Math.round(
          loopLegMatch.distanceFromRouteMetres
        )
      } metres from the route.`,
      {
        routeProgress:
          loopLegMatch.routeProgress,
        distanceFromRouteMetres:
          loopLegMatch.distanceFromRouteMetres,
      }
    );
  }, [
    activeJourneyLegId,
    activeJourneyStructure,
    journeyPhase,
    loopLegMatch,
    recordDiagnostic,
    selectedOption.isLoop,
  ]);

  useEffect(() => {
    if (
      !simulatorEnabled ||
      journeyPhase !== "locating" ||
      activeJourneyStructure !==
        "multi_leg" ||
      !selectedOption.isLoop ||
      activeJourneyLegId
    ) {
      return;
    }

    const simulatedLeg =
      orderedJourneyLegs[0];

    if (!simulatedLeg) {
      return;
    }

    setActiveJourneyLegId(
      simulatedLeg.id
    );

    setDirection(
      simulatedLeg.journeyDirection
    );

    setActiveJourneyDirection(
      simulatedLeg.journeyDirection
    );

    setDirectionMode("manual");
    setDirectionDetecting(false);

    journeyStartedNearOrigin.current =
      true;
    setJourneyProgress(0);
    setSimulatorProgress(0);

    previousRouteStatus.current =
      null;
    previousMotionReadingRef.current =
      null;
    finalAnnouncementPlayedRef.current =
      false;

    setJourneyPhase("travelling");
  }, [
    activeJourneyLegId,
    activeJourneyStructure,
    journeyPhase,
    orderedJourneyLegs,
    selectedOption.isLoop,
    simulatorEnabled,
  ]);

  const diagnosticAccuracy = simulatorEnabled
    ? simulatorCondition === "good"
      ? 8
      : simulatorCondition === "poor"
        ? 140
        : 20
    : location?.accuracy ?? null;

  useEffect(() => {
    if (!routeMatch) {
      setVehicleMoving(false);
      return;
    }

    if (simulatorEnabled) {
      setVehicleMoving(true);
      return;
    }

    if (!location) {
      setVehicleMoving(false);
      return;
    }

    const previous = previousMotionReadingRef.current;
    const seconds = previous
      ? Math.max(0.25, (location.capturedAt - previous.capturedAt) / 1000)
      : 0;
    const calculatedSpeed = previous
      ? (Math.abs(routeMatch.routeProgress - previous.routeProgress) /
          100) *
        routeLengthKm *
        1000 /
        seconds
      : 0;
    const measuredSpeed =
      typeof location.speed === "number" && Number.isFinite(location.speed)
        ? location.speed
        : calculatedSpeed;

    setVehicleMoving(measuredSpeed >= 1.1);
    previousMotionReadingRef.current = {
      routeProgress: routeMatch.routeProgress,
      capturedAt: location.capturedAt,
    };
  }, [location, routeLengthKm, routeMatch, simulatorEnabled]);

  useEffect(() => {
    if (!routeMatch) return;

    if (
      journeyPhase !== "travelling"
    ) {
      return;
    }

    if (
      activeJourneyStructure ===
        "multi_leg" &&
      !activeJourneyLeg
    ) {
      return;
    }

    if (
      activeJourneyExperienceId !== experience.id
    ) {
      return;
    }

    if (routeMatch.status !== "GOOD") {
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

    if (
      directionMode === "automatic" &&
      directionDetecting
    ) {
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
        if (detectedDirection !== direction) {
          recordDiagnostic(
            "direction_detected",
            `Automatic direction resolved to ${detectedDirection}.`,
            {
              routeProgress: routeMatch.routeProgress,
              journeyProgress,
            }
          );
        }
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
      activeJourneyStructure ===
        "multi_leg" &&
      nextJourneyLeg &&
      !simulatorEnabled &&
      !journeyCompleted &&
      journeyStartedNearOrigin.current &&
      progress >= 85 &&
      destinationDistance <= endpointThreshold &&
      finalAnnouncementPlayedRef.current
    ) {
      setJourneyProgress(100);
      setJourneyPhase("handover");
      setWatching(false);
      setVehicleMoving(false);
      previousMotionReadingRef.current =
        null;
      return;
    }

    if (
      (
        activeJourneyStructure ===
          "single" ||
        (
          activeJourneyStructure ===
            "multi_leg" &&
          !nextJourneyLeg
        )
      ) &&
      !simulatorEnabled &&
      !journeyCompleted &&
      journeyStartedNearOrigin.current &&
      progress >= 85 &&
      destinationDistance <= endpointThreshold &&
      finalAnnouncementPlayedRef.current
    ) {
      const completion: CompletedJourney = {
        id: crypto.randomUUID(),
        experienceId: experience.id,
        direction: resolvedDirection,
        completedAt: new Date().toISOString(),
      };

      completionOccurredThisSessionRef.current = true;
      setJourneyCompleted(true);
      setJourneyProgress(100);
      setActiveJourneyExperienceId(null);
      recordDiagnostic(
        "journey_completed",
        `Journey completed in the ${resolvedDirection} direction.`,
        {
          journeyProgress: 100,
          routeProgress: routeMatch.routeProgress,
          distanceFromRouteMetres:
            routeMatch.distanceFromRouteMetres,
        }
      );
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

      if (!simulatorEnabled && analyticsJourneyIdRef.current) {
        void recordTourAnalyticsEvent(createClient(), {
          eventType: "tour_completed",
          experienceId: experience.id,
          journeyId: analyticsJourneyIdRef.current,
        }).catch(() => undefined);
      }

      if (
        selectedOption.accessType === "paid" &&
        selectedTourPurchased
      ) {
        void updatePaidTourLifecycle(
          "complete"
        ).catch(() => undefined);
      }
    }
  }, [
    routeMatch,
    experience,
    direction,
    directionDetecting,
    directionMode,
    journeyCompleted,
    journeyProgress,
    activeJourneyExperienceId,
    recordDiagnostic,
    simulatorEnabled,
  ]);

  useEffect(() => {
    if (
      !simulatorEnabled ||
      screen !== "journey" ||
      journeyCompleted ||
      journeyProgress < 100 ||
      !finalAnnouncementPlayedRef.current
    ) {
      return;
    }

    if (
      activeJourneyStructure ===
        "multi_leg" &&
      nextJourneyLeg
    ) {
      if (
        journeyPhase === "travelling"
      ) {
        setJourneyPhase("handover");
        setWatching(false);
        setVehicleMoving(false);
      }
      return;
    }

    completionOccurredThisSessionRef.current = true;
    setJourneyCompleted(true);
    setJourneyProgress(100);
    setActiveJourneyExperienceId(null);

    recordDiagnostic(
      "journey_completed",
      "Simulator journey completed.",
      {
        journeyProgress: 100,
      }
    );
  }, [
    activeJourneyStructure,
    journeyCompleted,
    journeyPhase,
    journeyProgress,
    nextJourneyLeg,
    recordDiagnostic,
    screen,
    simulatorEnabled,
  ]);

  useEffect(() => {
    if (
      !journeyCompleted ||
      !completionOccurredThisSessionRef.current ||
      screen !== "journey" ||
      pageHidden ||
      endAnnouncementPlayedRef.current ||
      brandAnnouncement !== null ||
      activeAudioStoryId ||
      audioQueueIds.length > 0
    ) {
      return;
    }

    endAnnouncementPlayedRef.current = true;
    void playBrandAnnouncement("tour_end");
  }, [
    activeAudioStoryId,
    audioQueueIds.length,
    brandAnnouncement,
    journeyCompleted,
    pageHidden,
    screen,
  ]);

  const currentStoryIndex = useMemo(() => {
    let index = -1;

    journeyStories.forEach(
      (story, storyIndex) => {
        if (
          journeyProgress >=
          story.triggerJourneyProgress
        ) {
          index = storyIndex;
        }
      }
    );

    return index;
  }, [journeyProgress, journeyStories]);

  const currentStory =
    journeyStories[currentStoryIndex];

  useEffect(() => {
    if (
      activeJourneyExperienceId !== experience.id ||
      !routeMatch
    ) {
      return;
    }

    if (
      previousRouteStatus.current !== routeMatch.status
    ) {
      recordDiagnostic(
        "route_status_changed",
        `Route match changed to ${routeMatch.status}.`,
        {
          journeyProgress,
          routeProgress: routeMatch.routeProgress,
          distanceFromRouteMetres:
            routeMatch.distanceFromRouteMetres,
        }
      );
      previousRouteStatus.current = routeMatch.status;
    }
  }, [
    activeJourneyExperienceId,
    experience.id,
    journeyProgress,
    recordDiagnostic,
    routeMatch,
  ]);

  const playStoryAudio = useCallback(
    async (
      storyId: string,
      userInitiated = false
    ) => {
      const story = journeyStories.find(
        (item) => item.id === storyId
      );
      const audio = audioElementRef.current;

      if (!story?.audioUrl || !audio) {
        setAudioPlaybackStatus("error");
        setActiveAudioStoryId(null);
        recordDiagnostic(
          "media_error",
          `No playable uploaded audio was available for: ${story?.title ?? storyId}.`,
          { journeyProgress }
        );
        return;
      }

      setActiveAudioStoryId(story.id);

      type SequenceItem = {
        kind: "prompt" | "story";
        url: string;
        label: string;
      };

      const sequence: SequenceItem[] = [];
      const side =
        story.directionalPrompt && story.subjectLocation
          ? getDirectionalSide(
              route,
              story.subjectLocation,
              direction
            )
          : null;
      const promptUrl =
        side === "left"
          ? selectedOption.creator?.leftPromptUrl
          : side === "right"
            ? selectedOption.creator?.rightPromptUrl
            : undefined;

      if (side && promptUrl) {
        sequence.push({
          kind: "prompt",
          url: promptUrl,
          label: side,
        });
      } else if (story.directionalPrompt) {
        recordDiagnostic(
          "direction_prompt_missing",
          side
            ? `The ${side} voice prompt was unavailable for: ${story.title}.`
            : `A clear left or right side could not be calculated for: ${story.title}.`,
          { journeyProgress }
        );
      }

      sequence.push({
        kind: "story",
        url: story.audioUrl,
        label: story.title,
      });

      const playNext = async (): Promise<void> => {
        const item = sequence.shift();

        if (!item) {
          setAudioPlaybackStatus("idle");
          setActiveAudioStoryId(null);
          recordDiagnostic(
            "audio_finished",
            `Audio finished: ${story.title}.`,
            { journeyProgress }
          );
          return;
        }

        audio.onended = () => {
          void playNext();
        };

        audio.onerror = () => {
          recordDiagnostic(
            "media_error",
            `${item.kind === "prompt" ? "Direction prompt" : "Audio"} failed while loading or playing: ${item.label}.`,
            { journeyProgress }
          );

          if (sequence.length > 0) {
            void playNext();
          } else {
            setAudioPlaybackStatus("error");
            setActiveAudioStoryId(null);
          }
        };

        if (audio.getAttribute("src") !== item.url) {
          audio.src = item.url;
          audio.load();
        }

        try {
          await audio.play();
          setAudioPlaybackStatus("playing");
          recordDiagnostic(
            item.kind === "prompt"
              ? "direction_prompt_started"
              : "audio_started",
            item.kind === "prompt"
              ? `Played the creator's Look ${item.label} prompt before: ${story.title}.`
              : `${userInitiated ? "Passenger started" : "Automatically started"} audio: ${story.title}.`,
            { journeyProgress }
          );
        } catch (playError) {
          const blocked =
            playError instanceof DOMException &&
            playError.name === "NotAllowedError";

          setAudioPlaybackStatus(
            blocked ? "blocked" : "error"
          );
          if (!blocked) {
            setActiveAudioStoryId(null);
          }
          recordDiagnostic(
            blocked ? "audio_blocked" : "media_error",
            blocked
              ? `The browser requires a tap before playing: ${story.title}.`
              : `Audio could not start: ${story.title}.`,
            { journeyProgress }
          );
        }
      };

      await playNext();
    },
    [
      direction,
      journeyProgress,
      journeyStories,
      recordDiagnostic,
      route,
      selectedOption.creator,
    ]
  );

  useEffect(() => {
    if (
      screen !== "journey" ||
      pageHidden ||
      brandAnnouncement !== null ||
      activeAudioStoryId ||
      audioQueueIds.length === 0
    ) {
      return;
    }

    const [nextStoryId, ...remainingIds] =
      audioQueueIds;
    setAudioQueueIds(remainingIds);
    void playStoryAudio(nextStoryId);
  }, [
    activeAudioStoryId,
    audioQueueIds,
    brandAnnouncement,
    pageHidden,
    playStoryAudio,
    screen,
  ]);

  useEffect(() => {
    if (
      screen !== "journey" ||
      journeyPhase !== "travelling" ||
      pageHidden ||
      activeJourneyExperienceId !== experience.id ||
      (
        activeJourneyStructure ===
          "multi_leg" &&
        !activeJourneyLeg
      ) ||
      routeMatch?.status !== "GOOD"
    ) {
      return;
    }

    if (resumeAfterTimestampRef.current !== null) {
      if (
        !simulatorEnabled &&
        (!location ||
          location.capturedAt <= resumeAfterTimestampRef.current)
      ) {
        return;
      }

      const interruptedStoryId =
        interruptedStoryIdRef.current;

      const passedStoryIds = journeyStories
        .filter(
          (story) =>
            journeyProgress >=
              story.triggerJourneyProgress
        )
        .map((story) => story.id);

      setTriggeredStoryIds((current) => [
        ...current,
        ...passedStoryIds.filter(
          (storyId) =>
            !current.includes(storyId)
        ),
      ]);

      const interruptedStoryStillExists =
        interruptedStoryId !== null &&
        journeyStories.some(
          (story) =>
            story.id === interruptedStoryId &&
            Boolean(story.audioUrl)
        );

      setAudioQueueIds(
        interruptedStoryStillExists
          ? [interruptedStoryId]
          : []
      );

      interruptedStoryIdRef.current = null;
      resumeAfterTimestampRef.current = null;

      recordDiagnostic(
        interruptedStoryStillExists
          ? "audio_queued"
          : "story_skipped",
        interruptedStoryStillExists
          ? "Returned to the journey after using another screen. The interrupted Story will restart from the beginning; other passed Stories were skipped."
          : "Returned to the journey after using another screen. Passed Stories were skipped to prevent an audio backlog.",
        {
          journeyProgress,
          routeProgress:
            routeMatch.routeProgress,
        }
      );

      return;
    }

    if (!vehicleMoving) {
      return;
    }

    /*
      Location is authoritative.

      If the passenger joins an experience
      part-way through, Stories whose subject
      has already been passed must not become
      an audio backlog.

      A Story may still trigger if its subject
      is ahead of the passenger and the
      passenger is already inside its approach
      window.
    */
    const passedStoryIds =
      journeyStories
        .filter(
          (story) =>
            journeyProgress >
              story.journeyProgress &&
            !triggeredStoryIds.includes(
              story.id
            )
        )
        .map((story) => story.id);

    const newlyTriggered =
      journeyStories.filter(
        (story) =>
          journeyProgress >=
            story.triggerJourneyProgress &&
          journeyProgress <=
            story.journeyProgress &&
          !triggeredStoryIds.includes(
            story.id
          )
      );

    if (
      passedStoryIds.length === 0 &&
      newlyTriggered.length === 0
    ) {
      return;
    }

    const newIds =
      newlyTriggered.map(
        (story) => story.id
      );

    setTriggeredStoryIds(
      (current) => [
        ...current,
        ...[
          ...passedStoryIds,
          ...newIds,
        ].filter(
          (storyId) =>
            !current.includes(storyId)
        ),
      ]
    );

    if (newIds.length > 0) {
      setAudioQueueIds((current) => [
        ...current,
        ...newIds.filter(
          (storyId) =>
            storyId !==
              activeAudioStoryId &&
            !current.includes(
              storyId
            )
        ),
      ]);
    }

    passedStoryIds.forEach(
      (storyId) => {
        const story =
          journeyStories.find(
            (item) =>
              item.id === storyId
          );

        recordDiagnostic(
          "story_skipped",
          `Story passed before playback and was skipped: ${
            story?.title ?? storyId
          }.`,
          {
            journeyProgress,
            routeProgress:
              routeMatch.routeProgress,
          }
        );
      }
    );

    newlyTriggered.forEach((story, index) => {
      recordDiagnostic(
        "story_triggered",
        `Approach trigger reached ${Math.round(story.leadDistanceMetres)}m before the subject: ${story.title}.`,
        {
          journeyProgress,
          routeProgress: routeMatch.routeProgress,
        }
      );

      if (
        activeAudioStoryId ||
        audioQueueIds.length > 0 ||
        index > 0
      ) {
        recordDiagnostic(
          "audio_queued",
          `Audio queued without overlap: ${story.title}.`,
          { journeyProgress }
        );
      }
    });
  }, [
    activeAudioStoryId,
    activeJourneyExperienceId,
    audioQueueIds.length,
    experience.id,
    journeyProgress,
    journeyStories,
    location,
    pageHidden,
    recordDiagnostic,
    routeMatch,
    screen,
    simulatorEnabled,
    triggeredStoryIds,
    vehicleMoving,
  ]);

  useEffect(() => {
    if (
      screen !== "journey" ||
      journeyCompleted ||
      pageHidden ||
      finalAnnouncementPlayedRef.current ||
      journeyProgress < finalAnnouncementJourneyProgress ||
      (!simulatorEnabled && !vehicleMoving) ||
      brandAnnouncement !== null ||
      activeAudioStoryId ||
      audioQueueIds.length > 0
    ) {
      return;
    }

    finalAnnouncementPlayedRef.current = true;
    void playBrandAnnouncement("next_stop");
  }, [
    activeAudioStoryId,
    audioQueueIds.length,
    brandAnnouncement,
    finalAnnouncementJourneyProgress,
    journeyCompleted,
    journeyProgress,
    pageHidden,
    screen,
    simulatorEnabled,
    vehicleMoving,
  ]);

  useEffect(() => {
    if (
      activeJourneyExperienceId !== experience.id ||
      !currentStory ||
      previousStoryId.current === currentStory.id
    ) {
      return;
    }

    recordDiagnostic(
      "story_changed",
      `Story ${currentStoryIndex + 1} opened: ${currentStory.title}.`,
      {
        journeyProgress,
        routeProgress: routeMatch?.routeProgress,
        distanceFromRouteMetres:
          routeMatch?.distanceFromRouteMetres,
      }
    );
    previousStoryId.current = currentStory.id;
  }, [
    activeJourneyExperienceId,
    currentStory,
    currentStoryIndex,
    experience.id,
    journeyProgress,
    recordDiagnostic,
    routeMatch,
  ]);

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

  const completedExperienceIds =
    new Set(
      completedJourneys.map(
        (completion) =>
          completion.experienceId
      )
    );

  const completedOptions =
    experienceOptions.filter(
      (option) =>
        completedExperienceIds.has(
          option.experience.id
        )
    );

  const availableExperienceOptions =
    experienceOptions.filter(
      (option) =>
        !completedExperienceIds.has(
          option.experience.id
        )
    );

  const featuredOptions =
    availableExperienceOptions.filter(
      (option) =>
        option.featuredRank !==
        undefined
    );

  const favouriteOptions =
    availableExperienceOptions.filter(
      (option) =>
        favouriteIds.has(
          option.experience.id
        )
    );

  const nearbyOptions =
    useMemo(() => {
      if (!location) {
        return availableExperienceOptions;
      }

      const passengerCoordinates:
        [number, number] = [
          location.longitude,
          location.latitude,
        ];

      return [
        ...availableExperienceOptions,
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

  async function loadPassengerPurchases() {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setPurchasedExperienceIds(new Set());
      setStartedPurchasedExperienceIds(new Set());
      setCompletedPurchasedExperienceIds(new Set());
      return false;
    }

    const { data, error } = await supabase
      .from("passenger_purchases")
      .select(`
        experience_id,
        started_at,
        completed_at
      `)
      .eq("user_id", user.id)
      .eq("status", "paid");

    if (error) {
      throw error;
    }

    const rows = data ?? [];

    setPurchasedExperienceIds(
      new Set(
        rows.map(
          (purchase) => purchase.experience_id
        )
      )
    );

    setStartedPurchasedExperienceIds(
      new Set(
        rows
          .filter(
            (purchase) =>
              Boolean(purchase.started_at)
          )
          .map(
            (purchase) =>
              purchase.experience_id
          )
      )
    );

    setCompletedPurchasedExperienceIds(
      new Set(
        rows
          .filter(
            (purchase) =>
              Boolean(purchase.completed_at)
          )
          .map(
            (purchase) =>
              purchase.experience_id
          )
      )
    );

    return true;
  }

  useEffect(() => {
    const params =
      new URLSearchParams(
        window.location.search
      );

    if (
      params.get("tip") === "success"
    ) {
      setTipMessage(
        "Thank you for supporting your guide."
      );
    } else if (
      params.get("tip") === "cancelled"
    ) {
      setTipMessage(
        "Tip cancelled. No payment was taken."
      );
    }
  }, []);

  useEffect(() => {
    if (!passengerSignedIn) {
      setPurchasedExperienceIds(new Set());
      setStartedPurchasedExperienceIds(new Set());
      setCompletedPurchasedExperienceIds(new Set());
      return;
    }

    let cancelled = false;

    async function refreshPurchases() {
      try {
        await loadPassengerPurchases();

        if (
          selectedOption.accessType === "paid" &&
          !purchasedExperienceIds.has(
            selectedOption.experience.id
          )
        ) {
          const response = await fetch(
            "/api/stripe/purchases/recover",
            {
              method: "POST",
              headers: {
                "Content-Type":
                  "application/json",
              },
              body: JSON.stringify({
                experienceId:
                  selectedOption.experience.id,
              }),
            }
          );

          if (response.ok) {
            const result =
              await response.json();

            if (result.recovered) {
              await loadPassengerPurchases();
            }
          }
        }
      } catch {
        if (!cancelled) {
          setCheckoutError(
            "Your purchases could not be checked."
          );
        }
      }
    }

    void refreshPurchases();

    const params = new URLSearchParams(
      window.location.search
    );

    if (params.get("checkout") === "success") {
      const sessionId =
        params.get("session_id");

      async function confirmReturnedPurchase() {
        try {
          if (sessionId) {
            const response = await fetch(
              "/api/stripe/checkout/verify",
              {
                method: "POST",
                headers: {
                  "Content-Type":
                    "application/json",
                },
                body: JSON.stringify({
                  sessionId,
                }),
              }
            );

            const result =
              await response.json();

            if (!response.ok) {
              throw new Error(
                result.error ??
                  "Purchase could not be confirmed."
              );
            }
          }

          await loadPassengerPurchases();

          if (!cancelled) {
            setCheckoutError("");
          }
        } catch (error) {
          if (!cancelled) {
            setCheckoutError(
              error instanceof Error
                ? error.message
                : "Purchase could not be confirmed."
            );
          }
        }
      }

      void confirmReturnedPurchase();

      return () => {
        cancelled = true;
      };
    }

    return () => {
      cancelled = true;
    };
  }, [passengerSignedIn]);

  const selectedTourPurchased =
    purchasedExperienceIds.has(
      experience.id
    );

  const selectedTourStarted =
    startedPurchasedExperienceIds.has(
      experience.id
    );

  const selectedTourCompleted =
    completedPurchasedExperienceIds.has(
      experience.id
    );

  async function updatePaidTourLifecycle(
    action: "start" | "complete"
  ) {
    if (
      selectedOption.accessType !== "paid" ||
      !selectedTourPurchased
    ) {
      return;
    }

    const response = await fetch(
      "/api/stripe/purchases/lifecycle",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          experienceId:
            experience.id,
          action,
        }),
      }
    );

    if (!response.ok) {
      const result =
        await response.json();

      throw new Error(
        result.error ??
          "Paid tour status could not be updated."
      );
    }

    await loadPassengerPurchases();
  }

  function signInToBuy() {
    const next =
      `${window.location.pathname}${window.location.search}`;

    window.location.href =
      `/login?next=${encodeURIComponent(next)}&mode=passenger`;
  }

  async function buySelectedTour() {
    if (checkoutLoading) return;

    if (!passengerSignedIn) {
      signInToBuy();
      return;
    }

    setCheckoutLoading(true);
    setCheckoutError("");

    try {
      const response = await fetch(
        "/api/stripe/checkout",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            experienceId: experience.id,
          }),
        }
      );

      const result = await response.json();

      if (result.alreadyPurchased) {
        await loadPassengerPurchases();
        setCheckoutLoading(false);
        return;
      }

      if (!response.ok || !result.url) {
        throw new Error(
          result.error ??
            "Checkout could not be started."
        );
      }

      window.location.assign(result.url);
    } catch (error) {
      setCheckoutError(
        error instanceof Error
          ? error.message
          : "Checkout could not be started."
      );
      setCheckoutLoading(false);
    }
  }

  function toggleFavourite(
    experienceId: string
  ) {
    const updated = new Set(favouriteIds);
    const willBeFavourite = !updated.has(experienceId);
    if (willBeFavourite) updated.add(experienceId);
    else updated.delete(experienceId);

    setFavouriteIds(updated);
    localStorage.setItem("between-stops-favourites", JSON.stringify(Array.from(updated)));

    if (passengerSignedIn) {
      void savePassengerFavourite(createClient(), experienceId, willBeFavourite).catch(() => {
        // Keep the immediate local action; account sync will retry next visit.
      });
    }
  }

  async function signOutPassenger() {
    await createClient().auth.signOut();
    setPassengerSignedIn(false);
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
          speed: position.coords.speed,
          capturedAt: position.timestamp || Date.now(),
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
    recordDiagnostic(
      "direction_changed",
      `Direction manually changed to ${newDirection}.`
    );
  }

  function chooseAutomaticDirection() {
    setDirectionMode("automatic");
    setDirectionDetecting(false);
    detectionStartProgress.current = null;
  }

  function prepareExperience() {
    if (
      selectedOption.accessType === "paid" &&
      selectedTourCompleted
    ) {
      setCheckoutError(
        "You have completed this paid experience."
      );
      return;
    }

    if (
      selectedOption.accessType === "paid" &&
      !selectedTourPurchased
    ) {
      if (passengerSignedIn) {
        void buySelectedTour();
      } else {
        signInToBuy();
      }
      return;
    }

    const allowedDirection =
      selectedOption.journeyDirectionAvailability ??
      "either";

    if (allowedDirection === "forward") {
      setDirection("forward");
      setDirectionMode("manual");
    } else if (
      allowedDirection === "reverse"
    ) {
      setDirection("reverse");
      setDirectionMode("manual");
    } else {
      setDirectionMode("automatic");
    }

    setDirectionDetecting(false);
    detectionStartProgress.current = null;
    setLocationCheckStatus(
      location ? "granted" : "idle"
    );
    setAudioTestStatus("idle");
    setScreen("preflight");
  }

  async function downloadSelectedTour() {
    const sourceOption = selectedOnlineOption ?? selectedOption;

    setDownloadError("");
    setDownloadProgress({ completed: 0, total: 0 });

    try {
      await downloadTourForOfflineUse(
        sourceOption,
        (completed, total) => {
          setDownloadProgress({ completed, total });
        }
      );

      const records = getOfflineTourRecords();
      setOfflineTourRecords(records);
      setExperienceOptions(
        mergeWithOfflineTours(onlineExperienceOptions)
      );
    } catch (downloadFailure) {
      setDownloadError(
        downloadFailure instanceof Error
          ? downloadFailure.message
          : "This tour could not be downloaded."
      );
    } finally {
      setDownloadProgress(null);
    }
  }

  async function submitCompletedTourReview() {
    if (reviewRating < 1 || reviewRating > 5) {
      setReviewMessage("Choose a star rating first.");
      return;
    }

    setReviewSubmitting(true);
    setReviewMessage("");

    try {
      await submitPassengerReview(createClient(), {
        experienceId: experience.id,
        deviceToken: getPassengerReviewDeviceToken(),
        rating: reviewRating,
        reviewText,
      });

      const updated = new Set(submittedReviewExperienceIds);
      updated.add(experience.id);
      setSubmittedReviewExperienceIds(updated);
      localStorage.setItem(
        submittedReviewsKey,
        JSON.stringify(Array.from(updated))
      );
      setReviewMessage(
        reviewText.trim()
          ? "Thank you. Your rating is saved and your written review is awaiting approval."
          : "Thank you. Your rating has been saved."
      );
    } catch (reviewFailure) {
      const detail =
        reviewFailure instanceof Error
          ? reviewFailure.message
          : "Your review could not be saved.";

      if (detail.toLowerCase().includes("duplicate")) {
        const updated = new Set(submittedReviewExperienceIds);
        updated.add(experience.id);
        setSubmittedReviewExperienceIds(updated);
        localStorage.setItem(
          submittedReviewsKey,
          JSON.stringify(Array.from(updated))
        );
        setReviewMessage("You have already rated this experience.");
      } else {
        setReviewMessage(detail);
      }
    } finally {
      setReviewSubmitting(false);
    }
  }

  async function startTipCheckout(
    amountPence: number
  ) {
    if (
      tipLoading ||
      simulatorEnabled ||
      completionPreviewEnabled
    ) {
      return;
    }

    if (
      !Number.isInteger(amountPence) ||
      amountPence < 100
    ) {
      setTipMessage(
        "Choose a tip of at least £1."
      );
      return;
    }

    setTipLoading(true);
    setTipMessage("");

    try {
      const response =
        await fetch(
          "/api/stripe/tip",
          {
            method: "POST",
            headers: {
              "Content-Type":
                "application/json",
            },
            body: JSON.stringify({
              experienceId:
                experience.id,
              amountPence,
            }),
          }
        );

      const result =
        await response.json();

      if (
        !response.ok ||
        !result.url
      ) {
        throw new Error(
          result.error ??
            "Tip checkout could not be started."
        );
      }

      window.location.assign(
        result.url
      );
    } catch (error) {
      setTipMessage(
        error instanceof Error
          ? error.message
          : "Tip checkout could not be started."
      );
      setTipLoading(false);
    }
  }

  async function removeSelectedOfflineTour() {
    setDownloadError("");

    try {
      await removeOfflineTour(selectedOption.experience.id);
      const records = getOfflineTourRecords();
      setOfflineTourRecords(records);
      setExperienceOptions(
        mergeWithOfflineTours(onlineExperienceOptions)
      );
    } catch {
      setDownloadError("The saved tour could not be removed.");
    }
  }

  async function requestJourneyWakeLock() {
    type WakeLockNavigator = Navigator & {
      wakeLock?: {
        request: (type: "screen") => Promise<{
          release: () => Promise<void>;
        }>;
      };
    };

    try {
      const wakeLock = (navigator as WakeLockNavigator).wakeLock;
      if (!wakeLock || document.visibilityState !== "visible") return;
      wakeLockRef.current = await wakeLock.request("screen");
      setWakeLockActive(true);
    } catch {
      wakeLockRef.current = null;
      setWakeLockActive(false);
    }
  }

  async function playBrandAnnouncement(
    kind: PlatformAudioKey
  ) {
    const audio = audioElementRef.current;

    if (!audio) {
      return;
    }

    let url = platformAudioUrls[kind];

    if (!url) {
      try {
        const items =
          await loadPlatformAudio(createClient());

        const refreshedUrls:
          Partial<Record<PlatformAudioKey, string>> = {};

        items.forEach((item) => {
          if (item.url) {
            refreshedUrls[item.key] = item.url;
          }
        });

        setPlatformAudioUrls(refreshedUrls);
        url = refreshedUrls[kind];
      } catch {
        // Platform audio is optional. The journey must continue.
      }
    }

    if (!url) {
      recordDiagnostic(
        "brand_announcement",
        `Beyond the Stops ${kind} audio was not available. Journey continued normally.`,
        { journeyProgress }
      );
      setBrandAnnouncement(null);
      return;
    }

    audio.pause();
    audio.currentTime = 0;

    setBrandAnnouncement(kind);

    audio.onended = () => {
      setBrandAnnouncement(null);
      setAudioPlaybackStatus("idle");

      if (
        kind === "next_stop" &&
        activeJourneyStructure ===
          "single" &&
        simulatorEnabled &&
        journeyProgress >= 100 &&
        !journeyCompleted
      ) {
        completionOccurredThisSessionRef.current = true;
        setJourneyCompleted(true);
        setJourneyProgress(100);
        setActiveJourneyExperienceId(null);

        recordDiagnostic(
          "journey_completed",
          "Simulator journey completed after the next-stop reminder.",
          {
            journeyProgress: 100,
          }
        );
      }
    };

    audio.onerror = () => {
      recordDiagnostic(
        "media_error",
        `Beyond the Stops ${kind} audio failed while loading or playing.`,
        { journeyProgress }
      );
      setBrandAnnouncement(null);
      setAudioPlaybackStatus("idle");
    };

    if (audio.getAttribute("src") !== url) {
      audio.src = url;
      audio.load();
    }

    try {
      await audio.play();
      setAudioPlaybackStatus("playing");

      recordDiagnostic(
        "brand_announcement",
        kind === "welcome"
          ? "Played the Beyond the Stops welcome."
          : kind === "next_stop"
            ? "Played the Beyond the Stops next-stop reminder."
            : "Played the Beyond the Stops end-of-tour message.",
        { journeyProgress }
      );
    } catch (playError) {
      const blocked =
        playError instanceof DOMException &&
        playError.name === "NotAllowedError";

      setBrandAnnouncement(null);
      setAudioPlaybackStatus(
        blocked ? "blocked" : "error"
      );

      recordDiagnostic(
        blocked ? "audio_blocked" : "media_error",
        blocked
          ? `The browser blocked the Beyond the Stops ${kind} announcement.`
          : `The Beyond the Stops ${kind} announcement could not start.`,
        { journeyProgress }
      );
    }
  }

  function requestPreflightLocation() {
    if (!navigator.geolocation) {
      setLocationCheckStatus("denied");
      setError(
        "Location is not supported on this device."
      );
      return;
    }

    setLocationCheckStatus("requesting");
    setError("");

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          speed: position.coords.speed,
          capturedAt: position.timestamp || Date.now(),
        });
        setLocationCheckStatus("granted");
      },
      (locationError) => {
        setLocationCheckStatus("denied");
        setError(locationError.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 30000,
        timeout: 10000,
      }
    );
  }

  async function testJourneyAudio() {
    const audio = audioElementRef.current;

    if (audioTestTimerRef.current !== null) {
      window.clearTimeout(audioTestTimerRef.current);
      audioTestTimerRef.current = null;
    }

    audio?.pause();
    setAudioTestStatus("testing");

    try {
      const context = new AudioContext();
      const gain = context.createGain();
      gain.gain.setValueAtTime(0.0001, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.18, context.currentTime + 0.03);
      gain.gain.setValueAtTime(0.18, context.currentTime + 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.62);
      gain.connect(context.destination);

      const firstTone = context.createOscillator();
      firstTone.frequency.value = 523.25;
      firstTone.connect(gain);
      firstTone.start(context.currentTime);
      firstTone.stop(context.currentTime + 0.24);

      const secondTone = context.createOscillator();
      secondTone.frequency.value = 659.25;
      secondTone.connect(gain);
      secondTone.start(context.currentTime + 0.3);
      secondTone.stop(context.currentTime + 0.62);

      audioTestTimerRef.current = window.setTimeout(
        () => {
          void context.close();
          setAudioTestStatus("ready");
          audioTestTimerRef.current = null;
        },
        750
      );
    } catch {
      setAudioTestStatus("error");
    }
  }

  function beginExperience() {
    const audio = audioElementRef.current;

    const journeyStructure:
      JourneyStructure =
      selectedOption.journeyStructure ===
        "multi_leg"
        ? "multi_leg"
        : "single";

    const orderedLegs =
      (selectedOption.legs ?? [])
        .slice()
        .sort(
          (first, second) =>
            first.position -
            second.position
        );

    const initialLegId =
      journeyStructure ===
        "multi_leg" &&
      !selectedOption.isLoop
        ? orderedLegs[0]?.id ??
          null
        : null;

    const initialPhase:
      JourneyPhase =
      journeyStructure ===
        "multi_leg" &&
      selectedOption.isLoop
        ? "locating"
        : "travelling";
    const initialDirection:
      JourneyDirection =
      journeyStructure ===
        "multi_leg" &&
      !selectedOption.isLoop
        ? orderedLegs[0]
            ?.journeyDirection ??
          direction
        : direction;

    audio?.pause();
    if (audio) {
      audio.currentTime = 0;
    }
    setJourneyProgress(0);
    setJourneyCompleted(false);

    setActiveJourneyStructure(
      journeyStructure
    );

    setJourneyPhase(
      initialPhase
    );

    setActiveJourneyLegId(
      initialLegId
    );

    setTriggeredStoryIds([]);
    setAudioQueueIds([]);
    setActiveAudioStoryId(null);
    setAudioPlaybackStatus("idle");
    journeyStartedNearOrigin.current = false;
    detectionStartProgress.current = null;
    previousRouteStatus.current = null;
    previousStoryId.current = null;
    previousMotionReadingRef.current = null;
    resumeAfterTimestampRef.current = null;
    finalAnnouncementPlayedRef.current = false;
    endAnnouncementPlayedRef.current = false;
    completionOccurredThisSessionRef.current = false;
    setPageHidden(false);
    setDirection(
      initialDirection
    );

    setDirectionDetecting(
      journeyStructure === "single" &&
      directionMode === "automatic" &&
      (
        selectedOption.journeyDirectionAvailability ??
        "either"
      ) === "either"
    );

    setActiveJourneyExperienceId(
      experience.id
    );

    setActiveJourneyDirection(
      initialDirection
    );

    const analyticsJourneyId = crypto.randomUUID();
    analyticsJourneyIdRef.current = analyticsJourneyId;

    if (
      !simulatorEnabled &&
      selectedOption.accessType === "paid" &&
      selectedTourPurchased &&
      !selectedTourCompleted
    ) {
      void updatePaidTourLifecycle(
        "start"
      ).catch(() => undefined);
    }

    if (!simulatorEnabled) {
      void recordTourAnalyticsEvent(createClient(), {
        eventType: "tour_started",
        experienceId: experience.id,
        journeyId: analyticsJourneyId,
      }).catch(() => undefined);
    }

    setDiagnosticEvents([
      {
        at: new Date().toISOString(),
        type: "journey_started",
        detail: `Journey started in ${directionMode} direction mode.`,
        source: simulatorEnabled ? "simulator" : "gps",
        journeyProgress: 0,
      },
    ]);
    setSimulatorProgress(0);
    setWatching(!simulatorEnabled);
    setScreen("journey");
    void playBrandAnnouncement("welcome");
  }

  function continueFromHandover() {
    if (
      activeJourneyStructure !==
        "multi_leg" ||
      !nextJourneyLeg
    ) {
      return;
    }

    const audio =
      audioElementRef.current;

    audio?.pause();

    if (audio) {
      audio.currentTime = 0;
    }

    setActiveJourneyLegId(
      nextJourneyLeg.id
    );

    setDirection(
      nextJourneyLeg.journeyDirection
    );

    setActiveJourneyDirection(
      nextJourneyLeg.journeyDirection
    );

    setDirectionMode("manual");
    setDirectionDetecting(false);

    setJourneyProgress(0);
    setSimulatorProgress(0);

    setTriggeredStoryIds([]);
    setAudioQueueIds([]);
    setActiveAudioStoryId(null);
    setAudioPlaybackStatus("idle");
    setBrandAnnouncement(null);

    journeyStartedNearOrigin.current =
      false;
    detectionStartProgress.current =
      null;
    previousRouteStatus.current =
      null;
    previousStoryId.current =
      null;
    previousMotionReadingRef.current =
      null;
    resumeAfterTimestampRef.current =
      null;
    finalAnnouncementPlayedRef.current =
      false;

    setJourneyPhase("travelling");
    setWatching(!simulatorEnabled);
  }

  function pauseJourneyAudioForNavigation() {
    const audio = audioElementRef.current;
    audio?.pause();

    if (activeAudioStoryId) {
      setAudioQueueIds((current) => [
        activeAudioStoryId,
        ...current.filter(
          (storyId) => storyId !== activeAudioStoryId
        ),
      ]);
    }

    setActiveAudioStoryId(null);
    setAudioPlaybackStatus("idle");
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

    setWatching(!simulatorEnabled);
    setScreen("journey");
    recordDiagnostic(
      "journey_resumed",
      "Journey resumed from its saved progress.",
      { journeyProgress }
    );
  }

  function goToExperienceOverview() {
    pauseJourneyAudioForNavigation();
    setWatching(false);
    setScreen("overview");
  }

  function goHome() {
    pauseJourneyAudioForNavigation();
    setWatching(false);
    setScreen("home");
  }

  function simulateJourneyInterruption() {
    recordDiagnostic(
      "journey_interrupted",
      "Test interruption: journey player closed while progress was retained.",
      {
        journeyProgress,
        routeProgress: routeMatch?.routeProgress,
        distanceFromRouteMetres:
          routeMatch?.distanceFromRouteMetres,
      }
    );
    pauseJourneyAudioForNavigation();
    setWatching(false);
    setTesterOpen(false);
    setScreen("home");
  }

  function previewCompletionScreen() {
    pauseJourneyAudioForNavigation();
    setWatching(false);
    setSimulatorEnabled(false);
    completionOccurredThisSessionRef.current = false;
    endAnnouncementPlayedRef.current = true;
    setCompletionPreviewEnabled(true);
    setJourneyProgress(100);
    setJourneyCompleted(true);
    setScreen("journey");

    recordDiagnostic(
      "simulator_changed",
      "Completion screen preview opened. No purchase, lifecycle or analytics data was changed.",
      {
        source: "simulator",
        journeyProgress: 100,
      }
    );
  }

  function exitCompletionPreview() {
    setCompletionPreviewEnabled(false);
    setJourneyCompleted(false);
    setJourneyProgress(0);
    setScreen("overview");
  }

  function setSimulatorActive(enabled: boolean) {
    setSimulatorEnabled(enabled);
    setWatching(!enabled);
    setError("");
    previousRouteStatus.current = null;
    if (enabled && directionMode === "automatic") {
      setDirectionDetecting(false);
      setActiveJourneyDirection(direction);
      detectionStartProgress.current = null;
      recordDiagnostic(
        "direction_detected",
        `Simulator confirmed the ${direction} direction.`,
        { source: "simulator" }
      );
    }
    recordDiagnostic(
      "simulator_changed",
      enabled
        ? "Route simulator enabled. Live GPS paused."
        : "Route simulator disabled. Live GPS resumed.",
      { source: enabled ? "simulator" : "gps" }
    );
  }

  function changeSimulatorCondition(
    condition: SimulatorCondition
  ) {
    setSimulatorCondition(condition);
    previousRouteStatus.current = null;
    recordDiagnostic(
      "simulator_changed",
      `Simulated signal changed to ${condition}.`
    );
  }

  function resetJourneyTest() {
    const audio = audioElementRef.current;

    audio?.pause();

    if (audio) {
      audio.currentTime = 0;
      audio.removeAttribute("src");
      audio.load();
    }

    localStorage.removeItem(
      "between-stops-active-journey"
    );

    setActiveJourneyExperienceId(null);
    setActiveJourneyStructure("single");
    setJourneyPhase("travelling");
    setActiveJourneyLegId(null);
    setJourneyProgress(0);
    setJourneyCompleted(false);
    setTriggeredStoryIds([]);
    setAudioQueueIds([]);
    setActiveAudioStoryId(null);
    setAudioPlaybackStatus("idle");
    setBrandAnnouncement(null);

    setSimulatorProgress(0);
    setSimulatorCondition("good");

    journeyStartedNearOrigin.current = false;
    detectionStartProgress.current = null;
    previousRouteStatus.current = null;
    previousStoryId.current = null;
    previousMotionReadingRef.current = null;
    resumeAfterTimestampRef.current = null;

    finalAnnouncementPlayedRef.current = false;
    endAnnouncementPlayedRef.current = false;

    analyticsJourneyIdRef.current = null;

    setDiagnosticEvents([]);
    setError("");

    recordDiagnostic(
      "progress_reset",
      "Test journey returned to the start.",
      {
        journeyProgress: 0,
      }
    );

    setScreen("overview");
  }

  function toggleStoryAudio(storyId: string) {
    const audio = audioElementRef.current;

    if (activeAudioStoryId === storyId) {
      if (audioPlaybackStatus === "playing") {
        audio?.pause();
        setAudioPlaybackStatus("paused");
        recordDiagnostic(
          "audio_paused",
          `Passenger paused audio: ${activeAudioStory?.title ?? storyId}.`,
          { journeyProgress }
        );
        return;
      }

      if (audio) {
        void audio.play()
          .then(() => {
            setAudioPlaybackStatus("playing");
            recordDiagnostic(
              "audio_started",
              `Passenger resumed audio: ${activeAudioStory?.title ?? storyId}.`,
              { journeyProgress }
            );
          })
          .catch(() => {
            setAudioPlaybackStatus("error");
            recordDiagnostic(
              "media_error",
              `Audio could not resume: ${activeAudioStory?.title ?? storyId}.`,
              { journeyProgress }
            );
          });
      }
      return;
    }

    if (activeAudioStoryId) {
      if (!audioQueueIds.includes(storyId)) {
        setAudioQueueIds((current) => [
          ...current,
          storyId,
        ]);
        recordDiagnostic(
          "audio_queued",
          `Passenger queued audio without interrupting the current Story.`,
          { journeyProgress }
        );
      }
      return;
    }

    setAudioQueueIds((current) =>
      current.filter((item) => item !== storyId)
    );
    void playStoryAudio(storyId, true);
  }

  function toggleTranscripts() {
    setShowTranscripts((current) => {
      const updated = !current;
      localStorage.setItem(
        "between-stops-show-transcripts",
        String(updated)
      );
      return updated;
    });
  }

  function downloadDiagnosticReport() {
    const report = {
      product: "Beyond the Stops",
      reportVersion: 1,
      generatedAt: new Date().toISOString(),
      tour: {
        id: experience.id,
        title: experience.title,
        transport: route.mode,
        direction,
        directionMode,
      },
      simulator: {
        enabled: simulatorEnabled,
        selectedProgress: simulatorProgress,
        condition: simulatorCondition,
      },
      latestReadings: routeMatch
        ? {
            routeStatus: routeMatch.status,
            routeProgress: routeMatch.routeProgress,
            journeyProgress,
            accuracyMetres: diagnosticAccuracy,
            distanceFromRouteMetres:
              routeMatch.distanceFromRouteMetres,
          }
        : null,
      audio: {
        status: audioPlaybackStatus,
        activeStoryId: activeAudioStoryId,
        queuedStoryIds: audioQueueIds,
        triggeredStoryIds,
      },
      browser: navigator.userAgent,
      events: diagnosticEvents,
    };

    const blob = new Blob(
      [JSON.stringify(report, null, 2)],
      { type: "application/json" }
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const safeTourName = experience.title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    anchor.href = url;
    anchor.download = `between-stops-test-${safeTourName || "journey"}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(
      () => URL.revokeObjectURL(url),
      1000
    );
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

  /* Sync global feedback visibility with passenger screen. */
  useEffect(() => {
    if (screen === "overview") {
      document.body.dataset.hidePlatformFeedback = "true";
    } else {
      delete document.body.dataset.hidePlatformFeedback;
    }

    return () => {
      delete document.body.dataset.hidePlatformFeedback;
    };
  }, [screen]);

  function renderTourCard(
    option: PublicExperienceOption
  ) {
    const isFavourite =
      favouriteIds.has(
        option.experience.id
      );

    const tourDistance =
      getTourDistanceKm(option);

    return (
      <article
        className="experienceCard"
        key={option.experience.id}
      >
        <div className="experienceImageWrap">
        <Link
          className="experienceCardMain"
          href={`/tours?tour=${option.experience.id}`}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }

            event.preventDefault();
            setSelectedExperienceId(option.experience.id);
            setDescriptionExpanded(false);
            setCreatorBioExpanded(false);
            setScreen("overview");
            window.history.pushState(
              {},
              "",
              `/tours?tour=${option.experience.id}`
            );
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
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

            <div className="imageJourneyMeta">
              <span>{option.experience.durationMinutes} mins</span>
              <span aria-hidden="true">·</span>
              <span>{formatTourDistance(tourDistance)}</span>
            </div>

            <div className="priceBadge">
              {option.accessType === "free"
                ? "Free"
                : completedPurchasedExperienceIds.has(
                    option.experience.id
                  )
                  ? "Completed ✓"
                  : purchasedExperienceIds.has(
                      option.experience.id
                    )
                    ? "Purchased ✓"
                    : option.pricePence !== undefined
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
            toggleFavourite(option.experience.id)
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
        </div>

        <Link
          className="experienceCardMain"
          href={`/tours?tour=${option.experience.id}`}
          onClick={(event) => {
            if (
              event.button !== 0 ||
              event.metaKey ||
              event.ctrlKey ||
              event.shiftKey ||
              event.altKey
            ) {
              return;
            }
            event.preventDefault();
            setSelectedExperienceId(option.experience.id);
            setDescriptionExpanded(false);
            setCreatorBioExpanded(false);
            setScreen("overview");
            window.history.pushState({}, "", `/tours?tour=${option.experience.id}`);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        >
          <div className="experienceBody">
            <h3>{option.experience.title}</h3>

            {option.creator && (
              <div className="cardCreator">
                {option.creator.avatarUrl && (
                  <img
                    src={option.creator.avatarUrl}
                    alt=""
                  />
                )}
                <span>By {option.creator.displayName}</span>
              </div>
            )}

            <p className="tourCardSummary">
              {option.summary}
            </p>

            <div className="cardFooter">
              {(option.reviewCount ?? 0) > 0 && (
                <span className="ratingMeta">
                  ★ {option.averageRating?.toFixed(1)} ·{" "}
                  {option.reviewCount}{" "}
                  {option.reviewCount === 1 ? "rating" : "ratings"}
                </span>
              )}
              <strong>Explore</strong>
            </div>
          </div>
        </Link>

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
              src="/branding/between-stops-logo-light.png?v=1"
              alt=""
            />
          </div>

          <span>Beyond the Stops</span>

          <div className="passengerHeaderActions">
            <a className="homeBubbleButton" href="/guides">
              For guides
            </a>
          </div>
        </header>

        <section className="hero">
          <h1>
            Turn ordinary journeys into
            extraordinary experiences.
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
                  Resume journey
                </div>
              </div>
            </button>
          </section>
        )}

        {completedOptions.length > 0 && (
          <section className="completedJourneysPanel">
            <button
              type="button"
              className="completedJourneysToggle"
              onClick={() =>
                setCompletedJourneysOpen(
                  (current) => !current
                )
              }
              aria-expanded={
                completedJourneysOpen
              }
            >
              <span>
                <strong>
                  Completed journeys
                </strong>
                <small>
                  {completedOptions.length} on this device
                </small>
              </span>

              <span aria-hidden="true">
                {completedJourneysOpen
                  ? "−"
                  : "+"}
              </span>
            </button>

            {completedJourneysOpen && (
              <div className="completedJourneysList">
                {completedOptions.map(
                  renderTourCard
                )}
              </div>
            )}
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

            </div>

            <div className="experienceList">
              {featuredOptions.map(
                renderTourCard
              )}
            </div>
          </section>
        )}

        {availableExperienceOptions.length > 0 && (
          <section className="discoverSection catalogueSection">
            <div className="sectionHeading">
              <div>
                <p className="kicker">
                  EDINBURGH
                </p>

                <h2>
                  {location
                    ? "Journeys near you"
                    : "Explore all journeys"}
                </h2>
              </div>

            </div>

            <div className="experienceList">
              {nearbyOptions.map(
                renderTourCard
              )}
            </div>
          </section>
        )}

        <footer className="passengerFooter">
          <strong>Beyond the Stops</strong>
          <span>There’s more to the journey.</span>
          <a href="/guides">For guides</a>
        </footer>
      </main>
    );
  }

  async function shareExperience() {
    const shareUrl =
      selectedOption.countrySlug &&
      selectedOption.citySlug &&
      selectedOption.slug
        ? `https://www.beyondthestops.com/${selectedOption.countrySlug}/${selectedOption.citySlug}/experiences/${selectedOption.slug}`
        : `https://www.beyondthestops.com/tours/${selectedOption.slug}`;

    try {
      if (navigator.share) {
        await navigator.share({
          title: experience.title,
          text: selectedOption.summary,
          url: shareUrl,
        });
        return;
      }

      await navigator.clipboard.writeText(
        shareUrl
      );

      setShareMessage("Link copied");

      window.setTimeout(() => {
        setShareMessage("");
      }, 2200);
    } catch (shareError) {
      if (
        shareError instanceof DOMException &&
        shareError.name === "AbortError"
      ) {
        return;
      }

      try {
        await navigator.clipboard.writeText(
          shareUrl
        );

        setShareMessage("Link copied");

        window.setTimeout(() => {
          setShareMessage("");
        }, 2200);
      } catch {
        setShareMessage(
          "Could not copy link"
        );
      }
    }
  }

  /*
    EXPERIENCE OVERVIEW
  */

  if (screen === "overview") {

    const overviewDirectionAvailability =
      selectedOption.journeyDirectionAvailability ?? "either";

    const closestJourneyStart = (() => {
      if (overviewDirectionAvailability === "forward") {
        return {
          label: experience.startLabel,
          coordinates: selectedOption.startCoordinates,
        };
      }

      if (overviewDirectionAvailability === "reverse") {
        return {
          label: experience.endLabel,
          coordinates: selectedOption.endCoordinates,
        };
      }

      if (!location) {
        return null;
      }

      const passengerCoordinates: [number, number] = [
        location.longitude,
        location.latitude,
      ];

      const distanceToStart = getDistanceKilometres(
        passengerCoordinates,
        selectedOption.startCoordinates
      );

      const distanceToEnd = getDistanceKilometres(
        passengerCoordinates,
        selectedOption.endCoordinates
      );

      return distanceToStart <= distanceToEnd
        ? {
            label: experience.startLabel,
            coordinates: selectedOption.startCoordinates,
          }
        : {
            label: experience.endLabel,
            coordinates: selectedOption.endCoordinates,
          };
    })();

    return (
      <main className="shell">
        <header className="topBar">
          <span className="miniBrand">
            <img
              src="/branding/between-stops-logo-light.png?v=1"
              alt=""
            />
            <span>Beyond the Stops</span>
          </span>

          <button
            className="textButton homeBubbleButton"
            onClick={goHome}
          >
            All journeys
          </button>
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

          <div className="overviewShareAction">
            <button
              type="button"
              onClick={() => {
                void shareExperience();
              }}
            >
              Share experience
            </button>

            {shareMessage && (
              <span>
                {shareMessage}
              </span>
            )}
          </div>

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
            {(selectedOption.reviewCount ?? 0) > 0 && (
              <span className="ratingMeta">
                ★ {selectedOption.averageRating?.toFixed(1)} ·{" "}
                {selectedOption.reviewCount}{" "}
                {selectedOption.reviewCount === 1 ? "rating" : "ratings"}
              </span>
            )}

            <span>
              About{" "}
              {experience.durationMinutes} mins
            </span>

            <span>
              {experience.stories.length} stories
            </span>

            {getTranscriptAvailability(
              experience.stories
            ) !== "none" && (
              <span>
                {getTranscriptAvailability(
                  experience.stories
                ) === "full"
                  ? "Full transcript"
                  : "Some transcripts"}
              </span>
            )}

            <span>
              {formatTourDistance(
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
                  {(selectedOption.journeyDirectionAvailability ??
                    "either") === "either"
                    ? "Automatic"
                    : "Fixed"}
                </span>
              </div>
              <span
                className="automaticDirectionStatus"
                aria-hidden="true"
              >
                {(selectedOption.journeyDirectionAvailability ??
                  "either") === "either"
                  ? "↔"
                  : "→"}
              </span>
            </div>
            <p className="automaticDirectionRoute">
              {(selectedOption.journeyDirectionAvailability ??
                "either") === "reverse" ? (
                <>
                  <span>{experience.endLabel}</span>
                  <strong aria-label="one direction">→</strong>
                  <span>{experience.startLabel}</span>
                </>
              ) : (
                <>
                  <span>{experience.startLabel}</span>
                  <strong
                    aria-label={
                      (selectedOption.journeyDirectionAvailability ??
                        "either") === "either"
                        ? "both directions"
                        : "one direction"
                    }
                  >
                    {(selectedOption.journeyDirectionAvailability ??
                      "either") === "either"
                      ? "⇄"
                      : "→"}
                  </strong>
                  <span>{experience.endLabel}</span>
                </>
              )}
            </p>
            <p className="automaticDirectionNote">
              {(selectedOption.journeyDirectionAvailability ??
                "either") === "either"
                ? "We'll detect which way you're travelling when the journey starts."
                : "This experience runs in this direction only."}
            </p>
          </div>

          <div className="startDirectionsCard">
            <div>
              <strong>
                {overviewDirectionAvailability === "either"
                  ? "Get to the closest start"
                  : "Get to the start"}
              </strong>
              <p>
                {overviewDirectionAvailability === "either"
                  ? closestJourneyStart
                    ? `${closestJourneyStart.label} is the closest place to begin from your current location.`
                    : "Allow location on the Journeys page and we will show the closest place to begin."
                  : "Open directions to the stop where this journey begins."}
              </p>
            </div>

            <div className="startDirectionActions">
              {closestJourneyStart ? (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${closestJourneyStart.coordinates[1]},${closestJourneyStart.coordinates[0]}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Directions to {closestJourneyStart.label}
                </a>
              ) : (
                <span className="startDirectionLocationNotice">
                  Location needed
                </span>
              )}
            </div>
          </div>

          <div className="offlineDownloadCard">
            <div className="offlineDownloadHeading">
              <span aria-hidden="true">↓</span>
              <div>
                <strong>
                  {selectedOfflineRecord
                    ? "Saved for offline use"
                    : "Download this experience"}
                </strong>
                <p>
                  {selectedOfflineRecord
                    ? `Saved ${new Date(selectedOfflineRecord.downloadedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}. Audio and images are available without mobile data.`
                    : `Save the audio and images before you travel. ${formatDownloadSize(selectedOption.downloadSizeBytes)}.`}
                </p>
              </div>
            </div>

            {downloadProgress ? (
              <div className="offlineDownloadProgress" role="status">
                <span>
                  {downloadProgress.total > 0
                    ? `Saving ${downloadProgress.completed} of ${downloadProgress.total} files…`
                    : "Preparing download…"}
                </span>
                <progress
                  max={Math.max(downloadProgress.total, 1)}
                  value={downloadProgress.completed}
                />
              </div>
            ) : (
              <div className="offlineDownloadActions">
                <button
                  className="offlineDownloadButton"
                  onClick={() => void downloadSelectedTour()}
                >
                  {selectedOfflineRecord
                    ? "Download updated copy"
                    : "Download for offline use"}
                </button>

                {selectedOfflineRecord && (
                  <button
                    className="offlineRemoveButton"
                    onClick={() => void removeSelectedOfflineTour()}
                  >
                    Remove download
                  </button>
                )}
              </div>
            )}

            {downloadError && (
              <p className="offlineDownloadError">{downloadError}</p>
            )}
          </div>
        </section>

        {((selectedOption.reviewCount ?? 0) > 0 ||
          publicPassengerReviews.length > 0) && (
          <section className="publicReviewsSection">
            <div className="publicReviewsHeading">
              <div>
                <p className="kicker">PASSENGER REVIEWS</p>
                <h2>What passengers thought</h2>
              </div>

              {(selectedOption.reviewCount ?? 0) > 0 && (
                <div className="publicRatingSummary">
                  <strong>{selectedOption.averageRating?.toFixed(1)}</strong>
                  <span>★★★★★</span>
                  <small>
                    {selectedOption.reviewCount}{" "}
                    {selectedOption.reviewCount === 1 ? "rating" : "ratings"}
                  </small>
                </div>
              )}
            </div>

            {publicPassengerReviews.length > 0 ? (
              <div className="publicReviewCards">
                {publicPassengerReviews.map((review) => (
                  <article key={review.id} className="publicReviewCard">
                    <span aria-label={`${review.rating} out of 5 stars`}>
                      {"★".repeat(review.rating)}
                      <i>{"★".repeat(5 - review.rating)}</i>
                    </span>
                    <p>“{review.reviewText}”</p>
                    <small>
                      Passenger ·{" "}
                      {new Date(review.createdAt).toLocaleDateString(
                        "en-GB",
                        { month: "short", year: "numeric" }
                      )}
                    </small>
                  </article>
                ))}
              </div>
            ) : !publicReviewsLoading ? (
              <p className="ratingsOnlyNotice">
                Written passenger reviews will appear here after approval.
              </p>
            ) : null}
          </section>
        )}

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
          {selectedOption.accessType === "paid" &&
          selectedTourCompleted ? (
            <button
              className="primaryButton"
              disabled
            >
              Completed ✓
            </button>
          ) : selectedJourneyIsActive ? (
            <button
              className="primaryButton"
              onClick={resumeExperience}
            >
              Resume experience
            </button>
          ) : selectedOption.accessType === "paid" &&
            !selectedTourPurchased ? (
            <button
              className="primaryButton"
              disabled={checkoutLoading}
              onClick={() =>
                passengerSignedIn
                  ? void buySelectedTour()
                  : signInToBuy()
              }
            >
              {checkoutLoading
                ? "Opening checkout…"
                : `${passengerSignedIn ? "Buy experience" : "Sign in to buy"} · ${
                    selectedOption.pricePence !== undefined
                      ? new Intl.NumberFormat(
                          "en-GB",
                          {
                            style: "currency",
                            currency: selectedOption.currency,
                          }
                        ).format(
                          selectedOption.pricePence / 100
                        )
                      : "Paid"
                  }`}
            </button>
          ) : (
            <button
              className="primaryButton"
              onClick={prepareExperience}
            >
              Start experience
            </button>
          )}

          {checkoutError && (
            <p className="errorNotice">
              {checkoutError}
            </p>
          )}

          <p>
            {selectedOption.accessType === "paid" &&
            selectedTourCompleted
              ? "You have completed this paid experience."
              : selectedOption.accessType === "paid" &&
                selectedTourPurchased
                ? selectedTourStarted
                  ? "Paid ✓ · In progress. You can resume until the journey is completed."
                  : "Paid ✓ · This experience is ready to start."
                : selectedOption.accessType === "paid"
                  ? "Purchase once to take this tour. Your public transport fare is separate."
                  : "Location access keeps the experience in sync. Download the tour before travelling to avoid using mobile data for audio and images."}
          </p>
        </div>
      </main>
    );
  }

  if (screen === "preflight") {
    return (
      <main className="shell preflightShell">
        <header className="topBar">
          <span className="miniBrand">
            <img
              src="/branding/between-stops-logo-light.png?v=1"
              alt=""
            />
            <span>Beyond the Stops</span>
          </span>

          <button
            className="textButton homeBubbleButton"
            onClick={() => setScreen("overview")}
          >
            ← Experience
          </button>
        </header>

        <section className="preflightIntro">
          <p className="kicker">BEFORE YOU SET OFF</p>
          <h1>Ready for the journey?</h1>
          <p>
            A couple of quick checks help each Story arrive at the right moment.
          </p>
        </section>

        <section className="preflightChecks">
          <article className="preflightCard">
            <span className="preflightIcon">🎧</span>
            <div>
              <h2>Use headphones</h2>
              <p>
                You will hear the experience clearly without disturbing other passengers. Keep announcements audible and stay aware of your surroundings.
              </p>
              <button
                className="preflightAction"
                onClick={() => void testJourneyAudio()}
                disabled={audioTestStatus === "testing"}
              >
                {audioTestStatus === "testing"
                  ? "Playing test…"
                  : audioTestStatus === "ready"
                    ? "✓ Audio working"
                    : audioTestStatus === "error"
                      ? "Try audio again"
                      : "Test audio"}
              </button>
            </div>
          </article>

          <article className="preflightCard">
            <span className="preflightIcon">⌖</span>
            <div>
              <h2>Allow location</h2>
              <p>
                Beyond the Stops uses your position to match the route and trigger Stories. Your journey progress stays on this device.
              </p>
              <button
                className="preflightAction"
                onClick={requestPreflightLocation}
                disabled={locationCheckStatus === "requesting"}
              >
                {locationCheckStatus === "requesting"
                  ? "Checking location…"
                  : locationCheckStatus === "granted"
                    ? "✓ Location ready"
                    : locationCheckStatus === "denied"
                      ? "Try location again"
                      : "Allow location"}
              </button>
            </div>
          </article>

          <article className="preflightCard fareCard">
            <span className="preflightIcon">£</span>
            <div>
              <h2>Your fare is separate</h2>
              <p>
                The {selectedOption.transportLabel.toLowerCase()} fare is not included in the price of this experience. You need a valid ticket or must pay the transport provider separately.
              </p>
            </div>
          </article>

          <article className="preflightCard dataCard">
            <span className="preflightIcon">↓</span>
            <div>
              <h2>
                {selectedOfflineRecord
                  ? "Saved for offline use"
                  : "Mobile data"}
              </h2>
              <p>
                {selectedOfflineRecord
                  ? "This tour's audio and images are saved on this device. Keep this page open and allow location during the journey."
                  : "Audio and images will be streamed and may use mobile data. Go back to the tour screen to download them before setting off."}
              </p>
            </div>
          </article>

          <article className="preflightCard keepOpenCard">
            <span className="preflightIcon">▣</span>
            <div>
              <h2>Keep Beyond the Stops open</h2>
              <p>
                Keep this page on screen and your phone unlocked throughout the journey. Switching apps or locking your phone can pause location and audio. If that happens, passed Stories will be skipped rather than played as a backlog.
              </p>
            </div>
          </article>
        </section>

        {error && (
          <div className="errorNotice">{error}</div>
        )}

        <div className="stickyAction preflightStart">
          <button
            className="primaryButton"
            onClick={beginExperience}
          >
            I&apos;m ready — start experience
          </button>
          <p>
            If automatic playback is blocked, a clear tap-to-play button will appear.
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
              src="/branding/between-stops-logo-light.png?v=1"
              alt=""
            />
            <span>Beyond the Stops</span>
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
            className="textButton homeBubbleButton"
            onClick={goToExperienceOverview}
          >
            Experience
          </button>

          <button
            className="textButton homeBubbleButton"
            onClick={goHome}
          >
            Journeys
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

      {journeyPhase ===
        "locating" && (
        <div className="directionNotice">
          <span className="directionPulse" />
          <div>
            <strong>
              Finding your place on the loop
            </strong>
            <span>
              You can join this experience
              around the circuit. Keep this
              page open and we&apos;ll identify
              the route you&apos;re travelling
              on.
            </span>
          </div>
        </div>
      )}

      {journeyPhase !== "locating" &&
        directionDetecting && (
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

      {journeyPhase ===
        "travelling" &&
        routeMatch?.status ===
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

      {!journeyCompleted &&
        journeyPhase === "handover" &&
        activeJourneyLeg &&
        nextJourneyLeg && (
        <section className="liveJourneyTimeline">
          <div className="liveJourneyHeading">
            <div>
              <p className="kicker">
                {activeHandover?.handoverType ===
                  "explore"
                  ? "EXPLORE & CONTINUE"
                  : "CHANGE HERE"}
              </p>

              <strong>
                {activeHandover?.title ||
                  `Continue from ${activeJourneyLeg.endLabel}`}
              </strong>
            </div>

            <span>✓</span>
          </div>

          <div className="routeNotice">
            <strong>
              Next: {nextJourneyLeg.startLabel}
              {" → "}
              {nextJourneyLeg.endLabel}
            </strong>

            <span>
              {activeHandover?.instructions ||
                "Follow the handover instructions and continue when you are ready."}
            </span>
          </div>

          {activeHandover?.handoverType ===
            "explore" &&
            activeHandover.explorationText && (
            <div className="routeNotice">
              <strong>
                Take some time here
              </strong>

              <span>
                {
                  activeHandover.explorationText
                }
              </span>
            </div>
          )}

          {(activeHandover?.walkMinutes !==
            undefined ||
            activeHandover?.stopReference ||
            activeHandover?.towardsLabel) && (
            <div className="routeNotice">
              <strong>
                Useful details
              </strong>

              <span>
                {[
                  activeHandover
                    ?.walkMinutes !==
                  undefined
                    ? `${activeHandover.walkMinutes} min walk`
                    : "",
                  activeHandover
                    ?.stopReference
                    ? activeHandover.stopReference
                    : "",
                  activeHandover
                    ?.towardsLabel
                    ? activeHandover.towardsLabel
                    : "",
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </div>
          )}

          <button
            type="button"
            className="primaryButton"
            onClick={
              continueFromHandover
            }
          >
            I&apos;m ready — continue
          </button>

          <small className="journeyScreenStatus">
            Continue once you are ready
            for the next part of the
            experience.
          </small>
        </section>
      )}

      {!journeyCompleted &&
        journeyPhase === "travelling" && (
        <section className="liveJourneyTimeline">
          <div className="liveJourneyHeading">
            <div>
              <p className="kicker">YOUR JOURNEY</p>
              <strong>{directionStart} ⇄ {directionEnd}</strong>
            </div>
            <span>{Math.round(journeyProgress)}%</span>
          </div>

          <div className="liveJourneyTrack" aria-hidden="true">
            <i style={{ width: `${Math.min(100, journeyProgress)}%` }} />
          </div>

          <ol>
            {journeyStories.map((story, storyIndex) => {
              const status =
                storyIndex < currentStoryIndex
                  ? "passed"
                  : storyIndex === currentStoryIndex
                    ? "current"
                    : "upcoming";

              return (
                <li className={status} key={story.id}>
                  <span>{status === "passed" ? "✓" : storyIndex + 1}</span>
                  <div>
                    <strong>{story.title}</strong>
                    <small>
                      {status === "passed"
                        ? "Passed"
                        : status === "current"
                          ? activeAudioStoryId === story.id
                            ? "Playing now"
                            : "Current Story"
                          : "Coming up"}
                    </small>
                  </div>
                </li>
              );
            })}
          </ol>

          <small className="journeyScreenStatus">
            {wakeLockActive
              ? "Screen kept awake while this page remains visible"
              : "Keep this page visible and your phone unlocked"}
          </small>
        </section>
      )}

      {brandAnnouncement && (
        <div className="brandAnnouncementBanner" role="status">
          <span>Beyond the Stops</span>
          <strong>
            {brandAnnouncement === "welcome"
              ? "Welcome and journey guidance"
              : "Your stop is next"}
          </strong>
        </div>
      )}

      {journeyCompleted && (
        <>
          {completionPreviewEnabled && (
            <section className="completionPreviewBanner">
              <div>
                <strong>Completion preview</strong>
                <span>
                  Test only · no payment, completion or analytics data is being recorded.
                </span>
              </div>
              <button
                type="button"
                onClick={exitCompletionPreview}
              >
                Exit preview
              </button>
            </section>
          )}

          <section className="journeyCompleteCard">
            <span>✓</span>
            <p className="kicker">JOURNEY COMPLETE</p>
            <h2>You made it to {directionEnd}.</h2>
            <p>
              This completion has been saved on this device.
            </p>
            <button onClick={goToExperienceOverview}>
              Experience details
            </button>
          </section>

          <section className="completionReviewCard">
            {submittedReviewExperienceIds.has(experience.id) ? (
              <div className="reviewThankYou">
                <span>★</span>
                <div>
                  <p className="kicker">THANK YOU</p>
                  <h2>You&apos;ve rated this tour.</h2>
                  <p>
                    {reviewMessage ||
                      "Your feedback helps other passengers choose their journey."}
                  </p>
                </div>
              </div>
            ) : (
              <>
                <p className="kicker">RATE THIS EXPERIENCE</p>
                <h2>How was the experience?</h2>

                <div
                  className="completionStars"
                  role="radiogroup"
                  aria-label="Tour rating"
                >
                  {[1, 2, 3, 4, 5].map((rating) => (
                    <button
                      key={rating}
                      type="button"
                      role="radio"
                      aria-checked={reviewRating === rating}
                      aria-label={`${rating} out of 5 stars`}
                      className={rating <= reviewRating ? "selected" : ""}
                      onClick={() => {
                        setReviewRating(rating);
                        setReviewMessage("");
                      }}
                    >
                      ★
                    </button>
                  ))}
                </div>

                <label htmlFor="completed-tour-review">
                  Add a short review <span>Optional</span>
                </label>
                <textarea
                  id="completed-tour-review"
                  value={reviewText}
                  onChange={(event) =>
                    setReviewText(event.target.value.slice(0, 500))
                  }
                  rows={4}
                  maxLength={500}
                  placeholder="What did you enjoy or find useful?"
                />
                <small>{reviewText.length}/500</small>

                <button
                  className="submitTourReviewButton"
                  disabled={reviewSubmitting || reviewRating === 0}
                  onClick={() => void submitCompletedTourReview()}
                >
                  {reviewSubmitting ? "Saving…" : "Submit rating"}
                </button>

                {reviewMessage && (
                  <p className="completionReviewMessage">{reviewMessage}</p>
                )}
              </>
            )}
          </section>

          {(!simulatorEnabled || completionPreviewEnabled) && (
            <section className="completionTipCard">
              <p className="kicker">
                SUPPORT YOUR GUIDE
              </p>

              <h2>
                Enjoyed the tour?
              </h2>

              <p>
                You can leave an optional tip
                for your guide. Beyond the Stops
                takes no commission from tips.
              </p>

              <div className="tipChoices">
                {[200, 500, 1000].map(
                  (amount) => (
                    <button
                      key={amount}
                      type="button"
                      className={
                        selectedTipPence === amount
                          ? "selected"
                          : ""
                      }
                      disabled={tipLoading}
                      onClick={() => {
                        setSelectedTipPence(
                          amount
                        );
                        setCustomTipValue("");
                        setTipMessage("");
                      }}
                    >
                      £{amount / 100}
                    </button>
                  )
                )}

                <button
                  type="button"
                  className={
                    selectedTipPence === -1
                      ? "selected"
                      : ""
                  }
                  disabled={tipLoading}
                  onClick={() => {
                    setSelectedTipPence(-1);
                    setTipMessage("");
                  }}
                >
                  Other
                </button>
              </div>

              {selectedTipPence === -1 && (
                <label className="customTipField">
                  <span>
                    Tip amount
                  </span>
                  <div>
                    <span>£</span>
                    <input
                      type="number"
                      min="1"
                      max="500"
                      step="0.01"
                      inputMode="decimal"
                      value={customTipValue}
                      onChange={(event) =>
                        setCustomTipValue(
                          event.target.value
                        )
                      }
                      placeholder="5.00"
                    />
                  </div>
                </label>
              )}

              <button
                className="submitTipButton"
                type="button"
                disabled={
                  tipLoading ||
                  selectedTipPence === null ||
                  completionPreviewEnabled
                }
                onClick={() => {
                  const amount =
                    selectedTipPence === -1
                      ? Math.round(
                          Number(
                            customTipValue
                          ) * 100
                        )
                      : selectedTipPence;

                  if (amount === null) {
                    return;
                  }

                  void startTipCheckout(
                    amount
                  );
                }}
              >
                {completionPreviewEnabled
                  ? "Tip checkout disabled in preview"
                  : tipLoading
                    ? "Opening Stripe…"
                    : "Leave a tip"}
              </button>

              {tipMessage && (
                <p className="tipMessage">
                  {tipMessage}
                </p>
              )}

            </section>
          )}

          {destinationRecommendationsLoading && (
            <p className="destinationRecommendationsLoading">
              Finding things to do here…
            </p>
          )}

          {!destinationRecommendationsLoading &&
            destinationRecommendations.length > 0 && (
            <section className="destinationRecommendations">
              <div className="destinationRecommendationsHeading">
                <p className="kicker">THINGS TO DO HERE</p>
                <h2>Make more of {directionEnd}</h2>
                <p>
                  A few places and ideas selected for this destination.
                </p>
              </div>

              <div className="destinationRecommendationCards">
                {destinationRecommendations.map((recommendation) => {
                  const recordRecommendationClick = () => {
                    if (!simulatorEnabled) {
                      void recordTourAnalyticsEvent(
                        createClient(),
                        {
                          eventType:
                            "recommendation_clicked",
                          experienceId:
                            experience.id,
                          journeyId:
                            analyticsJourneyIdRef.current ??
                            undefined,
                          recommendationId:
                            recommendation.id,
                        }
                      ).catch(() => undefined);
                    }
                  };

                  const mapsUrl =
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                      `${recommendation.title}, ${directionEnd}`
                    )}`;

                  return (
                    <article
                      className="destinationRecommendationCard"
                      key={recommendation.id}
                    >
                      <RecommendationArt
                        category={recommendation.category}
                        imageUrl={recommendation.imageUrl}
                        title={recommendation.title}
                      />

                      <div>
                        <span>
                          {getRecommendationCategoryLabel(
                            recommendation.category
                          )}
                        </span>

                        {recommendation.placementType ===
                          "sponsored" && (
                          <small>Sponsored</small>
                        )}
                      </div>

                      <h3>
                        {recommendation.title}
                      </h3>

                      <p>
                        {recommendation.summary}
                      </p>

                      <div className="recommendationActions">
                        {recommendation.url && (
                          <a
                            href={recommendation.url}
                            target="_blank"
                            rel="noreferrer"
                            onClick={
                              recordRecommendationClick
                            }
                          >
                            Website
                          </a>
                        )}

                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={
                            recordRecommendationClick
                          }
                        >
                          Maps
                        </a>
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          )}
        </>
      )}

      {!journeyCompleted && activeAudioStory && (
        <section
          className={
            audioPlaybackStatus === "blocked"
              ? "journeyAudioBanner blocked"
              : "journeyAudioBanner"
          }
        >
          <div>
            <small>
              {audioPlaybackStatus === "blocked"
                ? "TAP REQUIRED"
                : audioPlaybackStatus === "paused"
                  ? "AUDIO PAUSED"
                  : "NOW PLAYING"}
            </small>
            <strong>{activeAudioStory.title}</strong>
            {audioQueueIds.length > 0 && (
              <span>
                {audioQueueIds.length} next {audioQueueIds.length === 1 ? "Story" : "Stories"} queued
              </span>
            )}
          </div>

          <button
            onClick={() =>
              toggleStoryAudio(activeAudioStory.id)
            }
          >
            {audioPlaybackStatus === "playing"
              ? "Pause"
              : "Play"}
          </button>
        </section>
      )}

      {!journeyCompleted && (
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

            {currentStory.text && (
              <div className="storyTranscript">
                <button
                  onClick={toggleTranscripts}
                  aria-expanded={showTranscripts}
                >
                  {showTranscripts
                    ? "Hide transcript"
                    : "Read transcript"}
                </button>

                {showTranscripts && (
                  <p className="cueCopy">
                    {currentStory.text}
                  </p>
                )}
              </div>
            )}

            {(currentStory.type === "audio" ||
              currentStory.type === "look") && (
              currentStory.audioUrl ? (
                <button
                  className="audioButton"
                  onClick={() =>
                    toggleStoryAudio(currentStory.id)
                  }
                >
                  <span className="playIcon">
                    {activeAudioStoryId === currentStory.id &&
                    audioPlaybackStatus === "playing"
                      ? "Ⅱ"
                      : audioQueueIds.includes(currentStory.id)
                        ? "…"
                        : "▶"}
                  </span>

                  <span>
                    <strong>
                      {activeAudioStoryId === currentStory.id &&
                      audioPlaybackStatus === "playing"
                        ? "Pause narration"
                        : activeAudioStoryId === currentStory.id &&
                            audioPlaybackStatus === "blocked"
                          ? "Tap to play narration"
                          : audioQueueIds.includes(currentStory.id)
                            ? "Narration queued"
                            : "Play narration"}
                    </strong>

                    <small>
                      {audioQueueIds.includes(currentStory.id)
                        ? "It will play after the current Story"
                        : "Guide audio"}
                    </small>
                  </span>
                </button>
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
      )}

      {testerOpen && (
        <section className="testerPanel">
          <div className="testerHeading">
            <div>
              <p className="kicker">
                FIELD TOOLS
              </p>

              <h2>
                Test this journey
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

          <div className="simulatorCard">
            <div className="completionPreviewControl">
              <div>
                <strong>Completion screen</strong>
                <span>
                  Preview review, tipping and destination recommendations without completing a real tour.
                </span>
              </div>

              <button
                type="button"
                onClick={previewCompletionScreen}
              >
                Preview completion
              </button>
            </div>

            <div className="simulatorSwitchRow">
              <div>
                <strong>Route simulator</strong>
                <span>
                  Test indoors without travelling the route.
                </span>
              </div>

              <button
                className={simulatorEnabled ? "simulatorToggle active" : "simulatorToggle"}
                aria-pressed={simulatorEnabled}
                onClick={() =>
                  setSimulatorActive(!simulatorEnabled)
                }
              >
                {simulatorEnabled ? "On" : "Off"}
              </button>
            </div>

            {simulatorEnabled && (
              <>
                <label className="simulatorProgressLabel" htmlFor="route-simulator-progress">
                  <span>Move along journey</span>
                  <strong>{simulatorProgress}%</strong>
                </label>

                <input
                  id="route-simulator-progress"
                  className="simulatorRange"
                  type="range"
                  min="0"
                  max="100"
                  step="1"
                  value={simulatorProgress}
                  onChange={(event) =>
                    setSimulatorProgress(Number(event.target.value))
                  }
                />

                <div className="simulatorEndpoints">
                  <span>{directionStart}</span>
                  <span>{directionEnd}</span>
                </div>

                {journeyStories.length > 0 && (
                  <div className="simulatorTimingList">
                    <div className="simulatorTimingHeading">
                      <span>Story timing</span>
                      <small>Start → subject</small>
                    </div>
                    {journeyStories.map((story) => (
                      <div
                        className="simulatorTimingRow"
                        key={story.id}
                      >
                        <span>{story.title}</span>
                        <strong>
                          {story.triggerJourneyProgress.toFixed(1)}% →{" "}
                          {story.journeyProgress.toFixed(1)}%
                        </strong>
                        <div
                          className="simulatorTimingTrack"
                          aria-label={`Starts at ${story.triggerJourneyProgress.toFixed(1)} per cent; subject at ${story.journeyProgress.toFixed(1)} per cent`}
                        >
                          <i
                            className="triggerPoint"
                            style={{
                              left: `${story.triggerJourneyProgress}%`,
                            }}
                          />
                          <i
                            className="subjectPoint"
                            style={{
                              left: `${story.journeyProgress}%`,
                            }}
                          />
                        </div>
                        <small>
                          {Math.round(story.leadDistanceMetres)}m approach
                          {story.durationIsEstimated
                            ? " · estimated until audio is re-uploaded"
                            : ` · ${Math.round(story.playbackSeconds)} sec`}
                        </small>
                      </div>
                    ))}
                  </div>
                )}

                <p className="simulatorLabel">Simulated signal</p>
                <div className="simulatorConditions">
                  {([
                    ["good", "Good GPS"],
                    ["poor", "Poor GPS"],
                    ["off-route", "Off route"],
                  ] as const).map(([condition, label]) => (
                    <button
                      key={condition}
                      className={simulatorCondition === condition ? "active" : ""}
                      onClick={() => changeSimulatorCondition(condition)}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <p className="testerHelp">
                  Poor GPS and Off route deliberately pause journey progress. Return to Good GPS to continue.
                </p>
              </>
            )}
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
              !routeMatch ||
              simulatorEnabled
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
                  {diagnosticAccuracy !== null
                    ? `±${Math.round(
                        diagnosticAccuracy
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
            onClick={simulateJourneyInterruption}
          >
            Simulate interruption
          </button>

          <p className="testerHelp">
            This returns to Tours without losing progress. Use Resume journey to confirm recovery works.
          </p>

          <button
            className="resetButton secondaryResetButton"
            onClick={resetJourneyTest}
          >
            Reset test tour
          </button>

          <button
            className="reportButton"
            onClick={downloadDiagnosticReport}
            disabled={diagnosticEvents.length === 0}
          >
            Download test report
          </button>

          <p className="testerHelp">
            If something goes wrong, send the downloaded report with a short note about what you expected.
          </p>

          {diagnosticEvents.length > 0 && (
            <div className="diagnosticEvents">
              <p className="kicker">LATEST EVENTS</p>
              {diagnosticEvents.slice(-5).reverse().map((event, index) => (
                <div key={`${event.at}-${index}`}>
                  <strong>{event.type.replaceAll("_", " ")}</strong>
                  <span>{event.detail}</span>
                  <small>{new Date(event.at).toLocaleTimeString("en-GB")}</small>
                </div>
              ))}
            </div>
          )}
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
