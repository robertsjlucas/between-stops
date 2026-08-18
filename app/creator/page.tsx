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

import { edinburghTramFullRoute } from "@/data/routes/tram-full";
import { route35Full } from "@/data/routes/bus35-full";

import {
  createClient,
} from "@/lib/supabase/client";

import {
  deleteCreatorProject,
  loadBrowserProjects,
  loadCreatorProfile,
  loadCreatorProjects,
  removeMediaFile,
  saveCreatorProfile,
  saveCreatorProject,
  uploadProfileAvatar,
  uploadStoryMedia,
  uploadTourCover,
} from "@/lib/creator-projects";

import type {
  CreatorStory,
  CreatorStoryType,
  CreatorProfile,
  MediaAttachment,
  SavedProject,
  SectionMode,
} from "@/lib/creator-projects";

import type {
  Coordinates,
  RouteDefinition,
  RouteStop,
  TransportMode,
} from "@/lib/types";

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

type RouteChoice = {
  id: string;
  route: RouteDefinition;
  label: string;
  description: string;
};

const routeChoices: RouteChoice[] = [
  {
    id: "tram",
    route: edinburghTramFullRoute,
    label: "Edinburgh Tram",
    description:
      "Edinburgh Airport ⇄ Newhaven",
  },
  {
    id: "35",
    route: route35Full,
    label: "35",
    description:
      "Heriot Watt Campus ⇄ Ocean Terminal",
  },
];

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
    experienceDuration,
    setExperienceDuration,
  ] = useState("");

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

  /*
    MAP
  */

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
              id: "osm",
              type: "raster",
              source: "osm",
            },
          ],
        },

        center: [
          -3.22,
          55.95,
        ],

        zoom: 11,
      });

    mapRef.current = map;

    map.addControl(
      new NavigationControl({
        showCompass: false,
      }),
      "top-right"
    );

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

      if (
        selectedStartStop &&
        selectedEndStop
      ) {
        routeMarkerRefs.current.push(
          new Marker({
            color: "#171717",
          })
            .setLngLat(
              selectedStartStop
                .coordinates
            )
            .addTo(map),

          new Marker({
            color: "#171717",
          })
            .setLngLat(
              selectedEndStop
                .coordinates
            )
            .addTo(map)
        );
      }

      if (
        stage === "studio"
      ) {
        stories.forEach(
          (story) => {
            const wrapper =
              document.createElement(
                "button"
              );

            wrapper.type =
              "button";

            wrapper.className =
              "storyMapPinLabel";

            const dot =
              document.createElement(
                "span"
              );

            dot.className =
              "storyMapDot";

            dot.innerText = "●";

            const label =
              document.createElement(
                "span"
              );

            label.className =
              "storyMapLabel";

            label.innerText =
              story.title;

            wrapper.append(
              dot,
              label
            );

            wrapper.addEventListener(
              "click",
              (event) => {
                event.stopPropagation();

                openStoryForEditing(
                  story
                );
              }
            );

            const marker =
              new Marker({
                element:
                  wrapper,
                anchor:
                  "left",
              })
                .setLngLat(
                  story.subjectCoordinates
                )
                .addTo(map);

            storyMarkerRefs.current.push(
              marker
            );
          }
        );
      }

      if (!bounds.isEmpty()) {
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
            !placementMode
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
    stories,
    placementMode,
  ]);

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
    projectCover = coverImage
  ): SavedProject {
    const existing =
      projects.find(
        (project) =>
          project.id === id
      );

    const parsedDuration =
      Number.parseInt(
        experienceDuration,
        10
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
      durationMinutes:
        Number.isFinite(
          parsedDuration
        ) && parsedDuration > 0
          ? parsedDuration
          : undefined,
      startCoordinates:
        selectedStartStop
          ?.coordinates,
      visibility:
        existing?.visibility ??
        "private",
      accessType:
        existing?.accessType ??
        "free",
      pricePence:
        existing?.pricePence,
      currency:
        existing?.currency ??
        "GBP",
      languageCode:
        existing?.languageCode ??
        "en-GB",
      publishedAt:
        existing?.publishedAt,
      rightsConfirmedAt:
        existing?.rightsConfirmedAt,
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
    setExperienceDuration("");
    setCoverImage(undefined);
    setPendingCoverFile(null);
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

    setExperienceDuration(
      project.durationMinutes
        ? String(
            project.durationMinutes
          )
        : ""
    );

    setCoverImage(
      project.coverImage
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
    if (
      !experienceName.trim()
    ) {
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
    if (
      !experienceName.trim() ||
      detailsSaving
    ) {
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

      let project =
        buildProject(id);

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

        project =
          buildProject(
            id,
            stories,
            uploadedCover
          );

        await saveCreatorProject(
          supabase,
          project
        );

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

        setCoverImage(
          uploadedCover
        );
        setPendingCoverFile(null);
      }

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

      let previousAvatarPath:
        | string
        | undefined;

      if (pendingAvatarFile) {
        previousAvatarPath =
          profileAvatar?.path;

        avatar =
          await uploadProfileAvatar(
            supabase,
            pendingAvatarFile
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
      setPendingAvatarFile(null);
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
      story.type
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
            Between Stops
          </div>

          <div>
            <a href="/">
              Passenger view →
            </a>

            <button
              className="headerTextButton"
              onClick={() =>
                setStage(
                  "profile"
                )
              }
            >
              {creatorProfile
                ? "Your profile"
                : "Create profile"}
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
              CREATOR
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
              projects.length ===
                0 && (
              <div className="emptyProjects">
                <strong>
                  No saved drafts yet
                </strong>

                <p>
                  Create an experience
                  and save it here to
                  continue later.
                </p>
              </div>
            )}

            {!projectsLoading &&
              projects.map(
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

                    <div className="projectCardTop">
                      <span className="draftStatus">
                        Draft
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

                    <p>
                      {
                        choice?.label
                      }{" "}
                      ·{" "}
                      {
                        project.stories.length
                      }{" "}
                      Stories
                    </p>

                    <div className="projectCardActions">
                      <button
                        onClick={() =>
                          openProject(
                            project
                          )
                        }
                      >
                        Open draft →
                      </button>

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
                    </div>
                  </article>
                );
              }
            )}
          </div>
        </section>
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
              Between Stops
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
            Between Stops
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
              Create draft →
            </button>
          </div>
        </section>
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
              Between Stops
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

            <label htmlFor="tour-duration">
              Approximate duration
              <span>Minutes</span>
            </label>

            <input
              id="tour-duration"
              type="number"
              min="1"
              max="600"
              inputMode="numeric"
              value={experienceDuration}
              onChange={(event) =>
                setExperienceDuration(
                  event.target.value
                )
              }
              placeholder="e.g. 35"
            />

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
                  detailsSaving
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
              Between Stops
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
              onClick={() =>
                saveProject(
                  true
                )
              }
            >
              Save for later
            </button>

            <button
              className="reviewButton"
              disabled
            >
              Submit for review
            </button>
          </div>
        </header>

        <section className="experienceHeader">
          <div className="experienceHeaderMain">
            <div className="experienceStatusRow">
              <span className="draftStatus">
                Draft experience
              </span>

              <span>
                {
                  selectedChoice.label
                }{" "}
                · {startLabel} →{" "}
                {endLabel}
              </span>
            </div>

            <input
              className="experienceTitleInput"
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
              onClick={() =>
                saveProject(
                  false
                )
              }
            >
              Save draft
            </button>
          </div>
        </section>

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
                                {story.type ===
                                "look"
                                  ? "Something to spot"
                                  : story.type}
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

                <div className="storyField">
                  <label>
                    Story type
                  </label>

                  <select
                    value={
                      storyType
                    }
                    onChange={(
                      event
                    ) =>
                      setStoryType(
                        event.target
                          .value as CreatorStoryType
                      )
                    }
                  >
                    <option value="audio">
                      Audio
                    </option>

                    <option value="image">
                      Image
                    </option>

                    <option value="look">
                      Something to spot
                    </option>
                  </select>
                </div>

                <div className="storyField">
                  <label>
                    Description / notes
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
                    placeholder="Working notes or Story text…"
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
                  Draft media is private.
                  Maximum file size:
                  25 MB.
                </small>

                <div className="editorActions">
                  <button
                    className="creatorContinueButton inlineContinue"
                    disabled={
                      !storyTitle.trim() ||
                      storySaving
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
              </div>

              <span>
                Story order follows
                the route automatically.
              </span>
            </div>
          </section>
        </section>
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
            Between Stops
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
            Use this journey →
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
    </main>
  );
}
