"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  Map,
  Marker,
  NavigationControl,
  LngLatBounds,
  setWorkerUrl,
} from "maplibre-gl";

import {
  lineString,
  lineSliceAlong,
  length,
  nearestPointOnLine,
  point,
} from "@turf/turf";

import "maplibre-gl/dist/maplibre-gl.css";
import "./creator.css";

import {
  routeChoices,
} from "@/data/routes/catalogue";

import {
  createClient,
} from "@/lib/supabase/client";

import {
  getStoryTimingWarnings,
} from "@/lib/experience";

import {
  deleteCreatorProject,
  editPausedCreatorProject,
  loadBrowserProjects,
  loadCreatorProfile,
  loadCreatorProjects,
  removeMediaFile,
  pauseCreatorProject,
  retractCreatorProjectReview,
  restorePausedCreatorProject,
  saveCreatorProfile,
  saveCreatorProject,
  submitCreatorProjectForReview,
  uploadProfileAvatar,
  uploadProfileDirectionPrompt,
  uploadStoryMedia,
  uploadTourCover,
  uploadTourGalleryImage,
} from "@/lib/creator-projects";

import type {
  CreatorStory,
  CreatorStoryType,
  CreatorProfile,
  AgeGuidance,
  MediaAttachment,
  ProjectStatus,
  SavedProject,
  SectionMode,
} from "@/lib/creator-projects";

import type {
  Coordinates,
  RouteDefinition,
  RouteStop,
  TransportMode,
  ExperienceDefinition,
} from "@/lib/types";

import {
  TransportIcon,
} from "@/components/transport-icon";

setWorkerUrl(
  "/maplibre/maplibre-gl-worker.mjs"
);

type CreatorStage =
  | "projects"
  | "route"
  | "name"
  | "details"
  | "profile"
  | "studio";

type ProjectStatusFilter =
  | "all"
  | "draft"
  | "review"
  | "changes_requested"
  | "published"
  | "paused"
  | "archived";

function getProjectStatusLabel(
  status: ProjectStatus
) {
  const labels: Record<ProjectStatus, string> = {
    draft: "Draft",
    ready_for_review: "Ready for review",
    submitted: "Awaiting review",
    changes_requested: "Changes requested",
    approved: "Approved",
    published: "Published",
    paused: "Paused",
    archived: "Archived",
  };

  return labels[status];
}

function getActionErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String(error.message);
  }
  return "Unknown error";
}

function formatAudioDuration(
  seconds?: number
) {
  if (!seconds || seconds <= 0) {
    return "timing estimated";
  }

  const rounded = Math.round(seconds);
  const minutes = Math.floor(rounded / 60);
  const remainder = rounded % 60;

  return minutes > 0
    ? `${minutes}:${String(remainder).padStart(2, "0")}`
    : `${remainder} sec`;
}

function estimateJourneyMinutes(
  distanceKm: number,
  stopCount: number,
  mode: TransportMode
) {
  const movingSpeed =
    mode === "tram"
      ? 32
      : mode === "train"
        ? 55
        : mode === "cab"
          ? 24
          : 22;
  const dwellMinutes =
    mode === "tram"
      ? 0.65
      : mode === "bus"
        ? 0.55
        : 0.2;
  const rawMinutes =
    (distanceKm / movingSpeed) * 60 +
    Math.max(0, stopCount - 1) * dwellMinutes;

  return Math.max(
    5,
    Math.ceil(rawMinutes / 5) * 5
  );
}

function getSectionCoordinates(
  route: RouteDefinition,
  startStop: RouteStop,
  endStop: RouteStop
) {
  const fullLine =
    lineString(route.coordinates);

  const totalLength =
    length(fullLine, {
      units: "kilometers",
    });

  const lowProgress =
    Math.min(
      startStop.routeProgress,
      endStop.routeProgress
    );

  const highProgress =
    Math.max(
      startStop.routeProgress,
      endStop.routeProgress
    );

  const startDistance =
    totalLength *
    (lowProgress / 100);

  const endDistance =
    totalLength *
    (highProgress / 100);

  const sliced =
    lineSliceAlong(
      fullLine,
      startDistance,
      endDistance,
      {
        units: "kilometers",
      }
    );

  return sliced.geometry.coordinates as Coordinates[];
}

function getRouteProgress(
  route: RouteDefinition,
  coordinates: Coordinates
) {
  const routeLine =
    lineString(route.coordinates);

  const totalLength =
    length(routeLine, {
      units: "kilometers",
    });

  const snapped =
    nearestPointOnLine(
      routeLine,
      point(coordinates),
      {
        units: "kilometers",
      }
    );

  const distanceAlong =
    Number(
      snapped.properties.location ?? 0
    );

  if (totalLength <= 0) {
    return 0;
  }

  return (
    distanceAlong /
    totalLength
  ) * 100;
}

function CreatorFooter() {
  return (
    <footer className="creatorFooter">
      <div>
        <strong className="creatorFooterBrand">
          <img
            src="/branding/between-stops-icon.png"
            alt=""
          />
          <span>Between Stops</span>
        </strong>
        <span>
          © {new Date().getFullYear()}
        </span>
      </div>

      <nav aria-label="Creator information">
        <a href="/creator/help">
          How to build your experience
        </a>

        <button
          type="button"
          disabled
          title="Privacy information will be added before launch."
        >
          Privacy
        </button>

        <button
          type="button"
          disabled
          title="Creator terms will be added before launch."
        >
          Creator terms
        </button>

        <button
          type="button"
          disabled
          title="Contact details will be added before launch."
        >
          Contact
        </button>
      </nav>
    </footer>
  );
}

function PendingImagePreview({
  file,
}: {
  file: File;
}) {
  const previewUrl = useMemo(
    () => URL.createObjectURL(file),
    [file]
  );

  useEffect(
    () => () => URL.revokeObjectURL(previewUrl),
    [previewUrl]
  );

  return <img src={previewUrl} alt="Selected upload preview" />;
}

export default function CreatorPage() {
  const mapContainer =
    useRef<HTMLDivElement | null>(null);

  const mapRef =
    useRef<Map | null>(null);

  const routeMarkerRefs =
    useRef<Marker[]>([]);

  const storyMarkerRefs =
    useRef<Marker[]>([]);

  const draftMarkerRef =
    useRef<Marker | null>(null);

  const placementModeRef =
    useRef(false);

  const mapViewRef = useRef<{
    routeId: string;
    stage: CreatorStage;
    center: Coordinates;
    zoom: number;
  } | null>(null);

  const [stage, setStage] =
    useState<CreatorStage>("projects");

  const [city] =
    useState("Edinburgh");

  const [mode, setMode] =
    useState<TransportMode>("tram");

  const [
    selectedRouteId,
    setSelectedRouteId,
  ] = useState("tram");

  const [
    sectionMode,
    setSectionMode,
  ] =
    useState<SectionMode>("whole");

  const [
    startStopId,
    setStartStopId,
  ] = useState("");

  const [
    endStopId,
    setEndStopId,
  ] = useState("");

  const [
    experienceName,
    setExperienceName,
  ] = useState("");

  const [
    experienceSummary,
    setExperienceSummary,
  ] = useState("");

  const [
    experienceDescription,
    setExperienceDescription,
  ] = useState("");

  const [
    rightsConfirmed,
    setRightsConfirmed,
  ] = useState(false);

  const [
    coverImage,
    setCoverImage,
  ] = useState<
    MediaAttachment | undefined
  >(undefined);

  const [
    pendingCoverFile,
    setPendingCoverFile,
  ] = useState<File | null>(
    null
  );

  const [
    galleryImages,
    setGalleryImages,
  ] = useState<MediaAttachment[]>([]);

  const [
    pendingGalleryFiles,
    setPendingGalleryFiles,
  ] = useState<(File | null)[]>([
    null,
    null,
    null,
    null,
  ]);

  const [
    availableFrom,
    setAvailableFrom,
  ] = useState("");

  const [
    availableTo,
    setAvailableTo,
  ] = useState("");

  const [
    seasonalAvailability,
    setSeasonalAvailability,
  ] = useState(false);

  const [
    ageGuidance,
    setAgeGuidance,
  ] = useState<AgeGuidance>(
    "all_ages"
  );

  const [
    tourAccessType,
    setTourAccessType,
  ] = useState<"free" | "paid">("free");

  const [
    tourPrice,
    setTourPrice,
  ] = useState("");

  const [
    creatorProfile,
    setCreatorProfile,
  ] = useState<CreatorProfile | null>(
    null
  );

  const [
    profileName,
    setProfileName,
  ] = useState("");

  const [
    profileBio,
    setProfileBio,
  ] = useState("");

  const [
    profileAvatar,
    setProfileAvatar,
  ] = useState<
    MediaAttachment | undefined
  >(undefined);

  const [
    pendingAvatarFile,
    setPendingAvatarFile,
  ] = useState<File | null>(
    null
  );

  const [profileLeftPrompt, setProfileLeftPrompt] =
    useState<MediaAttachment | undefined>(undefined);

  const [profileRightPrompt, setProfileRightPrompt] =
    useState<MediaAttachment | undefined>(undefined);

  const [pendingLeftPromptFile, setPendingLeftPromptFile] =
    useState<File | null>(null);

  const [pendingRightPromptFile, setPendingRightPromptFile] =
    useState<File | null>(null);

  const [
    detailsSaving,
    setDetailsSaving,
  ] = useState(false);

  const [
    profileSaving,
    setProfileSaving,
  ] = useState(false);

  const [
    projectId,
    setProjectId,
  ] = useState<string | null>(
    null
  );

  const [
    projects,
    setProjects,
  ] = useState<SavedProject[]>(
    []
  );

  const [projectStatusFilter, setProjectStatusFilter] =
    useState<ProjectStatusFilter>("all");

  const [
    stories,
    setStories,
  ] = useState<CreatorStory[]>(
    []
  );

  const [
    placementMode,
    setPlacementMode,
  ] = useState(false);

  const [mapReadyVersion, setMapReadyVersion] =
    useState(0);

  const [
    draftCoordinates,
    setDraftCoordinates,
  ] =
    useState<Coordinates | null>(
      null
    );

  const [
    editingStoryId,
    setEditingStoryId,
  ] =
    useState<string | null>(
      null
    );

  const [
    storyTitle,
    setStoryTitle,
  ] = useState("");

  const [
    storyText,
    setStoryText,
  ] = useState("");

  const [
    storyType,
    setStoryType,
  ] =
    useState<CreatorStoryType>(
      "audio"
    );

  const [
    storyAudio,
    setStoryAudio,
  ] =
    useState<
      MediaAttachment | undefined
    >(undefined);

  const [
    storyImage,
    setStoryImage,
  ] =
    useState<
      MediaAttachment | undefined
    >(undefined);

  const [
    pendingAudioFile,
    setPendingAudioFile,
  ] = useState<File | null>(
    null
  );

  const [
    pendingImageFile,
    setPendingImageFile,
  ] = useState<File | null>(
    null
  );

  const [
    storySaving,
    setStorySaving,
  ] = useState(false);

  const [
    saveMessage,
    setSaveMessage,
  ] = useState("");

  const [
    projectsLoading,
    setProjectsLoading,
  ] = useState(true);

  const [
    projectError,
    setProjectError,
  ] = useState("");

  const [isAdmin, setIsAdmin] =
    useState(false);

  useEffect(() => {
    let isActive = true;

    async function initialiseProjects() {
      const supabase =
        createClient();

      try {
        const remoteProjects =
          await loadCreatorProjects(
            supabase
          );

        const browserProjects =
          loadBrowserProjects();

        const remoteIds =
          new Set(
            remoteProjects.map(
              (project) =>
                project.id
            )
          );

        const projectsToImport =
          browserProjects.filter(
            (project) =>
              !remoteIds.has(
                project.id
              )
          );

        if (
          projectsToImport.length >
          0
        ) {
          const shouldImport =
            window.confirm(
              `We found ${projectsToImport.length} draft experience${
                projectsToImport.length ===
                1
                  ? ""
                  : "s"
              } saved in this browser. Import ${
                projectsToImport.length ===
                1
                  ? "it"
                  : "them"
              } into your account?`
            );

          if (shouldImport) {
            for (const project of projectsToImport) {
              await saveCreatorProject(
                supabase,
                {
                  ...project,
                  status: "draft",
                }
              );
            }
          }
        }

        const latestProjects =
          await loadCreatorProjects(
            supabase
          );

        const profile =
          await loadCreatorProfile(
            supabase
          );

        const {
          data: adminMembership,
        } = await supabase
          .from("platform_admins")
          .select("user_id")
          .maybeSingle();

        if (isActive) {
          setProjects(
            latestProjects
          );

          setProjectError("");

          setCreatorProfile(
            profile
          );

          setProfileName(
            profile?.displayName ??
              ""
          );

          setProfileBio(
            profile?.bio ?? ""
          );

          setProfileAvatar(
            profile?.avatar
          );

          setProfileLeftPrompt(
            profile?.leftPrompt
          );

          setProfileRightPrompt(
            profile?.rightPrompt
          );

          setIsAdmin(
            Boolean(adminMembership)
          );
        }
      } catch (error) {
        const detail =
          error instanceof Error
            ? error.message
            : typeof error ===
                  "object" &&
                error !== null &&
                "message" in error
              ? String(
                  error.message
                )
              : JSON.stringify(
                  error
                );

        if (isActive) {
          setProjectError(
            `Your drafts could not be loaded: ${
              detail ||
              "Unknown error"
            }`
          );
        }
      } finally {
        if (isActive) {
          setProjectsLoading(
            false
          );
        }
      }
    }

    void initialiseProjects();

    return () => {
      isActive = false;
    };
  }, []);

  const availableRoutes =
    useMemo(
      () =>
        routeChoices.filter(
          (choice) =>
            choice.route.mode ===
            mode
        ),
      [mode]
    );

  const selectedChoice =
    routeChoices.find(
      (choice) =>
        choice.id ===
        selectedRouteId
    ) ?? routeChoices[0];

  const route =
    selectedChoice.route;

  const activeProject =
    projects.find(
      (project) =>
        project.id === projectId
    );

  const canEditActiveProject =
    !activeProject ||
    activeProject.status === "draft" ||
    activeProject.status ===
      "changes_requested";

  const projectFilters: Array<{
    id: ProjectStatusFilter;
    label: string;
  }> = [
    { id: "all", label: "All" },
    { id: "draft", label: "Drafts" },
    { id: "review", label: "In review" },
    { id: "changes_requested", label: "Changes requested" },
    { id: "published", label: "Published" },
    { id: "paused", label: "Paused" },
    { id: "archived", label: "Archived" },
  ];

  const projectMatchesFilter = (
    project: SavedProject,
    filter: ProjectStatusFilter
  ) => {
    if (filter === "all") return true;
    if (filter === "review") {
      return ["ready_for_review", "submitted", "approved"].includes(
        project.status
      );
    }
    return project.status === filter;
  };

  const visibleProjects = projects.filter((project) =>
    projectMatchesFilter(project, projectStatusFilter)
  );

  const stops =
    route.stops ?? [];

  const practicalStops =
    useMemo(() => {
      if (
        route.id ===
        "route-35-full"
      ) {
        const heriotIndex =
          stops.findIndex(
            (stop) =>
              stop.name ===
              "Heriot Watt Campus"
          );

        if (heriotIndex >= 0) {
          return stops.slice(
            heriotIndex
          );
        }
      }

      return stops;
    }, [
      route.id,
      stops,
    ]);

  useEffect(() => {
    if (
      startStopId &&
      endStopId
    ) {
      return;
    }

    const firstStop =
      practicalStops[0];

    const lastStop =
      practicalStops[
        practicalStops.length -
          1
      ];

    if (firstStop) {
      setStartStopId(
        firstStop.id
      );
    }

    if (lastStop) {
      setEndStopId(
        lastStop.id
      );
    }
  }, [
    practicalStops,
    startStopId,
    endStopId,
  ]);

  const selectedStartStop =
    practicalStops.find(
      (stop) =>
        stop.id ===
        startStopId
    ) ?? practicalStops[0];

  const selectedEndStop =
    practicalStops.find(
      (stop) =>
        stop.id ===
        endStopId
    ) ??
    practicalStops[
      practicalStops.length -
        1
    ];

  const selectedSectionCoordinates =
    useMemo(() => {
      if (
        sectionMode ===
          "whole" ||
        !selectedStartStop ||
        !selectedEndStop
      ) {
        return route.coordinates;
      }

      return getSectionCoordinates(
        route,
        selectedStartStop,
        selectedEndStop
      );
    }, [
      route,
      sectionMode,
      selectedStartStop,
      selectedEndStop,
    ]);

  const selectedJourneyDistanceKm =
    useMemo(() => {
      if (
        selectedSectionCoordinates.length <
        2
      ) {
        return 0;
      }

      return length(
        lineString(
          selectedSectionCoordinates
        ),
        {
          units: "kilometers",
        }
      );
    }, [
      selectedSectionCoordinates,
    ]);

  const selectedJourneyDistanceMiles =
    selectedJourneyDistanceKm *
    0.621371;

  const selectedJourneyStopCount =
    practicalStops.filter((stop) => {
      if (sectionMode === "whole") {
        return true;
      }

      const low = Math.min(
        selectedStartStop?.routeProgress ?? 0,
        selectedEndStop?.routeProgress ?? 100
      );
      const high = Math.max(
        selectedStartStop?.routeProgress ?? 0,
        selectedEndStop?.routeProgress ?? 100
      );

      return (
        stop.routeProgress >= low &&
        stop.routeProgress <= high
      );
    }).length;

  const estimatedJourneyMinutes =
    estimateJourneyMinutes(
      selectedJourneyDistanceKm,
      selectedJourneyStopCount,
      route.mode
    );

  const startLabel =
    sectionMode === "whole"
      ? practicalStops[0]
          ?.name ??
        route.canonicalStart
      : selectedStartStop
          ?.name ??
        route.canonicalStart;

  const endLabel =
    sectionMode === "whole"
      ? practicalStops[
          practicalStops.length -
            1
        ]?.name ??
        route.canonicalEnd
      : selectedEndStop
          ?.name ??
        route.canonicalEnd;

  const sectionIsValid =
    Boolean(
      selectedStartStop &&
        selectedEndStop &&
        selectedStartStop.id !==
          selectedEndStop.id
    );

  const sectionLowProgress =
    Math.min(
      selectedStartStop
        ?.routeProgress ?? 0,
      selectedEndStop
        ?.routeProgress ?? 100
    );

  const sectionHighProgress =
    Math.max(
      selectedStartStop
        ?.routeProgress ?? 0,
      selectedEndStop
        ?.routeProgress ?? 100
    );

  const selectedSectionStops =
    practicalStops.filter(
      (stop) =>
        stop.routeProgress >=
          sectionLowProgress &&
        stop.routeProgress <=
          sectionHighProgress
    );

  const storyTimingExperience = useMemo(
    () =>
      ({
        id: projectId ?? "creator-timing-preview",
        title: experienceName || "Draft experience",
        description: experienceSummary,
        routeId: route.id,
        startProgress: sectionLowProgress,
        endProgress: sectionHighProgress,
        startLabel,
        endLabel,
        durationMinutes: estimatedJourneyMinutes,
        stories: stories.map((story) => ({
          id: story.id,
          title: story.title,
          eyebrow:
            story.type === "look"
              ? "Something to spot"
              : "Listen",
          text: story.text,
          type: story.type,
          routeProgress: story.routeProgress,
          direction: "both" as const,
          subjectLocation: {
            longitude: story.subjectCoordinates[0],
            latitude: story.subjectCoordinates[1],
          },
          directionalPrompt: story.type === "look",
          audioDurationSeconds:
            story.audio?.durationSeconds,
          audioUrl: story.audio?.url,
          imageUrl: story.image?.url,
        })),
      }) satisfies ExperienceDefinition,
    [
      endLabel,
      estimatedJourneyMinutes,
      experienceName,
      experienceSummary,
      projectId,
      route.id,
      sectionHighProgress,
      sectionLowProgress,
      startLabel,
      stories,
    ]
  );

  const storyTimingWarnings = useMemo(
    () =>
      getStoryTimingWarnings(
        route,
        storyTimingExperience
      ),
    [route, storyTimingExperience]
  );

  /*
    MAP
  */

  useEffect(() => {
    placementModeRef.current = placementMode;
  }, [placementMode]);

  useEffect(() => {
    const shouldShowMap =
      stage === "route" ||
      stage === "studio";

    if (
      !shouldShowMap ||
      !mapContainer.current
    ) {
      return;
    }

    mapRef.current?.remove();
    mapRef.current = null;

    routeMarkerRefs.current.forEach(
      (marker) => marker.remove()
    );

    storyMarkerRefs.current.forEach(
      (marker) => marker.remove()
    );

    draftMarkerRef.current?.remove();

    routeMarkerRefs.current = [];
    storyMarkerRefs.current = [];
    draftMarkerRef.current = null;

    const preservedView =
      mapViewRef.current?.routeId === route.id &&
      mapViewRef.current.stage === stage
        ? mapViewRef.current
        : null;

    const map =
      new Map({
        container:
          mapContainer.current,

        style: {
          version: 8,

          sources: {
            osm: {
              type: "raster",

              tiles: [
                "https://tile.openstreetmap.org/{z}/{x}/{y}.png",
              ],

              tileSize: 256,

              attribution:
                "© OpenStreetMap contributors",
            },
          },

          layers: [
            {
              id: "map-background",
              type: "background",
              paint: {
                "background-color": "#e7e4dc",
              },
            },
            {
              id: "osm",
              type: "raster",
              source: "osm",
            },
          ],
        },

        center: preservedView?.center ?? [-3.22, 55.95],

        zoom: preservedView?.zoom ?? 11,
      });

    mapRef.current = map;

    map.addControl(
      new NavigationControl({
        showCompass: false,
      }),
      "top-right"
    );

    map.doubleClickZoom.disable();

    map.on("moveend", () => {
      const center = map.getCenter();
      mapViewRef.current = {
        routeId: route.id,
        stage,
        center: [center.lng, center.lat],
        zoom: map.getZoom(),
      };
    });

    function drawMap() {
      map.addSource(
        "full-route",
        {
          type: "geojson",

          data: {
            type: "Feature",
            properties: {},

            geometry: {
              type: "LineString",
              coordinates:
                route.coordinates,
            },
          },
        }
      );

      map.addLayer({
        id: "full-route",
        type: "line",
        source: "full-route",

        paint: {
          "line-color":
            "#aaa69d",

          "line-width": 5,

          "line-opacity":
            sectionMode ===
            "section"
              ? 0.35
              : 0,
        },
      });

      map.addSource(
        "selected-section",
        {
          type: "geojson",

          data: {
            type: "Feature",
            properties: {},

            geometry: {
              type: "LineString",

              coordinates:
                selectedSectionCoordinates,
            },
          },
        }
      );

      map.addLayer({
        id:
          "selected-section",

        type: "line",

        source:
          "selected-section",

        paint: {
          "line-color":
            "#171717",

          "line-width": 7,

          "line-opacity": 0.95,
        },
      });

      const bounds =
        new LngLatBounds();

      selectedSectionCoordinates.forEach(
        ([
          longitude,
          latitude,
        ]) => {
          bounds.extend([
            longitude,
            latitude,
          ]);
        }
      );

      practicalStops
        .filter(
          (stop) =>
            stop.routeProgress >= sectionLowProgress &&
            stop.routeProgress <= sectionHighProgress
        )
        .forEach((stop) => {
          const element = document.createElement("button");
          const isEndpoint =
            stop.id === selectedStartStop?.id ||
            stop.id === selectedEndStop?.id;
          element.type = "button";
          element.className = isEndpoint
            ? "creatorStopMapMarker endpoint"
            : "creatorStopMapMarker";
          element.title = stop.name;
          element.setAttribute("aria-label", `Stop: ${stop.name}`);

          const marker = new Marker({
            element,
            anchor: "center",
          })
            .setLngLat(stop.coordinates)
            .addTo(map);

          routeMarkerRefs.current.push(marker);
        });

      if (!bounds.isEmpty() && !preservedView) {
        map.fitBounds(
          bounds,
          {
            padding:
              stage ===
              "studio"
                ? 90
                : 75,

            duration: 500,
          }
        );
      }

      window.setTimeout(
        () => {
          map.resize();
          map.triggerRepaint();
        },
        150
      );

      setMapReadyVersion((current) => current + 1);
    }

    map.once(
      "load",
      drawMap
    );

    if (
      stage === "studio"
    ) {
      map.on(
        "click",
        (event) => {
          if (
            !placementModeRef.current
          ) {
            return;
          }

          const coordinates: Coordinates =
            [
              event.lngLat.lng,
              event.lngLat.lat,
            ];

          setDraftCoordinates(
            coordinates
          );

          setEditingStoryId(
            null
          );

          setStoryTitle("");
          setStoryText("");
          setStoryType(
            "audio"
          );

          setPlacementMode(
            false
          );
        }
      );
    }

    return () => {
      routeMarkerRefs.current.forEach(
        (marker) =>
          marker.remove()
      );

      storyMarkerRefs.current.forEach(
        (marker) =>
          marker.remove()
      );

      draftMarkerRef.current?.remove();

      routeMarkerRefs.current =
        [];

      storyMarkerRefs.current =
        [];

      draftMarkerRef.current =
        null;

      map.remove();

      if (
        mapRef.current ===
        map
      ) {
        mapRef.current =
          null;
      }
    };
  }, [
    stage,
    route,
    selectedSectionCoordinates,
    sectionMode,
    selectedStartStop,
    selectedEndStop,
  ]);

  useEffect(() => {
    if (
      stage !== "studio" ||
      !mapRef.current ||
      mapReadyVersion === 0
    ) {
      return;
    }

    const map = mapRef.current;
    storyMarkerRefs.current.forEach((marker) => marker.remove());
    storyMarkerRefs.current = [];

    stories.forEach((story) => {
      const wrapper = document.createElement("button");
      wrapper.type = "button";
      wrapper.className = "storyMapPinLabel";

      const dot = document.createElement("span");
      dot.className = "storyMapDot";
      dot.innerText = "●";

      const label = document.createElement("span");
      label.className = "storyMapLabel";
      label.innerText = story.title;
      wrapper.append(dot, label);

      wrapper.addEventListener("click", (event) => {
        event.stopPropagation();
        openStoryForEditing(story);
      });

      const marker = new Marker({
        element: wrapper,
        anchor: "left",
      })
        .setLngLat(story.subjectCoordinates)
        .addTo(map);

      storyMarkerRefs.current.push(marker);
    });

    map.resize();
    map.triggerRepaint();

    return () => {
      storyMarkerRefs.current.forEach((marker) => marker.remove());
      storyMarkerRefs.current = [];
    };
  }, [stage, stories, mapReadyVersion]);

  useEffect(() => {
    if (
      stage !== "studio" ||
      !mapRef.current
    ) {
      return;
    }

    draftMarkerRef.current?.remove();

    if (!draftCoordinates) {
      return;
    }

    const element =
      document.createElement(
        "div"
      );

    element.className =
      "draftMapPin";

    element.innerHTML = "＋";

    draftMarkerRef.current =
      new Marker({
        element,
        anchor: "center",
      })
        .setLngLat(
          draftCoordinates
        )
        .addTo(
          mapRef.current
        );

    return () => {
      draftMarkerRef.current?.remove();
      draftMarkerRef.current =
        null;
    };
  }, [
    stage,
    draftCoordinates,
  ]);

  /*
    PROJECTS
  */

  function buildProject(
    id: string,
    projectStories = stories,
    projectCover = coverImage,
    projectGallery = galleryImages
  ): SavedProject {
    const existing =
      projects.find(
        (project) =>
          project.id === id
      );

    return {
      id,
      name:
        experienceName.trim(),
      city,
      selectedRouteId,
      sectionMode,
      startStopId:
        selectedStartStop?.id ??
        startStopId,
      endStopId:
        selectedEndStop?.id ??
        endStopId,
      summary:
        experienceSummary.trim(),
      description:
        experienceDescription.trim(),
      coverImage: projectCover,
      galleryImages: projectGallery,
      durationMinutes:
        estimatedJourneyMinutes,
      availableFrom:
        seasonalAvailability
          ? availableFrom || undefined
          : undefined,
      availableTo:
        seasonalAvailability
          ? availableTo || undefined
          : undefined,
      ageGuidance,
      startCoordinates:
        selectedStartStop
          ?.coordinates,
      visibility:
        existing?.visibility ??
        "private",
      accessType:
        tourAccessType,
      pricePence:
        tourAccessType === "paid"
          ? Math.round(Number(tourPrice) * 100)
          : undefined,
      currency:
        existing?.currency ??
        "GBP",
      languageCode:
        existing?.languageCode ??
        "en-GB",
      publishedAt:
        existing?.publishedAt,
      rightsConfirmedAt:
        rightsConfirmed
          ? existing?.rightsConfirmedAt ??
            new Date().toISOString()
          : undefined,
      reviewNote:
        existing?.reviewNote,
      stories: projectStories,
      status:
        existing?.status ??
        "draft",
      updatedAt:
        new Date().toISOString(),
    };
  }

  function newProject() {
    setProjectId(null);
    setExperienceName("");
    setExperienceSummary("");
    setExperienceDescription("");
    setRightsConfirmed(false);
    setCoverImage(undefined);
    setPendingCoverFile(null);
    setGalleryImages([]);
    setPendingGalleryFiles([null, null, null, null]);
    setAvailableFrom("");
    setAvailableTo("");
    setSeasonalAvailability(false);
    setAgeGuidance("all_ages");
    setTourAccessType("free");
    setTourPrice("");
    setStories([]);

    setMode("tram");
    setSelectedRouteId(
      "tram"
    );

    setSectionMode(
      "whole"
    );

    setStartStopId("");
    setEndStopId("");

    setStage("route");
  }

  function openProject(
    project: SavedProject
  ) {
    const choice =
      routeChoices.find(
        (item) =>
          item.id ===
          project.selectedRouteId
      );

    setProjectId(
      project.id
    );

    setExperienceName(
      project.name
    );

    setExperienceSummary(
      project.summary ?? ""
    );

    setExperienceDescription(
      project.description ?? ""
    );

    setRightsConfirmed(
      Boolean(
        project.rightsConfirmedAt
      )
    );

    setCoverImage(
      project.coverImage
    );

    setGalleryImages(
      project.galleryImages ?? []
    );

    setPendingGalleryFiles([null, null, null, null]);

    setAvailableFrom(
      project.availableFrom ?? ""
    );

    setAvailableTo(
      project.availableTo ?? ""
    );

    setSeasonalAvailability(
      Boolean(
        project.availableFrom ||
          project.availableTo
      )
    );

    setAgeGuidance(
      project.ageGuidance ?? "all_ages"
    );

    const savedAccessType =
      project.accessType === "paid"
        ? "paid"
        : "free";

    setTourAccessType(savedAccessType);

    setTourPrice(
      savedAccessType === "paid" &&
      project.pricePence
        ? (project.pricePence / 100).toFixed(2)
        : ""
    );

    setPendingCoverFile(null);

    setSelectedRouteId(
      project.selectedRouteId
    );

    if (choice) {
      setMode(
        choice.route.mode
      );
    }

    setSectionMode(
      project.sectionMode
    );

    setStartStopId(
      project.startStopId
    );

    setEndStopId(
      project.endStopId
    );

    setStories(
      project.stories
    );

    setStage("studio");
  }

  async function saveProject(
    returnToProjects = false
  ) {
    if (!canEditActiveProject) {
      window.alert(
        "This experience is locked while it is in review or published."
      );
      return;
    }

    if (
      !experienceName.trim()
    ) {
      return;
    }

    if (
      tourAccessType === "paid" &&
      (
        !Number.isFinite(Number(tourPrice)) ||
        Number(tourPrice) < 2.99
      )
    ) {
      setProjectError("");
      setSaveMessage("");
      return;
    }

    const id =
      projectId ??
      crypto.randomUUID();

    const project =
      buildProject(id);

    const exists =
      projects.some(
        (item) =>
          item.id === id
      );

    const updated =
      exists
        ? projects.map(
            (item) =>
              item.id === id
                ? project
                : item
          )
        : [
            project,
            ...projects,
          ];

    setSaveMessage(
      "Saving…"
    );

    setProjectError("");

    try {
      const supabase =
        createClient();

      await saveCreatorProject(
        supabase,
        project
      );

      setProjects(updated);
      setProjectId(id);

      setSaveMessage(
        "Saved"
      );

      window.setTimeout(
        () =>
          setSaveMessage(""),
        1600
      );

      if (
        returnToProjects
      ) {
        setStage("projects");
      }
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : typeof error ===
                "object" &&
              error !== null &&
              "message" in error
            ? String(
                error.message
              )
            : JSON.stringify(
                error
              );

      setSaveMessage("");

      setProjectError(
        `This draft could not be saved: ${
          detail ||
          "Unknown error"
        }`
      );
    }
  }

  async function saveTourDetails() {
    if (!canEditActiveProject) {
      window.alert(
        "This experience is locked while it is in review or published."
      );
      return;
    }

    if (
      !experienceName.trim() ||
      detailsSaving
    ) {
      return;
    }

    if (
      seasonalAvailability &&
      (!availableFrom || !availableTo)
    ) {
      window.alert(
        "Choose both the first and last available dates."
      );
      return;
    }

    if (
      tourAccessType === "paid" &&
      (
        !Number.isFinite(Number(tourPrice)) ||
        Number(tourPrice) < 2.99
      )
    ) {
      setProjectError("");
      setSaveMessage("");
      return;
    }

    setDetailsSaving(true);
    setProjectError("");
    setSaveMessage("Saving…");

    const id =
      projectId ??
      crypto.randomUUID();

    try {
      const supabase =
        createClient();

      let nextCover = coverImage;
      let nextGallery = [...galleryImages];
      let project = buildProject(
        id,
        stories,
        nextCover,
        nextGallery
      );

      await saveCreatorProject(
        supabase,
        project
      );

      if (pendingCoverFile) {
        const previousPath =
          coverImage?.path;

        const uploadedCover =
          await uploadTourCover(
            supabase,
            id,
            pendingCoverFile
          );

        nextCover = uploadedCover;

        if (
          previousPath &&
          previousPath !==
            uploadedCover.path
        ) {
          await removeMediaFile(
            supabase,
            "tour-media",
            previousPath
          );
        }

      }

      for (let position = 0; position < 4; position += 1) {
        const file = pendingGalleryFiles[position];

        if (file) {
          const image = await uploadTourGalleryImage(
            supabase,
            id,
            position,
            file
          );

          if (nextGallery[position]) {
            nextGallery[position] = image;
          } else {
            nextGallery.push(image);
          }
        }
      }

      project = buildProject(
        id,
        stories,
        nextCover,
        nextGallery
      );

      await saveCreatorProject(
        supabase,
        project
      );

      setCoverImage(nextCover);
      setPendingCoverFile(null);
      setGalleryImages(nextGallery);
      setPendingGalleryFiles([null, null, null, null]);

      setProjectId(id);

      setProjects(
        (current) => {
          const exists =
            current.some(
              (item) =>
                item.id === id
            );

          return exists
            ? current.map(
                (item) =>
                  item.id === id
                    ? project
                    : item
              )
            : [project, ...current];
        }
      );

      setSaveMessage("Saved");
      setStage("studio");

      window.setTimeout(
        () =>
          setSaveMessage(""),
        1600
      );
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : "Unknown error";

      setSaveMessage("");
      setProjectError(
        `The tour details could not be saved: ${detail}`
      );
    } finally {
      setDetailsSaving(false);
    }
  }

  async function saveProfile() {
    if (
      !profileName.trim() ||
      profileSaving
    ) {
      return;
    }

    setProfileSaving(true);
    setProjectError("");
    setSaveMessage("Saving…");

    try {
      const supabase =
        createClient();

      let avatar =
        profileAvatar;
      let leftPrompt = profileLeftPrompt;
      let rightPrompt = profileRightPrompt;

      let previousAvatarPath:
        | string
        | undefined;
      let previousLeftPromptPath: string | undefined;
      let previousRightPromptPath: string | undefined;

      if (pendingAvatarFile) {
        previousAvatarPath =
          profileAvatar?.path;

        avatar =
          await uploadProfileAvatar(
            supabase,
            pendingAvatarFile
          );
      }

      if (pendingLeftPromptFile) {
        previousLeftPromptPath = profileLeftPrompt?.path;
        leftPrompt = await uploadProfileDirectionPrompt(
          supabase,
          "left",
          pendingLeftPromptFile
        );
      }

      if (pendingRightPromptFile) {
        previousRightPromptPath = profileRightPrompt?.path;
        rightPrompt = await uploadProfileDirectionPrompt(
          supabase,
          "right",
          pendingRightPromptFile
        );
      }

      await saveCreatorProfile(
        supabase,
        {
          displayName:
            profileName.trim(),
          bio:
            profileBio.trim(),
          avatar,
          leftPrompt,
          rightPrompt,
          isPublic: true,
        }
      );

      if (
        previousAvatarPath &&
        avatar &&
        previousAvatarPath !==
          avatar.path
      ) {
        await removeMediaFile(
          supabase,
          "profile-media",
          previousAvatarPath
        );
      }

      if (
        previousLeftPromptPath &&
        leftPrompt &&
        previousLeftPromptPath !== leftPrompt.path
      ) {
        await removeMediaFile(
          supabase,
          "profile-media",
          previousLeftPromptPath
        );
      }

      if (
        previousRightPromptPath &&
        rightPrompt &&
        previousRightPromptPath !== rightPrompt.path
      ) {
        await removeMediaFile(
          supabase,
          "profile-media",
          previousRightPromptPath
        );
      }

      const refreshedProfile =
        await loadCreatorProfile(
          supabase
        );

      setCreatorProfile(
        refreshedProfile
      );
      setProfileAvatar(
        refreshedProfile?.avatar
      );
      setProfileLeftPrompt(
        refreshedProfile?.leftPrompt
      );
      setProfileRightPrompt(
        refreshedProfile?.rightPrompt
      );
      setPendingAvatarFile(null);
      setPendingLeftPromptFile(null);
      setPendingRightPromptFile(null);
      setSaveMessage("Profile saved");
      setStage("projects");

      window.setTimeout(
        () =>
          setSaveMessage(""),
        1600
      );
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : "Unknown error";

      setSaveMessage("");
      setProjectError(
        `Your profile could not be saved: ${detail}`
      );
    } finally {
      setProfileSaving(false);
    }
  }

  async function submitForReview() {
    if (!projectId) {
      window.alert(
        "Save the draft before submitting it."
      );
      return;
    }

    const missing: string[] = [];

    if (!creatorProfile?.displayName) {
      missing.push(
        "a creator profile"
      );
    }

    if (!experienceSummary.trim()) {
      missing.push(
        "a short summary"
      );
    }

    if (!coverImage) {
      missing.push(
        "a tour cover image"
      );
    }

    if (stories.length === 0) {
      missing.push(
        "at least one Story"
      );
    }

    if (
      stories.some(
        (story) => !story.audio
      )
    ) {
      missing.push(
        "audio for every Story"
      );
    }

    if (
      stories.some(
        (story) => story.type === "look"
      ) &&
      (!creatorProfile?.leftPrompt ||
        !creatorProfile?.rightPrompt)
    ) {
      missing.push(
        "both Look left and Look right voice prompts in your creator profile"
      );
    }

    if (!rightsConfirmed) {
      missing.push(
        "the rights confirmation"
      );
    }

    if (
      tourAccessType === "paid" &&
      (
        !Number.isFinite(Number(tourPrice)) ||
        Number(tourPrice) < 2.99
      )
    ) {
      missing.push(
        "a paid tour price of at least £2.99"
      );
    }

    if (missing.length > 0) {
      window.alert(
        `Before submitting, add ${missing.join(
          ", "
        )}.`
      );
      return;
    }

    const confirmed = window.confirm(
      "Submit this experience for administrator review? You can make further changes if changes are requested."
    );

    if (!confirmed) {
      return;
    }

    setSaveMessage("Submitting…");
    setProjectError("");

    try {
      const supabase =
        createClient();

      const project =
        buildProject(projectId);

      await saveCreatorProject(
        supabase,
        project
      );

      await submitCreatorProjectForReview(
        supabase,
        projectId
      );

      const submittedProject: SavedProject = {
        ...project,
        status: "submitted",
        visibility: "private",
        publishedAt: undefined,
        reviewNote: undefined,
      };

      setProjects(
        (current) =>
          current.map(
            (item) =>
              item.id ===
              projectId
                ? submittedProject
                : item
          )
      );

      setSaveMessage(
        "Submitted for review"
      );

      window.setTimeout(
        () =>
          setSaveMessage(""),
        1800
      );
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : "Unknown error";

      setSaveMessage("");
      setProjectError(
        `The experience could not be submitted: ${detail}`
      );
    }
  }

  async function retractReview() {
    if (!projectId || activeProject?.status !== "submitted") {
      return;
    }

    if (
      !window.confirm(
        "Retract this experience from review and return it to draft?"
      )
    ) {
      return;
    }

    setSaveMessage("Retracting…");
    setProjectError("");

    try {
      const supabase = createClient();
      await retractCreatorProjectReview(
        supabase,
        projectId
      );

      setProjects((current) =>
        current.map((project) =>
          project.id === projectId
            ? {
                ...project,
                status: "draft",
                visibility: "private",
                publishedAt: undefined,
              }
            : project
        )
      );
      setSaveMessage("Returned to draft");
      window.setTimeout(() => setSaveMessage(""), 1800);
    } catch (retractError) {
      setSaveMessage("");
      setProjectError(
        `The review could not be retracted: ${
          retractError instanceof Error
            ? retractError.message
            : "Unknown error"
        }`
      );
    }
  }

  async function pausePublishedProject(project: SavedProject) {
    if (
      !window.confirm(
        "Pause this tour? It will disappear from the public catalogue immediately. You can restore the unchanged version later."
      )
    ) {
      return;
    }

    setProjectError("");
    try {
      await pauseCreatorProject(createClient(), project.id);
      setProjects((current) =>
        current.map((item) =>
          item.id === project.id
            ? { ...item, status: "paused", visibility: "private" }
            : item
        )
      );
    } catch (error) {
      setProjectError(
        `The tour could not be paused: ${getActionErrorMessage(error)}`
      );
    }
  }

  async function restorePausedProject(project: SavedProject) {
    if (
      !window.confirm(
        "Put the unchanged approved tour live again?"
      )
    ) {
      return;
    }

    setProjectError("");
    try {
      await restorePausedCreatorProject(createClient(), project.id);
      setProjects((current) =>
        current.map((item) =>
          item.id === project.id
            ? { ...item, status: "published", visibility: "public" }
            : item
        )
      );
    } catch (error) {
      setProjectError(
        `The tour could not be restored: ${getActionErrorMessage(error)}`
      );
    }
  }

  async function editPausedProject(project: SavedProject) {
    if (
      !window.confirm(
        "Return this tour to draft for editing? Your changes will need administrator approval before it can go live again."
      )
    ) {
      return;
    }

    setProjectError("");
    try {
      await editPausedCreatorProject(createClient(), project.id);
      const draftProject: SavedProject = {
        ...project,
        status: "draft",
        visibility: "private",
        publishedAt: undefined,
      };
      setProjects((current) =>
        current.map((item) =>
          item.id === project.id ? draftProject : item
        )
      );
      openProject(draftProject);
    } catch (error) {
      setProjectError(
        `The tour could not be returned to draft: ${getActionErrorMessage(error)}`
      );
    }
  }

  async function deleteProject(
    id: string
  ) {
    const confirmed =
      window.confirm(
        "Delete this draft experience?"
      );

    if (!confirmed) {
      return;
    }

    setProjectError("");

    try {
      const supabase =
        createClient();

      await deleteCreatorProject(
        supabase,
        id
      );

      setProjects(
        (current) =>
          current.filter(
            (project) =>
              project.id !== id
          )
      );
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : typeof error ===
                "object" &&
              error !== null &&
              "message" in error
            ? String(
                error.message
              )
            : JSON.stringify(
                error
              );

      setProjectError(
        `This draft could not be deleted: ${
          detail ||
          "Unknown error"
        }`
      );
    }
  }

  async function signOut() {
    const supabase =
      createClient();

    await supabase.auth.signOut();

    window.location.href =
      "/login";
  }

  /*
    ROUTE / NAME / STORIES
  */

  function goToNameStage() {
    if (
      sectionMode ===
        "section" &&
      !sectionIsValid
    ) {
      return;
    }

    setExperienceName(
      (current) =>
        current ||
        `${startLabel} to ${endLabel}`
    );

    setStage("name");
  }

  function enterStudio() {
    if (
      !experienceName.trim()
    ) {
      return;
    }

    setExperienceName(
      experienceName.trim()
    );

    setProjectId(
      (current) =>
        current ??
        crypto.randomUUID()
    );

    setStage("studio");
  }

  function startAddingStory() {
    setEditingStoryId(
      null
    );

    setDraftCoordinates(
      null
    );

    setStoryTitle("");
    setStoryText("");
    setStoryType("audio");
    setStoryAudio(undefined);
    setStoryImage(undefined);
    setPendingAudioFile(null);
    setPendingImageFile(null);

    setPlacementMode(
      true
    );
  }

  function cancelStory() {
    setPlacementMode(
      false
    );

    setDraftCoordinates(
      null
    );

    setEditingStoryId(
      null
    );

    setStoryTitle("");
    setStoryText("");
    setStoryAudio(undefined);
    setStoryImage(undefined);
    setPendingAudioFile(null);
    setPendingImageFile(null);
  }

  function openStoryForEditing(
    story: CreatorStory
  ) {
    setPlacementMode(
      false
    );

    setDraftCoordinates(
      story.subjectCoordinates
    );

    setEditingStoryId(
      story.id
    );

    setStoryTitle(
      story.title
    );

    setStoryText(
      story.text
    );

    setStoryType(
      story.type === "look"
        ? "look"
        : "audio"
    );

    setStoryAudio(
      story.audio
    );

    setStoryImage(
      story.image
    );

    setPendingAudioFile(null);
    setPendingImageFile(null);
  }

  async function saveStory() {
    if (!canEditActiveProject) {
      window.alert(
        "This experience is locked while it is in review or published."
      );
      return;
    }

    if (
      !draftCoordinates ||
      !storyTitle.trim() ||
      storySaving
    ) {
      return;
    }

    setStorySaving(true);
    setProjectError("");

    try {
      const supabase =
        createClient();

      const resolvedProjectId =
        projectId ??
        crypto.randomUUID();

      const resolvedStoryId =
        editingStoryId ??
        crypto.randomUUID();

      let audio = storyAudio;
      let image = storyImage;

      if (pendingAudioFile) {
        audio =
          await uploadStoryMedia(
            supabase,
            resolvedProjectId,
            resolvedStoryId,
            "audio",
            pendingAudioFile
          );
      }

      if (pendingImageFile) {
        image =
          await uploadStoryMedia(
            supabase,
            resolvedProjectId,
            resolvedStoryId,
            "image",
            pendingImageFile
          );
      }

      const routeProgress =
        getRouteProgress(
          route,
          draftCoordinates
        );

      const story: CreatorStory =
        {
          id: resolvedStoryId,
          title:
            storyTitle.trim(),
          text:
            storyText.trim(),
          type: storyType,
          subjectCoordinates:
            draftCoordinates,
          routeProgress,
          audio,
          image,
        };

      const updatedStories =
        editingStoryId
          ? stories.map(
              (currentStory) =>
                currentStory.id ===
                editingStoryId
                  ? story
                  : currentStory
            )
          : [
              ...stories,
              story,
            ];

      const project =
        buildProject(
          resolvedProjectId,
          updatedStories
        );

      await saveCreatorProject(
        supabase,
        project
      );

      setStories(updatedStories);
      setProjectId(
        resolvedProjectId
      );

      setProjects(
        (current) => {
          const exists =
            current.some(
              (item) =>
                item.id ===
                resolvedProjectId
            );

          return exists
            ? current.map(
                (item) =>
                  item.id ===
                  resolvedProjectId
                    ? project
                    : item
              )
            : [
                project,
                ...current,
              ];
        }
      );

      setSaveMessage("Saved");

      window.setTimeout(
        () =>
          setSaveMessage(""),
        1600
      );

      cancelStory();
    } catch (error) {
      const detail =
        error instanceof Error
          ? error.message
          : "Unknown error";

      setProjectError(
        `This Story could not be saved: ${detail}`
      );
    } finally {
      setStorySaving(false);
    }
  }

  function deleteStory() {
    if (!editingStoryId) {
      return;
    }

    const confirmed =
      window.confirm(
        "Delete this Story?"
      );

    if (!confirmed) {
      return;
    }

    setStories(
      (current) =>
        current.filter(
          (story) =>
            story.id !==
            editingStoryId
        )
    );

    cancelStory();
  }

  /*
    PROJECTS SCREEN
  */

  if (stage === "projects") {
    return (
      <main className="creatorStudioShell">
        <header className="creatorBrandHeader">
          <div className="creatorLogo">
            <img
              src="/branding/between-stops-icon.png"
              alt=""
            />
            <span>Between Stops</span>
          </div>

          <div>
            {isAdmin && (
              <a href="/admin">
                Admin
              </a>
            )}

            <button
              className="headerTextButton"
              onClick={() =>
                setStage(
                  "profile"
                )
              }
            >
              {creatorProfile
                ? "Your guide profile"
                : "Create guide profile"}
            </button>

            <button
              className="headerTextButton"
              onClick={signOut}
            >
              Sign out
            </button>
          </div>
        </header>

        <section className="projectsPage">
          <div className="projectsIntro">
            <p className="creatorKicker">
              GUIDE STUDIO
            </p>

            <h1>
              Your experiences
            </h1>

            <p>
              Continue a draft or start
              something new.
            </p>

            <button
              className="newProjectButton"
              onClick={
                newProject
              }
            >
              + New experience
            </button>
          </div>

          <div className="projectsGrid">
            <div className="projectStatusFilters" aria-label="Filter experiences by status">
              {projectFilters.map((filter) => {
                const count = projects.filter((project) =>
                  projectMatchesFilter(project, filter.id)
                ).length;

                return (
                  <button
                    key={filter.id}
                    className={projectStatusFilter === filter.id ? "active" : ""}
                    onClick={() => setProjectStatusFilter(filter.id)}
                  >
                    {filter.label} <span>{count}</span>
                  </button>
                );
              })}
            </div>

            {projectsLoading && (
              <div className="emptyProjects">
                <strong>
                  Loading drafts…
                </strong>
              </div>
            )}

            {!projectsLoading &&
              projectError && (
                <div className="emptyProjects">
                  <strong>
                    Something went wrong
                  </strong>

                  <p>
                    {projectError}
                  </p>
                </div>
              )}

            {!projectsLoading &&
              !projectError &&
              visibleProjects.length ===
                0 && (
              <div className="emptyProjects">
                <strong>
                  {projects.length === 0
                    ? "No saved drafts yet"
                    : "No tours match this filter"}
                </strong>

                <p>
                  Create an experience
                  and save it here to
                  continue later.
                </p>
              </div>
            )}

            {!projectsLoading &&
              visibleProjects.map(
              (project) => {
                const choice =
                  routeChoices.find(
                    (item) =>
                      item.id ===
                      project.selectedRouteId
                  );

                return (
                  <article
                    className="projectCard"
                    key={
                      project.id
                    }
                  >
                    {project.coverImage
                      ?.url && (
                      <img
                        className="projectCardCover"
                        src={
                          project.coverImage
                            .url
                        }
                        alt=""
                      />
                    )}

                    {!project.coverImage?.url && (
                      <div className="projectCardPlaceholder" aria-label="Tour image placeholder">
                        <img src="/branding/between-stops-icon.png" alt="" />
                        <div>
                          <small>BETWEEN STOPS</small>
                          <strong>{choice?.label ?? "A new journey"}</strong>
                        </div>
                      </div>
                    )}

                    <div className="projectCardTop">
                      <span className={`draftStatus status-${project.status}`}>
                        {getProjectStatusLabel(
                          project.status
                        )}
                      </span>

                      <small>
                        {new Date(
                          project.updatedAt
                        ).toLocaleDateString(
                          "en-GB"
                        )}
                      </small>
                    </div>

                    <h2>
                      {
                        project.name
                      }
                    </h2>

                    <div className="projectRouteMeta">
                      <span className="routeIdentity">
                        <TransportIcon
                          mode={
                            choice?.route.mode ??
                            "bus"
                          }
                        />
                        {
                          choice?.label
                        }
                      </span>
                      <span>·</span>
                      <span>{project.stories.length} Stories</span>
                      {project.durationMinutes && (
                        <>
                          <span>·</span>
                          <span>About {project.durationMinutes} mins</span>
                        </>
                      )}
                    </div>

                    <div className="projectCardActions">
                      <button
                        className="projectOpen"
                        onClick={() =>
                          openProject(
                            project
                          )
                        }
                      >
                        {project.status === "published"
                          ? "Open tour"
                          : project.status === "paused"
                            ? "View details"
                            : "Open draft"}
                      </button>

                      {project.status === "published" && (
                        <button
                          className="projectPause"
                          onClick={() => pausePublishedProject(project)}
                        >
                          Pause tour
                        </button>
                      )}

                      {project.status === "paused" && (
                        <>
                          <button className="projectRestore" onClick={() => restorePausedProject(project)}>
                            Restore unchanged
                          </button>
                          <button
                            className="projectEdit"
                            onClick={() => editPausedProject(project)}
                          >
                            Edit &amp; resubmit
                          </button>
                        </>
                      )}

                      {(project.status ===
                        "draft" ||
                        project.status ===
                          "changes_requested") && (
                        <button
                          className="projectDelete"
                          onClick={() =>
                            deleteProject(
                              project.id
                            )
                          }
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </article>
                );
              }
            )}
          </div>
        </section>
        <CreatorFooter />
      </main>
    );
  }

  /*
    PROFILE SCREEN
  */

  if (stage === "profile") {
    return (
      <main className="creatorStudioShell">
        <header className="creatorBrandHeader">
          <div>
            <div className="creatorLogo">
              <img
                src="/branding/between-stops-icon.png"
                alt=""
              />
              <span>Between Stops</span>
            </div>

            <p className="creatorAreaLabel">
              Creator profile
            </p>
          </div>

          <button
            className="headerTextButton"
            onClick={() =>
              setStage("projects")
            }
          >
            Projects
          </button>
        </header>

        <section className="marketplaceFormPage">
          <div className="marketplaceFormIntro">
            <p className="creatorKicker">
              YOUR PUBLIC PROFILE
            </p>

            <h1>
              Put a name to the voice
            </h1>

            <p>
              Your name will appear on
              published tours. A photo
              and short biography are
              optional.
            </p>
          </div>

          <div className="marketplaceFormCard">
            {projectError && (
              <p className="marketplaceFormError">
                {projectError}
              </p>
            )}

            <label htmlFor="profile-name">
              Public name
            </label>

            <input
              id="profile-name"
              value={profileName}
              onChange={(event) =>
                setProfileName(
                  event.target.value
                )
              }
              placeholder="e.g. Robert Lucas"
              maxLength={80}
            />

            <label htmlFor="profile-bio">
              Short biography
              <span>Optional</span>
            </label>

            <textarea
              id="profile-bio"
              value={profileBio}
              onChange={(event) =>
                setProfileBio(
                  event.target.value
                )
              }
              placeholder="Tell passengers why you made these tours."
              maxLength={500}
              rows={5}
            />

            <label htmlFor="profile-avatar">
              Profile photograph
              <span>Optional</span>
            </label>

            {profileAvatar?.url && (
              <img
                className="profileAvatarPreview"
                src={profileAvatar.url}
                alt="Current profile"
              />
            )}

            <input
              id="profile-avatar"
              className="marketplaceFileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setPendingAvatarFile(
                  event.target
                    .files?.[0] ??
                    null
                )
              }
            />

            {pendingAvatarFile && (
              <small className="selectedFileName">
                Selected: {pendingAvatarFile.name}
              </small>
            )}

            <p className="marketplaceFormHint">
              JPG, PNG or WebP, up to
              5 MB. A square image works
              best.
            </p>

            <div className="voicePromptSection">
              <div>
                <h2>Guide voice prompts</h2>
                <p>
                  Record these two short clips once. For a
                  Something to spot Story, Between Stops will
                  automatically play the correct clip before
                  the Story audio, including on the return
                  journey.
                </p>
              </div>

              <div className="voicePromptGrid">
                <div className="voicePromptCard">
                  <label htmlFor="profile-left-prompt">
                    Look left
                    <span>MP3, M4A or WAV</span>
                  </label>
                  <p>Suggested words: “Look to your left.”</p>
                  {profileLeftPrompt?.url && (
                    <audio
                      controls
                      preload="metadata"
                      src={profileLeftPrompt.url}
                    />
                  )}
                  <input
                    id="profile-left-prompt"
                    className="marketplaceFileInput"
                    type="file"
                    accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav"
                    onChange={(event) =>
                      setPendingLeftPromptFile(
                        event.target.files?.[0] ?? null
                      )
                    }
                  />
                  <small className="selectedFileName">
                    {pendingLeftPromptFile
                      ? `Selected: ${pendingLeftPromptFile.name}`
                      : profileLeftPrompt
                        ? `Saved: ${profileLeftPrompt.filename}`
                        : "No clip saved yet"}
                  </small>
                </div>

                <div className="voicePromptCard">
                  <label htmlFor="profile-right-prompt">
                    Look right
                    <span>MP3, M4A or WAV</span>
                  </label>
                  <p>Suggested words: “Look to your right.”</p>
                  {profileRightPrompt?.url && (
                    <audio
                      controls
                      preload="metadata"
                      src={profileRightPrompt.url}
                    />
                  )}
                  <input
                    id="profile-right-prompt"
                    className="marketplaceFileInput"
                    type="file"
                    accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav"
                    onChange={(event) =>
                      setPendingRightPromptFile(
                        event.target.files?.[0] ?? null
                      )
                    }
                  />
                  <small className="selectedFileName">
                    {pendingRightPromptFile
                      ? `Selected: ${pendingRightPromptFile.name}`
                      : profileRightPrompt
                        ? `Saved: ${profileRightPrompt.filename}`
                        : "No clip saved yet"}
                  </small>
                </div>
              </div>

              <p className="marketplaceFormHint">
                Each clip can be up to 25 MB. They are only
                required when you submit a tour containing a
                Something to spot Story.
              </p>
            </div>

            <div className="marketplaceFormActions">
              <button
                className="creatorBackButton"
                onClick={() =>
                  setStage(
                    "projects"
                  )
                }
              >
                Cancel
              </button>

              <button
                className="creatorContinueButton inlineContinue"
                disabled={
                  !profileName.trim() ||
                  profileSaving
                }
                onClick={saveProfile}
              >
                {profileSaving
                  ? "Saving…"
                  : "Save profile"}
              </button>
            </div>
          </div>
        </section>
        <CreatorFooter />
      </main>
    );
  }

  /*
    NAME SCREEN
  */

  if (stage === "name") {
    return (
      <main className="creatorStudioShell">
        <header className="creatorBrandHeader">
          <div className="creatorLogo">
            <img
              src="/branding/between-stops-icon.png"
              alt=""
            />
            <span>Between Stops</span>
          </div>

          <button
            className="headerTextButton"
            onClick={() =>
              setStage(
                "projects"
              )
            }
          >
            Projects
          </button>
        </header>

        <section className="nameExperiencePanel">
          <p className="creatorKicker">
            DRAFT EXPERIENCE
          </p>

          <h1>
            Name your experience
          </h1>

          <p>
            This is only a working
            title. You can change it
            until you submit the
            experience for review.
          </p>

          <label>
            Experience name
          </label>

          <input
            value={
              experienceName
            }
            onChange={(event) =>
              setExperienceName(
                event.target.value
              )
            }
            placeholder="e.g. Royal Mile to the Shore"
            autoFocus
          />

          <div className="nameJourneySummary">
            <span>
              {
                selectedChoice.label
              }
            </span>

            <strong>
              {startLabel}
            </strong>

            <i>→</i>

            <strong>
              {endLabel}
            </strong>
          </div>

          <div className="nameActions">
            <button
              className="creatorBackButton"
              onClick={() =>
                setStage("route")
              }
            >
              ← Change journey
            </button>

            <button
              className="creatorContinueButton inlineContinue"
              disabled={
                !experienceName.trim()
              }
              onClick={
                enterStudio
              }
            >
              Create draft
            </button>
          </div>
        </section>
        <CreatorFooter />
      </main>
    );
  }

  /*
    TOUR DETAILS SCREEN
  */

  if (stage === "details") {
    return (
      <main className="creatorStudioShell">
        <header className="creatorBrandHeader">
          <div>
            <div className="creatorLogo">
              <img
                src="/branding/between-stops-icon.png"
                alt=""
              />
              <span>Between Stops</span>
            </div>

            <p className="creatorAreaLabel">
              Tour details
            </p>
          </div>

          <button
            className="headerTextButton"
            onClick={() =>
              setStage("studio")
            }
          >
            Back to Stories
          </button>
        </header>

        <section className="marketplaceFormPage tourDetailsPage">
          <div className="marketplaceFormIntro">
            <p className="creatorKicker">
              PASSENGER VIEW
            </p>

            <h1>
              Present your tour
            </h1>

            <p>
              This information will
              become the public tour
              card and overview. It
              remains private while the
              experience is a draft.
            </p>

          </div>

          <div className="marketplaceFormCard">
            {projectError && (
              <p className="marketplaceFormError">
                {projectError}
              </p>
            )}

            <label htmlFor="tour-title">
              Tour title
            </label>

            <input
              id="tour-title"
              value={experienceName}
              onChange={(event) =>
                setExperienceName(
                  event.target.value
                )
              }
              maxLength={120}
            />

            <label htmlFor="tour-summary">
              Short summary
            </label>

            <textarea
              id="tour-summary"
              value={experienceSummary}
              onChange={(event) =>
                setExperienceSummary(
                  event.target.value
                )
              }
              placeholder="One sentence that helps passengers decide whether to take this tour."
              maxLength={180}
              rows={3}
            />

            <div className="characterCount">
              {experienceSummary.length}/180
            </div>

            <label htmlFor="tour-description">
              Full description
              <span>Optional for now</span>
            </label>

            <textarea
              id="tour-description"
              value={experienceDescription}
              onChange={(event) =>
                setExperienceDescription(
                  event.target.value
                )
              }
              placeholder="Explain what passengers will discover and what makes the journey worthwhile."
              maxLength={1500}
              rows={7}
            />

            <div className="automaticDurationCard">
              <span>Estimated journey time</span>
              <strong>
                About {estimatedJourneyMinutes} mins
              </strong>
              <small>
                Calculated from the selected route, distance,
                transport type and stops. Actual operator times
                can vary with traffic and service changes.
              </small>
            </div>

            <label htmlFor="tour-age-guidance">
              Age guidance
            </label>

            <select
              id="tour-age-guidance"
              value={ageGuidance}
              onChange={(event) =>
                setAgeGuidance(
                  event.target.value as AgeGuidance
                )
              }
            >
              <option value="all_ages">
                Suitable for all ages
              </option>
              <option value="not_for_children">
                Not suitable for children
              </option>
            </select>

            <label htmlFor="tour-access-type">
              Price
            </label>

            <select
              id="tour-access-type"
              value={tourAccessType}
              onChange={(event) => {
                const value =
                  event.target.value as "free" | "paid";

                setTourAccessType(value);

                if (value === "free") {
                  setTourPrice("");
                }
              }}
            >
              <option value="free">Free</option>
              <option value="paid">Paid</option>
            </select>

            {tourAccessType === "paid" && (
              <>
                <label htmlFor="tour-price">
                  Passenger price
                  <span>Minimum £2.99</span>
                </label>

                <input
                  id="tour-price"
                  type="number"
                  min="2.99"
                  step="0.01"
                  inputMode="decimal"
                  value={tourPrice}
                  onChange={(event) =>
                    setTourPrice(event.target.value)
                  }
                  placeholder="2.99"
                  aria-invalid={
                    tourPrice !== "" &&
                    (
                      !Number.isFinite(Number(tourPrice)) ||
                      Number(tourPrice) < 2.99
                    )
                  }
                />

                {tourPrice !== "" &&
                  (
                    !Number.isFinite(Number(tourPrice)) ||
                    Number(tourPrice) < 2.99
                  ) && (
                    <p
                      className="marketplaceFormError"
                      role="alert"
                    >
                      Paid tours must cost at least £2.99.
                    </p>
                  )}

                {Number(tourPrice) >= 2.99 && (
                  <div className="automaticDurationCard">
                    <span>Price split</span>
                    <strong>
                      You receive £
                      {(Number(tourPrice) * 0.75).toFixed(2)}
                    </strong>
                    <small>
                      Between Stops retains 25% of the tour price.
                      Ordinary payment processing is covered from
                      the Between Stops share.
                    </small>
                  </div>
                )}
              </>
            )}

            <label htmlFor="tour-availability">
              Availability
            </label>

            <select
              id="tour-availability"
              value={seasonalAvailability ? "seasonal" : "always"}
              onChange={(event) => {
                const seasonal = event.target.value === "seasonal";
                setSeasonalAvailability(seasonal);
                if (!seasonal) {
                  setAvailableFrom("");
                  setAvailableTo("");
                }
              }}
            >
              <option value="always">Always available</option>
              <option value="seasonal">Available between dates</option>
            </select>

            {seasonalAvailability && (
              <div className="availabilityDates">
                <label htmlFor="available-from">
                  Available from
                  <input
                    id="available-from"
                    type="date"
                    value={availableFrom}
                    onChange={(event) =>
                      setAvailableFrom(event.target.value)
                    }
                  />
                </label>

                <label htmlFor="available-to">
                  Available until
                  <input
                    id="available-to"
                    type="date"
                    min={availableFrom || undefined}
                    value={availableTo}
                    onChange={(event) =>
                      setAvailableTo(event.target.value)
                    }
                  />
                </label>
              </div>
            )}

            <label htmlFor="tour-cover">
              Tour cover image
              <span>Optional for drafts</span>
            </label>

            {coverImage?.url && (
              <img
                className="tourCoverPreview"
                src={coverImage.url}
                alt="Current tour cover"
              />
            )}

            <input
              id="tour-cover"
              className="marketplaceFileInput"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setPendingCoverFile(
                  event.target
                    .files?.[0] ??
                    null
                )
              }
            />

            {pendingCoverFile && (
              <small className="selectedFileName">
                Selected: {pendingCoverFile.name}
              </small>
            )}

            <p className="marketplaceFormHint">
              JPG, PNG or WebP, up to
              10 MB. A wide landscape
              image works best.
            </p>

            <label htmlFor="tour-gallery">
              Additional tour images
              <span>Optional, up to four</span>
            </label>

            <p className="marketplaceFormHint galleryHint">
              Add each picture separately. You can replace or remove any
              slot without affecting the others.
            </p>

            <div className="tourGallerySlots" id="tour-gallery">
              {[0, 1, 2, 3].map((index) => {
                const savedImage = galleryImages[index];
                const pendingFile = pendingGalleryFiles[index];

                return (
                  <div className="tourGallerySlot" key={index}>
                    <span className="gallerySlotNumber">
                      Image {index + 1}
                    </span>

                    {pendingFile ? (
                      <PendingImagePreview file={pendingFile} />
                    ) : savedImage?.url ? (
                      <img src={savedImage.url} alt="" />
                    ) : (
                      <div className="emptyGallerySlot">No image</div>
                    )}

                    <div className="gallerySlotActions">
                      <label>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={(event) => {
                            const file = event.target.files?.[0] ?? null;
                            setPendingGalleryFiles((current) => {
                              const next = [...current];
                              next[index] = file;
                              return next;
                            });
                            event.target.value = "";
                          }}
                        />
                        {savedImage || pendingFile ? "Replace" : "Add image"}
                      </label>

                      {(savedImage || pendingFile) && (
                        <button
                          type="button"
                          onClick={() => {
                            if (pendingFile) {
                              setPendingGalleryFiles((current) => {
                                const next = [...current];
                                next[index] = null;
                                return next;
                              });
                            } else {
                              setGalleryImages((current) =>
                                current.filter((_, itemIndex) => itemIndex !== index)
                              );
                            }
                          }}
                        >
                          {pendingFile && savedImage ? "Cancel" : "Remove"}
                        </button>
                      )}
                    </div>

                    {pendingFile && (
                      <small>{pendingFile.name}</small>
                    )}
                  </div>
                );
              })}
            </div>

            <label className="rightsConfirmation">
              <input
                type="checkbox"
                checked={
                  rightsConfirmed
                }
                onChange={(event) =>
                  setRightsConfirmed(
                    event.target.checked
                  )
                }
              />

              <span>
                I confirm that I own or
                have permission to use
                the text, audio and images
                in this tour.
              </span>
            </label>

            <div className="tourAccessSummary">
              <span>Passenger access</span>
              <strong>
                Free during testing
              </strong>
              <small>
                Pricing will be added
                after the journey has
                been tested with real
                passengers.
              </small>
            </div>

            <div className="marketplaceFormActions">
              <button
                className="creatorBackButton"
                onClick={() =>
                  setStage("studio")
                }
              >
                Cancel
              </button>

              <button
                className="creatorContinueButton inlineContinue"
                disabled={
                  !experienceName.trim() ||
                  detailsSaving ||
                  !canEditActiveProject
                }
                onClick={saveTourDetails}
              >
                {detailsSaving
                  ? "Saving…"
                  : "Save tour details"}
              </button>
            </div>
          </div>
        </section>
        <CreatorFooter />
      </main>
    );
  }

  /*
    STUDIO
  */

  if (stage === "studio") {
    return (
      <main className="creatorStudioShell studioMode">
        <header className="creatorBrandHeader studioBrandHeader">
          <div>
            <div className="creatorLogo">
              <img
                src="/branding/between-stops-icon.png"
                alt=""
              />
              <span>Between Stops</span>
            </div>

            <p className="creatorAreaLabel">
              Creator Studio
            </p>
          </div>

          <div className="studioTopActions">
            {projectError && (
              <span className="saveMessage">
                {projectError}
              </span>
            )}

            {saveMessage && (
              <span className="saveMessage">
                {saveMessage}
              </span>
            )}

            <button
              className="headerTextButton"
              onClick={() => setStage("projects")}
            >
              Back to projects
            </button>

            {projectId && (
              <a
                className="previewExperienceLink"
                href={`/preview?id=${projectId}&from=creator`}
                target="_blank"
                rel="noreferrer"
              >
                Passenger preview
              </a>
            )}

            <button
              className="headerTextButton"
              disabled={!canEditActiveProject}
              onClick={() =>
                saveProject(
                  true
                )
              }
            >
              Save for later
            </button>

            {activeProject?.status === "submitted" ? (
              <button
                className="reviewButton retractButton"
                onClick={retractReview}
              >
                Retract review
              </button>
            ) : (activeProject?.status ===
              "draft" ||
              activeProject?.status ===
                "changes_requested") ? (
              <button
                className="reviewButton"
                onClick={submitForReview}
              >
                Submit for review
              </button>
            ) : (
              <button
                className="reviewButton"
                disabled
              >
                {activeProject
                  ? getProjectStatusLabel(
                      activeProject.status
                    )
                  : "Save before submitting"}
              </button>
            )}
          </div>
        </header>

        <section className="experienceHeader">
          <div className="experienceHeaderMain">
            <div className="experienceStatusRow">
              <span className={`draftStatus status-${activeProject?.status ?? "draft"}`}>
                {activeProject
                  ? getProjectStatusLabel(
                      activeProject.status
                    )
                  : "Draft experience"}
              </span>

              <div className="studioRouteMeta">
                <span className="routeIdentity">
                  <TransportIcon
                    mode={route.mode}
                  />
                  {
                    selectedChoice.label
                  }
                </span>
                <span>· About {estimatedJourneyMinutes} mins</span>
                <span>· {startLabel} → {endLabel}</span>
              </div>
            </div>

            <textarea
              className="experienceTitleInput"
              readOnly={!canEditActiveProject}
              value={
                experienceName
              }
              onChange={(event) =>
                setExperienceName(
                  event.target
                    .value
                )
              }
              aria-label="Experience name"
              rows={2}
            />
          </div>

          <div className="experienceHeaderActions">
            <button
              className="tourDetailsButton"
              onClick={() =>
                setStage(
                  "details"
                )
              }
            >
              Tour details
            </button>

            <button
              className="saveDraftButton"
              disabled={!canEditActiveProject}
              onClick={() =>
                saveProject(
                  false
                )
              }
            >
              {projects.find(
                (project) =>
                  project.id ===
                  projectId
              )?.status ===
              "published"
                ? "Save changes"
                : "Save draft"}
            </button>
          </div>
        </section>

        {activeProject?.status ===
          "changes_requested" && (
          <aside className="reviewNotice">
            <strong>
              Changes requested
            </strong>
            <p>
              {activeProject.reviewNote ||
                "Open the tour details, make the requested updates, then submit it again."}
            </p>
          </aside>
        )}

        <section className="studioWorkspace">
          <aside className="studioSidebar">
            {!draftCoordinates &&
              !editingStoryId && (
                <>
                  <div className="studioSidebarIntro">
                    <p className="creatorKicker">
                      STORIES
                    </p>

                    <h2>
                      Build around the
                      journey
                    </h2>

                    <p>
                      Place a pin on
                      the actual place,
                      building or object
                      your Story is
                      about.
                    </p>
                  </div>

                  <button
                    className={
                      placementMode
                        ? "addStoryButton placing"
                        : "addStoryButton"
                    }
                    onClick={
                      startAddingStory
                    }
                  >
                    {placementMode
                      ? "Click somewhere on the map…"
                      : "+ Add story"}
                  </button>

                  {placementMode && (
                    <button
                      className="cancelPlacementButton"
                      onClick={
                        cancelStory
                      }
                    >
                      Cancel
                    </button>
                  )}

                  {storyTimingWarnings.length > 0 && (
                    <aside className="timingWarningPanel">
                      <strong>
                        {storyTimingWarnings.length === 1
                          ? "1 possible timing overlap"
                          : `${storyTimingWarnings.length} possible timing overlaps`}
                      </strong>
                      <p>
                        These Stories are close enough that the
                        second may have to wait in the audio queue.
                        Shorten the recordings or move the subject
                        pins farther apart if the order feels wrong.
                      </p>
                      <ul>
                        {storyTimingWarnings.slice(0, 4).map((warning) => {
                          const first = stories.find(
                            (story) => story.id === warning.firstStoryId
                          );
                          const second = stories.find(
                            (story) => story.id === warning.secondStoryId
                          );

                          return (
                            <li
                              key={`${warning.direction}-${warning.firstStoryId}-${warning.secondStoryId}`}
                            >
                              {first?.title ?? "Story"} →{" "}
                              {second?.title ?? "Story"}
                              <span>
                                {warning.direction === "forward"
                                  ? "outbound"
                                  : "return"}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    </aside>
                  )}

                  <div className="storyList">
                    <div className="storyListHeading">
                      <span>
                        Stories
                      </span>

                      <strong>
                        {
                          stories.length
                        }
                      </strong>
                    </div>

                    {stories.length ===
                      0 && (
                      <div className="emptyStories">
                        <strong>
                          No Stories yet
                        </strong>

                        <p>
                          Add your first
                          subject pin to
                          begin.
                        </p>
                      </div>
                    )}

                    {stories
                      .slice()
                      .sort(
                        (a, b) =>
                          a.routeProgress -
                          b.routeProgress
                      )
                      .map(
                        (
                          story,
                          index
                        ) => (
                          <button
                            key={
                              story.id
                            }
                            className="storyListItem"
                            onClick={() =>
                              openStoryForEditing(
                                story
                              )
                            }
                          >
                            <span className="storyIndex">
                              {index +
                                1}
                            </span>

                            <span>
                              <strong>
                                {
                                  story.title
                                }
                              </strong>

                              <small>
                                {!story.audio
                                  ? "Draft · Audio needed before submission"
                                  : story.type === "look"
                                    ? `${formatAudioDuration(story.audio.durationSeconds)} · Something to spot`
                                    : story.image
                                      ? `${formatAudioDuration(story.audio.durationSeconds)} · Audio + image`
                                      : `${formatAudioDuration(story.audio.durationSeconds)} · Audio`}
                              </small>
                            </span>
                          </button>
                        )
                      )}
                  </div>
                </>
              )}

            {draftCoordinates && (
              <div className="storyEditor">
                <p className="creatorKicker">
                  {editingStoryId
                    ? "EDIT STORY"
                    : "NEW STORY"}
                </p>

                <h2>
                  {editingStoryId
                    ? "Story details"
                    : "What happens here?"}
                </h2>

                <p className="editorHelp">
                  Place the pin on the
                  actual subject. Trigger
                  timing and left/right
                  behaviour will be worked
                  out separately by the
                  journey engine.
                </p>

                <div className="storyField">
                  <label>
                    Story title
                  </label>

                  <input
                    value={
                      storyTitle
                    }
                    onChange={(
                      event
                    ) =>
                      setStoryTitle(
                        event.target
                          .value
                      )
                    }
                    placeholder="e.g. Scottish Parliament"
                    autoFocus
                  />
                </div>

                <label className="storySpotlightToggle">
                  <input
                    type="checkbox"
                    checked={
                      storyType === "look"
                    }
                    onChange={(event) =>
                      setStoryType(
                        event.target.checked
                          ? "look"
                          : "audio"
                      )
                    }
                  />

                  <span>
                    <strong>
                      Highlight this as something to spot
                    </strong>

                    <small>
                      Use this when the passenger should look out of the window for a particular place or object.
                    </small>
                  </span>
                </label>

                <div className="storyField">
                  <label>
                    Transcript (optional)
                  </label>

                  <textarea
                    value={
                      storyText
                    }
                    onChange={(
                      event
                    ) =>
                      setStoryText(
                        event.target
                          .value
                      )
                    }
                    placeholder="Paste the spoken words from the audio…"
                  />
                </div>

                <div className="mediaUploadRow">
                  <label className="mediaUploadControl">
                    <input
                      type="file"
                      accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/x-wav,.mp3,.m4a,.wav"
                      onChange={(event) => {
                        const file =
                          event.target
                            .files?.[0] ??
                          null;

                        setPendingAudioFile(
                          file
                        );

                        event.target.value =
                          "";
                      }}
                    />

                    <span>
                      🎙{" "}
                      {pendingAudioFile
                        ? "Replace selected audio"
                        : storyAudio
                          ? "Replace audio"
                          : "Upload audio"}
                    </span>
                  </label>

                  <label className="mediaUploadControl">
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
                      onChange={(event) => {
                        const file =
                          event.target
                            .files?.[0] ??
                          null;

                        setPendingImageFile(
                          file
                        );

                        event.target.value =
                          "";
                      }}
                    />

                    <span>
                      ◫{" "}
                      {pendingImageFile
                        ? "Replace selected image"
                        : storyImage
                          ? "Replace image"
                          : "Add image"}
                    </span>
                  </label>
                </div>

                {pendingAudioFile && (
                  <div className="pendingMedia">
                    <span>
                      {
                        pendingAudioFile.name
                      }
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setPendingAudioFile(
                          null
                        )
                      }
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {!pendingAudioFile &&
                  storyAudio && (
                    <div className="savedMedia">
                      <div>
                        <strong>
                          Audio
                        </strong>

                        <span>
                          {
                            storyAudio.filename
                          }
                        </span>
                      </div>

                      {storyAudio.url && (
                        <audio
                          controls
                          preload="metadata"
                          src={
                            storyAudio.url
                          }
                        />
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setStoryAudio(
                            undefined
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  )}

                {pendingImageFile && (
                  <div className="pendingMedia">
                    <span>
                      {
                        pendingImageFile.name
                      }
                    </span>

                    <button
                      type="button"
                      onClick={() =>
                        setPendingImageFile(
                          null
                        )
                      }
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {!pendingImageFile &&
                  storyImage && (
                    <div className="savedMedia imageMedia">
                      {storyImage.url && (
                        <img
                          src={
                            storyImage.url
                          }
                          alt=""
                        />
                      )}

                      <div>
                        <strong>
                          Image
                        </strong>

                        <span>
                          {
                            storyImage.filename
                          }
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={() =>
                          setStoryImage(
                            undefined
                          )
                        }
                      >
                        Remove
                      </button>
                    </div>
                  )}

                <small className="mediaHelpNote">
                  You can save this Story without audio while planning the route. Every Story must have audio before the tour can be submitted. A transcript and image are optional. Draft media is private. Maximum file size: 25 MB.
                </small>

                <div className="editorActions">
                  <button
                    className="creatorContinueButton inlineContinue"
                    disabled={
                      !storyTitle.trim() ||
                      storySaving ||
                      !canEditActiveProject
                    }
                    onClick={
                      saveStory
                    }
                  >
                    {storySaving
                      ? "Saving…"
                      : editingStoryId
                        ? "Save changes"
                        : "Save Story"}
                  </button>

                  <button
                    className="creatorBackButton"
                    onClick={
                      cancelStory
                    }
                  >
                    Cancel
                  </button>
                </div>

                {editingStoryId && (
                  <button
                    className="deleteStoryButton"
                    onClick={
                      deleteStory
                    }
                  >
                    Delete Story
                  </button>
                )}
              </div>
            )}
          </aside>

          <section className="studioMapPanel">
            <div className="studioMapTopbar">
              <div>
                <strong>
                  {startLabel}
                </strong>

                <span>→</span>

                <strong>
                  {endLabel}
                </strong>
              </div>

              <span>
                {
                  selectedSectionStops.length
                }{" "}
                stops
                {` · About ${estimatedJourneyMinutes} mins`}
              </span>
            </div>

            {placementMode && (
              <div className="mapInstruction">
                <strong>
                  Add Story
                </strong>

                <span>
                  Click the actual
                  place or object.
                </span>
              </div>
            )}

            <div
              ref={
                mapContainer
              }
              className={
                placementMode
                  ? "creatorMap studioMap placementCursor"
                  : "creatorMap studioMap"
              }
            />

            <div className="mapFootnote studioFootnote">
              <div className="routeLegendGroup">
                <span className="routeLegend">
                  <i />
                  Experience route
                </span>

                <span className="storyLegend">
                  <b>●</b>
                  Story subject
                </span>

                <span className="stopLegend">
                  <b>●</b>
                  Route stop
                </span>
              </div>

              <span>
                Story order follows
                the route automatically.
              </span>
            </div>
          </section>
        </section>
        <CreatorFooter />
      </main>
    );
  }

  /*
    ROUTE SCREEN
  */

  return (
    <main className="creatorStudioShell">
      <header className="creatorBrandHeader">
        <div>
          <div className="creatorLogo">
            <img
              src="/branding/between-stops-icon.png"
              alt=""
            />
            <span>Between Stops</span>
          </div>

          <p className="creatorAreaLabel">
            Creator
          </p>
        </div>

        <button
          className="headerTextButton"
          onClick={() =>
            setStage(
              "projects"
            )
          }
        >
          Projects
        </button>
      </header>

      <section className="creatorWorkspace">
        <aside className="creatorSidebar">
          <div className="creatorIntro">
            <p className="creatorKicker">
              ROUTE
            </p>

            <h2>
              Where does your story
              travel?
            </h2>

            <p>
              Choose a transport route,
              then decide whether your
              experience uses all of it
              or only part of the
              journey.
            </p>
          </div>

          <div className="creatorField">
            <label>
              City
            </label>

            <select
              value={city}
              disabled
            >
              <option>
                Edinburgh
              </option>
            </select>
          </div>

          <div className="creatorField">
            <label>
              Mode of transport
            </label>

            <select
              value={mode}
              onChange={(
                event
              ) => {
                const nextMode =
                  event.target
                    .value as TransportMode;

                setMode(nextMode);

                const first =
                  routeChoices.find(
                    (choice) =>
                      choice.route
                        .mode ===
                      nextMode
                  );

                if (first) {
                  setSelectedRouteId(
                    first.id
                  );
                }

                setStartStopId("");
                setEndStopId("");

                setSectionMode(
                  "whole"
                );
              }}
            >
              <option value="tram">
                Tram
              </option>

              <option value="bus">
                Bus
              </option>

              <option
                value="train"
                disabled
              >
                Train — coming later
              </option>

              <option
                value="cab"
                disabled
              >
                Cab — coming later
              </option>
            </select>
          </div>

          <div className="creatorField">
            <label>
              Route
            </label>

            <select
              value={
                selectedRouteId
              }
              onChange={(
                event
              ) => {
                setSelectedRouteId(
                  event.target
                    .value
                );

                setStartStopId("");
                setEndStopId("");

                setSectionMode(
                  "whole"
                );
              }}
            >
              {availableRoutes.map(
                (choice) => (
                  <option
                    key={
                      choice.id
                    }
                    value={
                      choice.id
                    }
                  >
                    {
                      choice.label
                    }{" "}
                    —{" "}
                    {
                      choice.description
                    }
                  </option>
                )
              )}
            </select>
          </div>

          <div className="creatorSectionChoice">
            <p className="creatorKicker">
              EXPERIENCE LENGTH
            </p>

            <button
              className={
                sectionMode ===
                "whole"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setSectionMode(
                  "whole"
                )
              }
            >
              <strong>
                Use the whole route
              </strong>

              <span>
                {startLabel} to{" "}
                {endLabel}
              </span>
            </button>

            <button
              className={
                sectionMode ===
                "section"
                  ? "active"
                  : ""
              }
              onClick={() =>
                setSectionMode(
                  "section"
                )
              }
            >
              <strong>
                Choose part of the
                route
              </strong>

              <span>
                Select first and last
                stop.
              </span>
            </button>
          </div>

          {sectionMode ===
            "section" && (
            <div className="sectionSelector">
              <div>
                <label>
                  Start stop
                </label>

                <select
                  value={
                    startStopId
                  }
                  onChange={(
                    event
                  ) =>
                    setStartStopId(
                      event.target
                        .value
                    )
                  }
                >
                  {practicalStops.map(
                    (stop) => (
                      <option
                        key={
                          stop.id
                        }
                        value={
                          stop.id
                        }
                      >
                        {
                          stop.name
                        }
                      </option>
                    )
                  )}
                </select>
              </div>

              <div className="sectionConnector">
                ↓
              </div>

              <div>
                <label>
                  End stop
                </label>

                <select
                  value={
                    endStopId
                  }
                  onChange={(
                    event
                  ) =>
                    setEndStopId(
                      event.target
                        .value
                    )
                  }
                >
                  {practicalStops.map(
                    (stop) => (
                      <option
                        key={
                          stop.id
                        }
                        value={
                          stop.id
                        }
                      >
                        {
                          stop.name
                        }
                      </option>
                    )
                  )}
                </select>
              </div>
            </div>
          )}

          <div className="routeDistanceSummary">
            <span>
              Approximate journey distance
            </span>

            <strong>
              {selectedJourneyDistanceMiles <
              10
                ? selectedJourneyDistanceMiles.toFixed(
                    1
                  )
                : Math.round(
                    selectedJourneyDistanceMiles
                  )}{" "}
              miles
            </strong>

            <small>
              {selectedJourneyDistanceKm.toFixed(
                1
              )}{" "}
              km
              {` · About ${estimatedJourneyMinutes} mins`}
            </small>
            <small>
              Estimated from route distance, transport type and stops.
              Actual operator times may vary.
            </small>
          </div>

          <button
            className="creatorContinueButton"
            disabled={
              sectionMode ===
                "section" &&
              !sectionIsValid
            }
            onClick={
              goToNameStage
            }
          >
            Use this journey
          </button>
        </aside>

        <section className="creatorMapPanel">
          <div className="mapHeader">
            <div>
              <p className="creatorKicker">
                EDINBURGH
              </p>

              <h2>
                {
                  selectedChoice.label
                }
              </h2>

              <p className="mapJourneyLabel">
                {startLabel}{" "}
                <span>→</span>{" "}
                {endLabel}
              </p>
            </div>

            <span>
              <TransportIcon
                mode={route.mode}
              />
              {route.mode === "bus"
                ? "Bus"
                : "Tram"}
            </span>
          </div>

          <div
            ref={mapContainer}
            className="creatorMap"
          />

          <div className="mapFootnote">
            <span className="routeLegend">
              <i />
              Selected journey
            </span>

            <span>
              Pan and zoom to inspect
              the route.
            </span>
          </div>
        </section>
      </section>
      <CreatorFooter />
    </main>
  );
}
