"use client";

import {
  useEffect,
  useMemo,
  useState,
} from "react";

import "./admin.css";

import {
  TransportIcon,
} from "@/components/transport-icon";
import {
  RecommendationArt,
} from "@/components/recommendation-art";
import {
  routeChoices,
  routesById,
} from "@/data/routes/catalogue";
import {
  createClient,
} from "@/lib/supabase/client";
import type {
  ProjectStatus,
} from "@/lib/creator-projects";
import {
  loadAllDestinationRecommendations,
  recommendationCategories,
  uploadRecommendationPhoto,
  removeRecommendationPhoto,
} from "@/lib/destination-recommendations";
import {
  deletePassengerReview,
  loadAdminPassengerReviews,
  moderatePassengerReview,
} from "@/lib/passenger-reviews";
import type {
  AdminPassengerReview,
  PassengerReviewStatus,
} from "@/lib/passenger-reviews";
import type {
  DestinationRecommendation,
  RecommendationCategory,
  RecommendationPlacement,
} from "@/lib/destination-recommendations";
import {
  loadPlatformAudio,
  platformAudioLabels,
  uploadPlatformAudio,
} from "@/lib/platform-audio";
import type {
  PlatformAudioItem,
  PlatformAudioKey,
} from "@/lib/platform-audio";

import {
  loadHomepageImages,
  uploadHomepageImage,
  removeHomepageImage,
} from "@/lib/homepage-images";

import type {
  HomepageImage,
} from "@/lib/homepage-images";

type ReviewStory = {
  id: string;
  title: string;
  audio_path: string | null;
  image_path: string | null;
};

type ReviewExperience = {
  id: string;
  owner_id: string;
  title: string;
  summary: string;
  route_id: string;
  status: ProjectStatus;
  visibility: string;
  cover_image_path: string | null;
  duration_minutes: number | null;
  rights_confirmed_at: string | null;
  featured_rank: number | null;
  updated_at: string;
  published_at: string | null;
  stories: ReviewStory[];
};

type ReviewProfile = {
  id: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
};

const statusLabels: Record<
  ProjectStatus,
  string
> = {
  draft: "Draft",
  ready_for_review: "Ready for approval",
  submitted: "Awaiting approval",
  changes_requested: "Changes requested",
  approved: "Approved",
  published: "Published",
  paused: "Paused by creator",
  archived: "Archived",
};

type ReviewFilter =
  | "all"
  | "submitted"
  | "approved"
  | "published"
  | "paused"
  | "changes_requested";

type AdminSection =
  | "approvals"
  | "passenger_reviews"
  | "destinations"
  | "homepage_images"
  | "platform_audio"
  | "operations";

type OperationsMetrics = {
  creators: number;
  tours: number;
  published_tours: number;
  stories: number;
  pending_approvals: number;
  pending_reviews: number;
  open_reports: number;
  tours_started: number;
  tours_completed: number;
  recommendation_clicks: number;
  storage_bytes: number;
  storage_by_bucket: Record<string, number>;
};

type RecommendationClick = {
  id: number;
  experience_id: string;
  recommendation_id: string | null;
  user_id: string | null;
  device_token: string | null;
  created_at: string;
};

type PlatformReport = {
  id: string;
  report_type: "issue" | "idea" | "error";
  message: string;
  page_url: string | null;
  reporter_email: string | null;
  status: "new" | "in_progress" | "resolved";
  created_at: string;
};

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

type PassengerReviewFilter =
  | "all"
  | PassengerReviewStatus;

type RecommendationVisibilityFilter =
  | "all"
  | "visible"
  | "hidden";

function normaliseDestinationName(value: string) {
  return value.trim().toLocaleLowerCase("en-GB");
}

function distanceBetweenStopsMetres(
  first: [number, number],
  second: [number, number]
) {
  const earthRadiusMetres = 6371000;
  const toRadians = (value: number) => (value * Math.PI) / 180;
  const latitudeDifference = toRadians(second[1] - first[1]);
  const longitudeDifference = toRadians(second[0] - first[0]);
  const firstLatitude = toRadians(first[1]);
  const secondLatitude = toRadians(second[1]);
  const calculation =
    Math.sin(latitudeDifference / 2) ** 2 +
    Math.cos(firstLatitude) *
      Math.cos(secondLatitude) *
      Math.sin(longitudeDifference / 2) ** 2;

  return 2 * earthRadiusMetres * Math.asin(Math.sqrt(calculation));
}

export default function AdminPage() {
  const [experiences, setExperiences] =
    useState<ReviewExperience[]>([]);
  const [profiles, setProfiles] =
    useState<Record<string, ReviewProfile>>({});
  const [coverUrls, setCoverUrls] =
    useState<Record<string, string>>({});
  const [filter, setFilter] =
    useState<ReviewFilter>("submitted");
  const [notes, setNotes] =
    useState<Record<string, string>>({});
  const [ranks, setRanks] =
    useState<Record<string, string>>({});
  const [loading, setLoading] =
    useState(true);
  const [busyId, setBusyId] =
    useState<string | null>(null);
  const [error, setError] =
    useState("");
  const [accessDenied, setAccessDenied] =
    useState(false);
  const [adminSection, setAdminSection] =
    useState<AdminSection>("approvals");
  const [passengerReviews, setPassengerReviews] =
    useState<AdminPassengerReview[]>([]);
  const [passengerReviewFilter, setPassengerReviewFilter] =
    useState<PassengerReviewFilter>("pending");
  const [recommendations, setRecommendations] =
    useState<DestinationRecommendation[]>([]);
  const [editingRecommendationId, setEditingRecommendationId] =
    useState<string | null>(null);
  const [recommendationRouteId, setRecommendationRouteId] =
    useState(routeChoices[0]?.route.id ?? "");
  const [recommendationStopId, setRecommendationStopId] =
    useState(routeChoices[0]?.route.stops?.[0]?.id ?? "");
  const [recommendationTitle, setRecommendationTitle] =
    useState("");
  const [recommendationCategory, setRecommendationCategory] =
    useState<RecommendationCategory>("attraction");
  const [recommendationSummary, setRecommendationSummary] =
    useState("");
  const [recommendationUrl, setRecommendationUrl] =
    useState("");
  const [recommendationPlacement, setRecommendationPlacement] =
    useState<RecommendationPlacement>("editorial");
  const [recommendationOrder, setRecommendationOrder] =
    useState("100");
  const [recommendationActive, setRecommendationActive] =
    useState(true);
  const [pendingRecommendationPhoto, setPendingRecommendationPhoto] =
    useState<File | null>(null);
  const [recommendationDestinationFilter, setRecommendationDestinationFilter] =
    useState("all");
  const [recommendationCategoryFilter, setRecommendationCategoryFilter] =
    useState<"all" | RecommendationCategory>("all");
  const [recommendationVisibilityFilter, setRecommendationVisibilityFilter] =
    useState<RecommendationVisibilityFilter>("all");
  const [recommendationSearch, setRecommendationSearch] =
    useState("");
  const [operationsMetrics, setOperationsMetrics] =
    useState<OperationsMetrics | null>(null);
  const [platformReports, setPlatformReports] =
    useState<PlatformReport[]>([]);
  const [recommendationClicks, setRecommendationClicks] =
    useState<RecommendationClick[]>([]);
  const [platformAudio, setPlatformAudio] =
    useState<PlatformAudioItem[]>([]);
  const [pendingPlatformAudio, setPendingPlatformAudio] =
    useState<Partial<Record<PlatformAudioKey, File>>>({});

  const [homepageImages, setHomepageImages] =
    useState<HomepageImage[]>([]);

  const [editingHomepageImageId, setEditingHomepageImageId] =
    useState<string | null>(null);

  const [homepageImageCity, setHomepageImageCity] =
    useState("Edinburgh");

  const [homepageImageAlt, setHomepageImageAlt] =
    useState("");

  const [homepageImageHero, setHomepageImageHero] =
    useState(false);

  const [homepageImageActive, setHomepageImageActive] =
    useState(true);

  const [homepageImageOrder, setHomepageImageOrder] =
    useState("100");

  const [pendingHomepageImage, setPendingHomepageImage] =
    useState<File | null>(null);

  const busRouteStops = useMemo(() => {
    return routeChoices
      .filter((choice) => choice.route.mode === "bus")
      .flatMap((choice) =>
        (choice.route.stops ?? []).map((stop) => ({
          routeLabel: choice.route.number ?? choice.label,
          stopName: stop.name,
          coordinates: stop.coordinates,
        }))
      );
  }, []);

  async function loadQueue() {
    const supabase = createClient();
    setLoading(true);
    setError("");

    const { data: userData } =
      await supabase.auth.getUser();

    if (!userData.user) {
      window.location.href = "/login";
      return;
    }

    const {
      data: membership,
      error: membershipError,
    } = await supabase
      .from("platform_admins")
      .select("user_id")
      .maybeSingle();

    if (membershipError || !membership) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    const recommendationRows =
      await loadAllDestinationRecommendations(
        supabase
      );

    const platformAudioRows =
      await loadPlatformAudio(supabase);

    const homepageImageRows =
      await loadHomepageImages(
        supabase,
        {
          includeInactive: true,
        }
      );

    const passengerReviewRows =
      await loadAdminPassengerReviews(supabase);

    const [
      { data: metricsData, error: metricsError },
      { data: reportData, error: reportError },
      { data: clickData, error: clickError },
    ] =
      await Promise.all([
        supabase.rpc("get_admin_operations_metrics"),
        supabase
          .from("platform_reports")
          .select("id, report_type, message, page_url, reporter_email, status, created_at")
          .order("created_at", { ascending: false })
          .limit(100),
        supabase
          .from("tour_analytics_events")
          .select("id, experience_id, recommendation_id, user_id, device_token, created_at")
          .eq("event_type", "recommendation_clicked")
          .order("created_at", { ascending: false })
          .limit(100),
      ]);

    if (metricsError) throw metricsError;
    if (reportError) throw reportError;
    if (clickError) throw clickError;

    const {
      data: experienceData,
      error: experienceError,
    } = await supabase
      .from("experiences")
      .select(`
        id,
        owner_id,
        title,
        summary,
        route_id,
        status,
        visibility,
        cover_image_path,
        duration_minutes,
        rights_confirmed_at,
        featured_rank,
        updated_at,
        published_at,
        stories (
          id,
          title,
          audio_path,
          image_path
        )
      `)
      .order("updated_at", {
        ascending: false,
      });

    if (experienceError) {
      throw experienceError;
    }

    const rows = ((experienceData ?? []) as ReviewExperience[]).map((row) =>
      row.status === "published" && row.visibility === "private"
        ? { ...row, status: "paused" as ProjectStatus }
        : row
    );
    const ownerIds = Array.from(
      new Set(rows.map((row) => row.owner_id))
    );
    let profileRows: ReviewProfile[] = [];

    if (ownerIds.length > 0) {
      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("creator_profiles")
        .select("id, display_name, bio, avatar_path")
        .in("id", ownerIds);

      if (profileError) {
        throw profileError;
      }

      profileRows =
        (profileData ?? []) as ReviewProfile[];
    }

    const paths = rows
      .map((row) => row.cover_image_path)
      .filter((path): path is string => Boolean(path));
    const nextCoverUrls: Record<string, string> = {};

    if (paths.length > 0) {
      const {
        data: signedData,
        error: signedError,
      } = await supabase.storage
        .from("tour-media")
        .createSignedUrls(paths, 60 * 60);

      if (signedError) {
        throw signedError;
      }

      (signedData ?? []).forEach((item, index) => {
        if (item.signedUrl) {
          nextCoverUrls[paths[index]] = item.signedUrl;
        }
      });
    }

    setExperiences(rows);
    setProfiles(
      Object.fromEntries(
        profileRows.map((profile) => [profile.id, profile])
      )
    );
    setCoverUrls(nextCoverUrls);
    setRecommendations(recommendationRows);
    setPlatformAudio(platformAudioRows);
    setHomepageImages(homepageImageRows);
    setPassengerReviews(passengerReviewRows);
    setOperationsMetrics(metricsData as OperationsMetrics);
    setPlatformReports((reportData ?? []) as PlatformReport[]);
    setRecommendationClicks((clickData ?? []) as RecommendationClick[]);
    setRanks(
      Object.fromEntries(
        rows.map((row) => [
          row.id,
          row.featured_rank
            ? String(row.featured_rank)
            : "",
        ])
      )
    );
    setAccessDenied(false);
    setLoading(false);
  }

  useEffect(() => {
    void loadQueue().catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The approval queue could not be loaded."
      );
      setLoading(false);
    });
  }, []);

  async function reviewExperience(
    experienceId: string,
    status: "approved" | "changes_requested" | "published"
  ) {
    const note = notes[experienceId]?.trim() ?? "";

    if (status === "changes_requested" && !note) {
      window.alert("Add a clear note for the creator first.");
      return;
    }

    setBusyId(experienceId);
    setError("");

    try {
      const supabase = createClient();
      const { error: reviewError } = await supabase.rpc(
        "admin_review_experience",
        {
          p_experience_id: experienceId,
          p_status: status,
          p_note: note || null,
        }
      );

      if (reviewError) {
        throw reviewError;
      }

      setNotes((current) => ({
        ...current,
        [experienceId]: "",
      }));
      await loadQueue();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "The approval decision could not be saved."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function saveFeaturedRank(experienceId: string) {
    const value = ranks[experienceId]?.trim() ?? "";
    const parsed = value ? Number.parseInt(value, 10) : null;

    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) {
      window.alert("Use a whole number of 1 or higher, or leave it blank.");
      return;
    }

    setBusyId(experienceId);
    setError("");

    try {
      const supabase = createClient();
      const { error: rankError } = await supabase.rpc(
        "admin_set_featured_rank",
        {
          p_experience_id: experienceId,
          p_featured_rank: parsed,
        }
      );

      if (rankError) {
        throw rankError;
      }

      await loadQueue();
    } catch (rankError) {
      setError(
        rankError instanceof Error
          ? rankError.message
          : "The featured position could not be saved."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function setPassengerReviewStatus(
    reviewId: string,
    moderationStatus: PassengerReviewStatus
  ) {
    setBusyId(reviewId);
    setError("");

    try {
      await moderatePassengerReview(
        createClient(),
        reviewId,
        moderationStatus
      );
      await loadQueue();
    } catch (moderationError) {
      setError(
        moderationError instanceof Error
          ? moderationError.message
          : "The passenger review could not be updated."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function setPlatformReportStatus(
    reportId: string,
    status: PlatformReport["status"]
  ) {
    setBusyId(reportId);
    const { error: updateError } = await createClient()
      .from("platform_reports")
      .update({
        status,
        resolved_at: status === "resolved" ? new Date().toISOString() : null,
      })
      .eq("id", reportId);

    if (updateError) setError(updateError.message);
    else await loadQueue();
    setBusyId(null);
  }

  async function savePlatformAudio(
    key: PlatformAudioKey
  ) {
    const file = pendingPlatformAudio[key];

    if (!file) {
      setError("Choose an audio file first.");
      return;
    }

    setBusyId(`platform-audio-${key}`);
    setError("");

    try {
      const supabase = createClient();
      const { data: userData } =
        await supabase.auth.getUser();

      if (!userData.user) {
        throw new Error(
          "Your administrator session has expired."
        );
      }

      await uploadPlatformAudio(
        supabase,
        key,
        file,
        userData.user.id
      );

      const rows =
        await loadPlatformAudio(supabase);

      setPlatformAudio(rows);
      setPendingPlatformAudio((current) => {
        const updated = { ...current };
        delete updated[key];
        return updated;
      });
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The platform audio could not be saved."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function resetTourAnalytics() {
    if (!window.confirm("Reset all tour starts, completions and recommendation clicks? This cannot be undone.")) return;
    if (window.prompt("Type RESET to confirm") !== "RESET") return;

    setBusyId("analytics-reset");
    const { error: resetError } = await createClient().rpc("admin_reset_tour_analytics");
    if (resetError) setError(resetError.message);
    else await loadQueue();
    setBusyId(null);
  }

  async function removePassengerReview(
    review: AdminPassengerReview
  ) {
    if (!window.confirm("Delete this rating and written review permanently?")) {
      return;
    }

    setBusyId(review.id);
    setError("");

    try {
      await deletePassengerReview(createClient(), review.id);
      await loadQueue();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The passenger review could not be deleted."
      );
    } finally {
      setBusyId(null);
    }
  }

  function resetRecommendationForm() {
    setEditingRecommendationId(null);
    setRecommendationTitle("");
    setRecommendationCategory("attraction");
    setRecommendationSummary("");
    setRecommendationUrl("");
    setRecommendationPlacement("editorial");
    setRecommendationOrder("100");
    setRecommendationActive(true);
    setPendingRecommendationPhoto(null);
  }

  function editRecommendation(
    recommendation: DestinationRecommendation
  ) {
    setAdminSection("destinations");
    setEditingRecommendationId(recommendation.id);
    setRecommendationRouteId(recommendation.routeId);
    setRecommendationStopId(recommendation.stopId);
    setRecommendationTitle(recommendation.title);
    setRecommendationCategory(recommendation.category);
    setRecommendationSummary(recommendation.summary);
    setRecommendationUrl(recommendation.url ?? "");
    setRecommendationPlacement(recommendation.placementType);
    setRecommendationOrder(String(recommendation.displayOrder));
    setRecommendationActive(recommendation.isActive);
    setPendingRecommendationPhoto(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveRecommendation() {
    const title = recommendationTitle.trim();
    const category = recommendationCategory;
    const summary = recommendationSummary.trim();
    const url = recommendationUrl.trim();
    const displayOrder = Number.parseInt(
      recommendationOrder,
      10
    );

    if (!recommendationRouteId || !recommendationStopId) {
      window.alert("Choose a route and destination stop.");
      return;
    }

    if (!title || !summary) {
      window.alert("Add a name, category and description.");
      return;
    }

    if (url) {
      try {
        const parsedUrl = new URL(url);
        if (!["http:", "https:"].includes(parsedUrl.protocol)) {
          throw new Error("Unsupported link");
        }
      } catch {
        window.alert("Add a complete web link beginning with https://, or leave it blank.");
        return;
      }
    }

    if (!Number.isFinite(displayOrder) || displayOrder < 1) {
      window.alert("Display order must be a whole number of 1 or higher.");
      return;
    }

    const recommendationId =
      editingRecommendationId ?? crypto.randomUUID();
    setBusyId(recommendationId);
    setError("");

    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        throw new Error("Your administrator session has expired.");
      }

      const existingRecommendation = recommendations.find(
        (item) => item.id === recommendationId
      );
      const uploadedPhoto = pendingRecommendationPhoto
        ? await uploadRecommendationPhoto(
            supabase,
            recommendationId,
            pendingRecommendationPhoto
          )
        : undefined;

      const { error: saveError } = await supabase
        .from("destination_recommendations")
        .upsert({
          id: recommendationId,
          route_id: recommendationRouteId,
          stop_id: recommendationStopId,
          title,
          category,
          summary,
          url: url || null,
          placement_type: recommendationPlacement,
          display_order: displayOrder,
          is_active: recommendationActive,
          created_by: userData.user.id,
          image_path:
            uploadedPhoto?.path ??
            existingRecommendation?.imagePath ??
            null,
          image_filename:
            uploadedPhoto?.filename ??
            existingRecommendation?.imageFilename ??
            null,
          image_mime_type:
            uploadedPhoto?.mimeType ??
            existingRecommendation?.imageMimeType ??
            null,
          image_size_bytes:
            uploadedPhoto?.sizeBytes ??
            existingRecommendation?.imageSizeBytes ??
            null,
          updated_at: new Date().toISOString(),
        });

      if (saveError) throw saveError;

      if (
        uploadedPhoto &&
        existingRecommendation?.imagePath &&
        existingRecommendation.imagePath !== uploadedPhoto.path
      ) {
        await removeRecommendationPhoto(
          supabase,
          existingRecommendation.imagePath
        );
      }

      resetRecommendationForm();
      await loadQueue();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The recommendation could not be saved."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function setRecommendationVisibility(
    recommendation: DestinationRecommendation
  ) {
    setBusyId(recommendation.id);
    setError("");

    try {
      const { error: updateError } = await createClient()
        .from("destination_recommendations")
        .update({
          is_active: !recommendation.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", recommendation.id);

      if (updateError) throw updateError;
      await loadQueue();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "The recommendation could not be updated."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRecommendation(
    recommendation: DestinationRecommendation
  ) {
    if (!window.confirm(`Delete “${recommendation.title}”?`)) {
      return;
    }

    setBusyId(recommendation.id);
    setError("");

    try {
      const { error: deleteError } = await createClient()
        .from("destination_recommendations")
        .delete()
        .eq("id", recommendation.id);

      if (deleteError) throw deleteError;
      if (recommendation.imagePath) {
        await removeRecommendationPhoto(
          createClient(),
          recommendation.imagePath
        );
      }
      if (editingRecommendationId === recommendation.id) {
        resetRecommendationForm();
      }
      await loadQueue();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The recommendation could not be deleted."
      );
    } finally {
      setBusyId(null);
    }
  }

  function normaliseHomepageCity(
    value: string
  ) {
    const trimmed =
      value.trim().replace(/\s+/g, " ");

    if (
      trimmed.toLocaleLowerCase("en-GB") ===
      "global"
    ) {
      return "Global";
    }

    return trimmed
      .split(" ")
      .map((word) =>
        word.length > 0
          ? word.charAt(0).toUpperCase() +
            word.slice(1).toLocaleLowerCase("en-GB")
          : word
      )
      .join(" ");
  }

  function resetHomepageImageForm() {
    setEditingHomepageImageId(null);
    setHomepageImageCity("Edinburgh");
    setHomepageImageAlt("");
    setHomepageImageHero(false);
    setHomepageImageActive(true);
    setHomepageImageOrder("100");
    setPendingHomepageImage(null);
  }

  function editHomepageImage(
    image: HomepageImage
  ) {
    setAdminSection("homepage_images");
    setEditingHomepageImageId(image.id);
    setHomepageImageCity(image.city);
    setHomepageImageAlt(image.altText);
    setHomepageImageHero(image.isHero);
    setHomepageImageActive(image.isActive);
    setHomepageImageOrder(
      String(image.displayOrder)
    );
    setPendingHomepageImage(null);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  async function saveHomepageImage() {
    const city =
      normaliseHomepageCity(
        homepageImageCity
      );

    const altText =
      homepageImageAlt.trim();

    const displayOrder =
      Number.parseInt(
        homepageImageOrder,
        10
      );

    if (!city) {
      window.alert(
        "Add a city or choose Global."
      );
      return;
    }

    if (
      !Number.isFinite(displayOrder) ||
      displayOrder < 1
    ) {
      window.alert(
        "Display order must be a whole number of 1 or higher."
      );
      return;
    }

    const imageId =
      editingHomepageImageId ??
      crypto.randomUUID();

    const existing =
      homepageImages.find(
        (image) => image.id === imageId
      );

    if (
      !pendingHomepageImage &&
      !existing?.imagePath
    ) {
      window.alert(
        "Choose an image to upload."
      );
      return;
    }

    setBusyId(
      `homepage-${imageId}`
    );
    setError("");

    try {
      const supabase =
        createClient();

      const uploadedPath =
        pendingHomepageImage
          ? await uploadHomepageImage(
              supabase,
              imageId,
              pendingHomepageImage
            )
          : undefined;

      if (homepageImageHero) {
        const {
          error: heroError,
        } = await supabase
          .from("homepage_images")
          .update({
            is_hero: false,
            updated_at:
              new Date().toISOString(),
          })
          .eq("city", city)
          .neq("id", imageId);

        if (heroError) {
          throw heroError;
        }
      }

      const {
        error: saveError,
      } = await supabase
        .from("homepage_images")
        .upsert({
          id: imageId,
          city,
          image_path:
            uploadedPath ??
            existing?.imagePath,
          alt_text: altText,
          is_hero:
            homepageImageHero,
          is_active:
            homepageImageActive,
          display_order:
            displayOrder,
          updated_at:
            new Date().toISOString(),
        });

      if (saveError) {
        throw saveError;
      }

      if (
        uploadedPath &&
        existing?.imagePath &&
        existing.imagePath !==
          uploadedPath
      ) {
        await removeHomepageImage(
          supabase,
          existing.imagePath
        );
      }

      resetHomepageImageForm();
      await loadQueue();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The homepage image could not be saved."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function toggleHomepageImage(
    image: HomepageImage
  ) {
    setBusyId(
      `homepage-${image.id}`
    );
    setError("");

    try {
      const {
        error: updateError,
      } = await createClient()
        .from("homepage_images")
        .update({
          is_active:
            !image.isActive,
          updated_at:
            new Date().toISOString(),
        })
        .eq("id", image.id);

      if (updateError) {
        throw updateError;
      }

      await loadQueue();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "The homepage image could not be updated."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteHomepageImage(
    image: HomepageImage
  ) {
    if (
      !window.confirm(
        `Delete this ${image.city} homepage image?`
      )
    ) {
      return;
    }

    setBusyId(
      `homepage-${image.id}`
    );
    setError("");

    try {
      const supabase =
        createClient();

      const {
        error: deleteError,
      } = await supabase
        .from("homepage_images")
        .delete()
        .eq("id", image.id);

      if (deleteError) {
        throw deleteError;
      }

      await removeHomepageImage(
        supabase,
        image.imagePath
      );

      if (
        editingHomepageImageId ===
        image.id
      ) {
        resetHomepageImageForm();
      }

      await loadQueue();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The homepage image could not be deleted."
      );
    } finally {
      setBusyId(null);
    }
  }

  if (accessDenied) {
    return (
      <main className="adminShell adminMessage">
        <img src="/branding/between-stops-icon.png" alt="" />
        <h1>Administrator access only</h1>
        <p>This account is not an administrator.</p>
        <a href="/creator">Return to Creator Studio</a>
      </main>
    );
  }

  const visibleExperiences = experiences.filter(
    (experience) =>
      filter === "all" || experience.status === filter
  );
  const visiblePassengerReviews = passengerReviews.filter(
    (review) =>
      passengerReviewFilter === "all" ||
      review.moderationStatus === passengerReviewFilter
  );
  const recommendationRoute =
    routesById[recommendationRouteId];
  const recommendationStops =
    recommendationRoute?.stops ?? [];
  const recommendationDestinationOptions = Array.from(
    new Set(
      recommendations
        .map((recommendation) => {
          const itemRoute = routesById[recommendation.routeId];
          return itemRoute?.stops?.find(
            (stop) => stop.id === recommendation.stopId
          )?.name;
        })
        .filter((name): name is string => Boolean(name))
    )
  ).sort((first, second) => first.localeCompare(second, "en-GB"));
  const visibleRecommendations = recommendations.filter((recommendation) => {
    const itemRoute = routesById[recommendation.routeId];
    const itemStop = itemRoute?.stops?.find(
      (stop) => stop.id === recommendation.stopId
    );
    const destinationMatches =
      recommendationDestinationFilter === "all" ||
      itemStop?.name === recommendationDestinationFilter;
    const categoryMatches =
      recommendationCategoryFilter === "all" ||
      recommendation.category === recommendationCategoryFilter;
    const visibilityMatches =
      recommendationVisibilityFilter === "all" ||
      (recommendationVisibilityFilter === "visible"
        ? recommendation.isActive
        : !recommendation.isActive);
    const search = recommendationSearch.trim().toLocaleLowerCase("en-GB");
    const searchMatches =
      !search ||
      recommendation.title.toLocaleLowerCase("en-GB").includes(search) ||
      recommendation.summary.toLocaleLowerCase("en-GB").includes(search) ||
      Boolean(itemStop?.name.toLocaleLowerCase("en-GB").includes(search));

    return destinationMatches && categoryMatches && visibilityMatches && searchMatches;
  });

  return (
    <main className="adminShell">
      <header className="adminHeader">
        <a className="adminBrand" href="/">
          <img src="/branding/between-stops-icon.png" alt="" />
          <span>Between Stops</span>
        </a>

        <nav>
          <a href="/creator">Creator Studio</a>
          <a href="/">Passenger view</a>
        </nav>
      </header>

      <section className="adminIntro">
        <p>ADMIN</p>
        <h1>
          {adminSection === "approvals"
            ? "Tour approvals"
            : adminSection === "passenger_reviews"
              ? "Passenger reviews"
              : adminSection === "destinations"
                ? "Things to do here"
                : adminSection === "homepage_images"
                  ? "Homepage images"
                  : adminSection === "platform_audio"
                    ? "Platform audio"
                    : "Platform operations"}
        </h1>
        <span>
          {adminSection === "approvals"
            ? "Approve the content first, then publish it when it is ready for passengers."
            : adminSection === "passenger_reviews"
              ? "Approve written comments before they appear publicly, or remove abusive submissions entirely."
              : adminSection === "destinations"
                ? "Manage the recommendations passengers see when they finish at a destination."
                : adminSection === "homepage_images"
                  ? "Manage the platform-owned photography used on public landing pages, organised by city."
                  : adminSection === "platform_audio"
                    ? "Manage the shared announcements used across Between Stops tours."
                    : "See platform activity, stored uploads, errors and reports in one place."}
        </span>
      </section>

      <div className="adminSectionTabs">
        <button
          className={adminSection === "approvals" ? "active" : ""}
          onClick={() => setAdminSection("approvals")}
        >
          Tour approvals
        </button>
        <button
          className={adminSection === "passenger_reviews" ? "active" : ""}
          onClick={() => setAdminSection("passenger_reviews")}
        >
          Passenger reviews
        </button>
        <button
          className={adminSection === "destinations" ? "active" : ""}
          onClick={() => setAdminSection("destinations")}
        >
          Destination recommendations
        </button>
        <button
          className={adminSection === "homepage_images" ? "active" : ""}
          onClick={() => setAdminSection("homepage_images")}
        >
          Homepage images
        </button>

        <button
          className={adminSection === "platform_audio" ? "active" : ""}
          onClick={() => setAdminSection("platform_audio")}
        >
          Platform audio
        </button>
        <button
          className={adminSection === "operations" ? "active" : ""}
          onClick={() => setAdminSection("operations")}
        >
          Operations
        </button>
      </div>

      {error && <div className="adminError">{error}</div>}

      {adminSection === "approvals" && (
        <>

      <div className="adminFilters" aria-label="Approval queue filters">
        {([
          ["submitted", "Awaiting approval"],
          ["approved", "Approved"],
          ["published", "Published"],
          ["paused", "Paused by creators"],
          ["changes_requested", "Changes requested"],
          ["all", "All"],
        ] as [ReviewFilter, string][]).map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="adminEmpty">Loading approval queue…</div>
      ) : visibleExperiences.length === 0 ? (
        <div className="adminEmpty">Nothing in this part of the queue.</div>
      ) : (
        <section className="reviewGrid">
          {visibleExperiences.map((experience) => {
            const route = routesById[experience.route_id];
            const profile = profiles[experience.owner_id];
            const busy = busyId === experience.id;

            return (
              <article className="reviewCard" key={experience.id}>
                <div className="reviewCover">
                  {experience.cover_image_path && coverUrls[experience.cover_image_path] ? (
                    <img
                      src={coverUrls[experience.cover_image_path]}
                      alt=""
                    />
                  ) : (
                    <span>No cover image</span>
                  )}
                  <b>{statusLabels[experience.status]}</b>
                </div>

                <div className="reviewBody">
                  <p className="reviewCreator">
                    Created by {profile?.display_name || "Unnamed creator"}
                  </p>
                  <h2>{experience.title}</h2>
                  <p className="reviewSummary">{experience.summary || "No summary supplied."}</p>

                  <div className="reviewFacts">
                    <span>
                      {route && <TransportIcon mode={route.mode} />}
                      {route?.number ?? route?.name ?? experience.route_id}
                    </span>
                    <span>About {experience.duration_minutes ?? "—"} mins</span>
                    <span>{experience.stories?.length ?? 0} Stories</span>
                    <span>{experience.rights_confirmed_at ? "Rights confirmed" : "Rights not confirmed"}</span>
                  </div>

                  <textarea
                    value={notes[experience.id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [experience.id]: event.target.value,
                      }))
                    }
                    placeholder="Approval note for the creator"
                    rows={3}
                  />

                  <div className="reviewActions">
                    <a
                      className="reviewPreviewLink"
                      href={`/preview?id=${experience.id}&from=admin`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Preview tour and audio
                    </a>
                    {experience.status === "submitted" && (
                      <button disabled={busy} onClick={() => reviewExperience(experience.id, "approved")}>Approve</button>
                    )}
                    {(experience.status === "submitted" || experience.status === "approved") && (
                      <button className="secondary" disabled={busy} onClick={() => reviewExperience(experience.id, "changes_requested")}>Request changes</button>
                    )}
                    {experience.status === "approved" && (
                      <button disabled={busy} onClick={() => reviewExperience(experience.id, "published")}>Publish</button>
                    )}
                    {experience.status === "published" && (
                      <button className="secondary" disabled={busy} onClick={() => reviewExperience(experience.id, "approved")}>Unpublish</button>
                    )}
                  </div>

                  {experience.status === "published" && (
                    <div className="featuredControl">
                      <label htmlFor={`rank-${experience.id}`}>Featured position</label>
                      <input
                        id={`rank-${experience.id}`}
                        type="number"
                        min="1"
                        value={ranks[experience.id] ?? ""}
                        onChange={(event) =>
                          setRanks((current) => ({
                            ...current,
                            [experience.id]: event.target.value,
                          }))
                        }
                        placeholder="Not featured"
                      />
                      <button disabled={busy} onClick={() => saveFeaturedRank(experience.id)}>Save</button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
        </>
      )}

      {adminSection === "passenger_reviews" && (
        <>
          <div className="adminFilters" aria-label="Passenger review filters">
            {([
              ["pending", "Awaiting approval"],
              ["approved", "Published"],
              ["hidden", "Hidden"],
              ["all", "All"],
            ] as [PassengerReviewFilter, string][]).map(([value, label]) => (
              <button
                key={value}
                className={passengerReviewFilter === value ? "active" : ""}
                onClick={() => setPassengerReviewFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="adminEmpty">Loading passenger reviews…</div>
          ) : visiblePassengerReviews.length === 0 ? (
            <div className="adminEmpty">No passenger reviews in this section.</div>
          ) : (
            <section className="passengerReviewGrid">
              {visiblePassengerReviews.map((review) => {
                const busy = busyId === review.id;

                return (
                  <article className="passengerReviewCard" key={review.id}>
                    <div className="passengerReviewTopline">
                      <span aria-label={`${review.rating} out of 5 stars`}>
                        {"★".repeat(review.rating)}
                        <i>{"★".repeat(5 - review.rating)}</i>
                      </span>
                      <b>{review.moderationStatus}</b>
                    </div>

                    <h2>{review.experienceTitle}</h2>
                    <p className={review.reviewText ? "" : "ratingOnly"}>
                      {review.reviewText || "Rating only — no written comment."}
                    </p>
                    <small>
                      Submitted {new Date(review.createdAt).toLocaleDateString(
                        "en-GB",
                        { day: "numeric", month: "short", year: "numeric" }
                      )}
                    </small>

                    <div className="passengerReviewActions">
                      {review.moderationStatus !== "approved" && review.reviewText && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void setPassengerReviewStatus(review.id, "approved")
                          }
                        >
                          Approve comment
                        </button>
                      )}
                      {review.moderationStatus !== "hidden" && review.reviewText && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void setPassengerReviewStatus(review.id, "hidden")
                          }
                        >
                          Hide comment
                        </button>
                      )}
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => void removePassengerReview(review)}
                      >
                        Delete rating
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}

      {adminSection === "destinations" && (
        <section className="destinationAdminLayout">
          <div className="destinationFormCard">
            <p className="destinationAdminKicker">
              {editingRecommendationId ? "EDIT RECOMMENDATION" : "NEW RECOMMENDATION"}
            </p>
            <h2>
              {editingRecommendationId
                ? "Update this listing"
                : "Add something nearby"}
            </h2>

            <label htmlFor="recommendation-route">Route</label>
            <select
              id="recommendation-route"
              value={recommendationRouteId}
              onChange={(event) => {
                const routeId = event.target.value;
                const selectedRoute = routesById[routeId];
                setRecommendationRouteId(routeId);
                setRecommendationStopId(
                  selectedRoute?.stops?.[0]?.id ?? ""
                );
              }}
            >
              {routeChoices.map((choice) => (
                <option
                  key={choice.route.id}
                  value={choice.route.id}
                >
                  {choice.label} · {choice.description}
                </option>
              ))}
            </select>

            <label htmlFor="recommendation-stop">Destination stop</label>
            <select
              id="recommendation-stop"
              value={recommendationStopId}
              onChange={(event) =>
                setRecommendationStopId(event.target.value)
              }
            >
              {recommendationStops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
            </select>

            <label htmlFor="recommendation-title">Name</label>
            <input
              id="recommendation-title"
              value={recommendationTitle}
              onChange={(event) => setRecommendationTitle(event.target.value)}
              placeholder="e.g. Museum of Edinburgh"
              maxLength={120}
            />

            <label htmlFor="recommendation-category">Category</label>
            <select
              id="recommendation-category"
              value={recommendationCategory}
              onChange={(event) =>
                setRecommendationCategory(
                  event.target.value as RecommendationCategory
                )
              }
            >
              {recommendationCategories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <label htmlFor="recommendation-summary">Short description</label>
            <textarea
              id="recommendation-summary"
              value={recommendationSummary}
              onChange={(event) => setRecommendationSummary(event.target.value)}
              placeholder="Why might somebody want to go?"
              rows={4}
              maxLength={300}
            />

            <label htmlFor="recommendation-url">
              Web link <span>Optional</span>
            </label>
            <input
              id="recommendation-url"
              type="url"
              value={recommendationUrl}
              onChange={(event) => setRecommendationUrl(event.target.value)}
              placeholder="https://…"
            />

            <label htmlFor="recommendation-photo">
              Photograph <span>Optional</span>
            </label>
            {editingRecommendationId &&
              recommendations.find(
                (item) => item.id === editingRecommendationId
              )?.imageUrl && (
              <img
                className="destinationPhotoPreview"
                src={
                  recommendations.find(
                    (item) => item.id === editingRecommendationId
                  )?.imageUrl
                }
                alt="Current recommendation"
              />
            )}
            <input
              id="recommendation-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setPendingRecommendationPhoto(
                  event.target.files?.[0] ?? null
                )
              }
            />
            <small className="destinationPhotoHelp">
              JPG, PNG or WebP, up to 5 MB. Without a photo,
              Between Stops uses branded category artwork.
            </small>

            <div className="destinationFormRow">
              <div>
                <label htmlFor="recommendation-placement">Placement</label>
                <select
                  id="recommendation-placement"
                  value={recommendationPlacement}
                  onChange={(event) =>
                    setRecommendationPlacement(
                      event.target.value as RecommendationPlacement
                    )
                  }
                >
                  <option value="editorial">Editorial</option>
                  <option value="sponsored">Sponsored</option>
                </select>
              </div>
              <div>
                <label htmlFor="recommendation-order">Display order</label>
                <input
                  id="recommendation-order"
                  type="number"
                  min="1"
                  value={recommendationOrder}
                  onChange={(event) => setRecommendationOrder(event.target.value)}
                />
              </div>
            </div>

            <label className="destinationActiveToggle">
              <input
                type="checkbox"
                checked={recommendationActive}
                onChange={(event) => setRecommendationActive(event.target.checked)}
              />
              <span>Visible to passengers</span>
            </label>

            <div className="destinationFormActions">
              {editingRecommendationId && (
                <button
                  className="secondary"
                  onClick={resetRecommendationForm}
                >
                  Cancel
                </button>
              )}
              <button
                disabled={Boolean(busyId)}
                onClick={saveRecommendation}
              >
                {editingRecommendationId ? "Save changes" : "Add recommendation"}
              </button>
            </div>
          </div>

          <div className="destinationRecommendationList">
            <div className="destinationListHeading">
              <h2>Current recommendations</h2>
              <span>{visibleRecommendations.length}</span>
            </div>

            <div className="destinationFilters">
              <input
                value={recommendationSearch}
                onChange={(event) => setRecommendationSearch(event.target.value)}
                placeholder="Search recommendations"
                aria-label="Search recommendations"
              />
              <select
                value={recommendationDestinationFilter}
                onChange={(event) => setRecommendationDestinationFilter(event.target.value)}
                aria-label="Filter by destination"
              >
                <option value="all">All destinations</option>
                {recommendationDestinationOptions.map((destination) => (
                  <option key={destination} value={destination}>{destination}</option>
                ))}
              </select>
              <select
                value={recommendationCategoryFilter}
                onChange={(event) => setRecommendationCategoryFilter(event.target.value as "all" | RecommendationCategory)}
                aria-label="Filter by category"
              >
                <option value="all">All categories</option>
                {recommendationCategories.map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
              <select
                value={recommendationVisibilityFilter}
                onChange={(event) => setRecommendationVisibilityFilter(event.target.value as RecommendationVisibilityFilter)}
                aria-label="Filter by visibility"
              >
                <option value="all">All visibility</option>
                <option value="visible">Visible</option>
                <option value="hidden">Hidden</option>
              </select>
            </div>

            {loading ? (
              <div className="adminEmpty">Loading recommendations…</div>
            ) : recommendations.length === 0 ? (
              <div className="adminEmpty">No destination recommendations yet.</div>
            ) : visibleRecommendations.length === 0 ? (
              <div className="adminEmpty">No recommendations match these filters.</div>
            ) : (
              visibleRecommendations.map((recommendation) => {
                const itemRoute = routesById[recommendation.routeId];
                const itemStop = itemRoute?.stops?.find(
                  (stop) => stop.id === recommendation.stopId
                );
                const servingBusRoutes = itemStop
                  ? Array.from(
                      new Set(
                        busRouteStops
                          .filter(
                            (candidate) =>
                              normaliseDestinationName(candidate.stopName) ===
                                normaliseDestinationName(itemStop.name) ||
                              distanceBetweenStopsMetres(
                                candidate.coordinates,
                                itemStop.coordinates
                              ) <= 180
                          )
                          .map((candidate) => candidate.routeLabel)
                      )
                    ).sort((first, second) =>
                      first.localeCompare(second, "en-GB", {
                        numeric: true,
                        sensitivity: "base",
                      })
                    )
                  : [];
                const busy = busyId === recommendation.id;

                return (
                  <article
                    className={
                      recommendation.isActive
                        ? "destinationAdminCard"
                        : "destinationAdminCard inactive"
                    }
                    key={recommendation.id}
                  >
                    <div className="destinationAdminCardLayout">
                      <div className="destinationAdminArtwork">
                        <RecommendationArt
                          category={recommendation.category}
                          imageUrl={recommendation.imageUrl}
                          title={recommendation.title}
                        />
                      </div>
                      <div className="destinationAdminCardContent">
                        <div className="destinationAdminMeta">
                          <span>
                            {recommendationCategories.find(
                              ([value]) => value === recommendation.category
                            )?.[1] ?? "Attraction"}
                          </span>
                          {recommendation.placementType === "sponsored" && (
                            <b>Sponsored</b>
                          )}
                          {!recommendation.isActive && <b>Hidden</b>}
                        </div>
                        <h3>{recommendation.title}</h3>
                        <p>{recommendation.summary}</p>
                        <small>
                          {itemRoute?.number ?? itemRoute?.name ?? recommendation.routeId}
                          {" · "}
                          {itemStop?.name ?? recommendation.stopId}
                          {" · order "}
                          {recommendation.displayOrder}
                        </small>
                        {servingBusRoutes.length > 0 && (
                          <div className="destinationRouteCoverage">
                            <strong>
                              {servingBusRoutes.length} bus {servingBusRoutes.length === 1 ? "route" : "routes"} serve this destination
                            </strong>
                            <div>
                              {servingBusRoutes.map((routeLabel) => (
                                <span key={routeLabel}>{routeLabel}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {recommendation.url && (
                          <a href={recommendation.url} target="_blank" rel="noreferrer">
                            Open link
                          </a>
                        )}
                        <div className="destinationCardActions">
                          <button disabled={busy} onClick={() => editRecommendation(recommendation)}>
                            Edit
                          </button>
                          <button disabled={busy} onClick={() => setRecommendationVisibility(recommendation)}>
                            {recommendation.isActive ? "Hide" : "Show"}
                          </button>
                          <button className="danger" disabled={busy} onClick={() => deleteRecommendation(recommendation)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}

      {adminSection === "homepage_images" && (
        <section className="homepageImageAdmin">
          <div className="homepageImageForm">
            <p className="destinationAdminKicker">
              {editingHomepageImageId
                ? "EDIT IMAGE"
                : "NEW IMAGE"}
            </p>

            <h2>
              {editingHomepageImageId
                ? "Update homepage image"
                : "Add platform photography"}
            </h2>

            <label htmlFor="homepage-image-city">
              City
            </label>

            <input
              id="homepage-image-city"
              list="homepage-city-options"
              value={homepageImageCity}
              onChange={(event) =>
                setHomepageImageCity(
                  event.target.value
                )
              }
              placeholder="Edinburgh"
            />

            <datalist id="homepage-city-options">
              {Array.from(
                new Set([
                  "Global",
                  "Edinburgh",
                  ...homepageImages.map(
                    (image) => image.city
                  ),
                ])
              )
                .sort((a, b) =>
                  a.localeCompare(
                    b,
                    "en-GB"
                  )
                )
                .map((city) => (
                  <option
                    key={city}
                    value={city}
                  />
                ))}
            </datalist>

            <small>
              Use Global for photography
              that works regardless of city.
            </small>

            <label htmlFor="homepage-image-file">
              Photograph
            </label>

            {editingHomepageImageId &&
              homepageImages.find(
                (image) =>
                  image.id ===
                  editingHomepageImageId
              )?.imageUrl && (
                <img
                  className="homepageImageCurrentPreview"
                  src={
                    homepageImages.find(
                      (image) =>
                        image.id ===
                        editingHomepageImageId
                    )?.imageUrl ?? ""
                  }
                  alt=""
                />
              )}

            <input
              id="homepage-image-file"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setPendingHomepageImage(
                  event.target.files?.[0] ??
                    null
                )
              }
            />

            <small>
              JPG, PNG or WebP, up to
              10 MB.
              {editingHomepageImageId
                ? " Leave blank to keep the existing photograph."
                : ""}
            </small>

            <label htmlFor="homepage-image-alt">
              Alt text
            </label>

            <input
              id="homepage-image-alt"
              value={homepageImageAlt}
              onChange={(event) =>
                setHomepageImageAlt(
                  event.target.value
                )
              }
              maxLength={180}
              placeholder="View along Princes Street, Edinburgh"
            />

            <small>
              Briefly describe what is
              visible in the photograph.
            </small>

            <label htmlFor="homepage-image-order">
              Display order
            </label>

            <input
              id="homepage-image-order"
              type="number"
              min="1"
              value={homepageImageOrder}
              onChange={(event) =>
                setHomepageImageOrder(
                  event.target.value
                )
              }
            />

            <label className="destinationActiveToggle">
              <input
                type="checkbox"
                checked={homepageImageHero}
                onChange={(event) =>
                  setHomepageImageHero(
                    event.target.checked
                  )
                }
              />
              <span>
                Preferred hero image for
                this city
              </span>
            </label>

            <label className="destinationActiveToggle">
              <input
                type="checkbox"
                checked={homepageImageActive}
                onChange={(event) =>
                  setHomepageImageActive(
                    event.target.checked
                  )
                }
              />
              <span>
                Available on the public
                site
              </span>
            </label>

            <div className="destinationFormActions">
              {editingHomepageImageId && (
                <button
                  className="secondary"
                  onClick={
                    resetHomepageImageForm
                  }
                >
                  Cancel
                </button>
              )}

              <button
                disabled={Boolean(busyId)}
                onClick={() =>
                  void saveHomepageImage()
                }
              >
                {editingHomepageImageId
                  ? "Save changes"
                  : "Add image"}
              </button>
            </div>
          </div>

          <div className="homepageImageLibrary">
            <div className="destinationListHeading">
              <div>
                <h2>
                  Platform image library
                </h2>
                <p>
                  These images belong to
                  the Between Stops
                  presentation layer, not
                  individual tours.
                </p>
              </div>

              <span>
                {homepageImages.length}
              </span>
            </div>

            {homepageImages.length ===
            0 ? (
              <div className="adminEmpty">
                No homepage images yet.
              </div>
            ) : (
              <div className="homepageImageGrid">
                {homepageImages.map(
                  (image) => {
                    const busy =
                      busyId ===
                      `homepage-${image.id}`;

                    return (
                      <article
                        className={
                          image.isActive
                            ? "homepageImageCard"
                            : "homepageImageCard inactive"
                        }
                        key={image.id}
                      >
                        <div className="homepageImageThumb">
                          {image.imageUrl ? (
                            <img
                              src={
                                image.imageUrl
                              }
                              alt=""
                            />
                          ) : (
                            <span>
                              Image unavailable
                            </span>
                          )}

                          <div className="homepageImageBadges">
                            <span>
                              {image.city}
                            </span>

                            {image.isHero && (
                              <b>
                                Hero
                              </b>
                            )}

                            {!image.isActive && (
                              <b>
                                Hidden
                              </b>
                            )}
                          </div>
                        </div>

                        <div className="homepageImageCardBody">
                          <strong>
                            {image.altText ||
                              "No alt text"}
                          </strong>

                          <small>
                            Display order{" "}
                            {
                              image.displayOrder
                            }
                          </small>

                          <div className="passengerReviewActions">
                            <button
                              disabled={busy}
                              onClick={() =>
                                editHomepageImage(
                                  image
                                )
                              }
                            >
                              Edit
                            </button>

                            <button
                              className="secondary"
                              disabled={busy}
                              onClick={() =>
                                void toggleHomepageImage(
                                  image
                                )
                              }
                            >
                              {image.isActive
                                ? "Hide"
                                : "Show"}
                            </button>

                            <button
                              className="danger"
                              disabled={busy}
                              onClick={() =>
                                void deleteHomepageImage(
                                  image
                                )
                              }
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      </article>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {adminSection === "platform_audio" && (
        <section className="operationsSection">
          <div className="analyticsControls">
            <div>
              <h2>Platform audio</h2>
              <p>
                These announcements are used across every
                Between Stops tour. Creators do not manage them.
              </p>
            </div>
          </div>

          <div className="recommendationClickList">
            {(
              [
                "welcome",
                "next_stop",
                "tour_end",
              ] as PlatformAudioKey[]
            ).map((key) => {
              const item = platformAudio.find(
                (audio) => audio.key === key
              );
              const labels =
                platformAudioLabels[key];
              const busy =
                busyId === `platform-audio-${key}`;

              return (
                <article
                  className="passengerReviewCard"
                  key={key}
                >
                  <h2>{labels.title}</h2>
                  <p>{labels.description}</p>

                  {item?.url ? (
                    <audio
                      controls
                      preload="metadata"
                      src={item.url}
                    />
                  ) : (
                    <div className="adminEmpty">
                      No audio uploaded yet.
                    </div>
                  )}

                  <label>
                    {item?.url
                      ? "Replace audio"
                      : "Upload audio"}
                    <input
                      type="file"
                      accept="audio/*"
                      onChange={(event) => {
                        const file =
                          event.target.files?.[0];

                        setPendingPlatformAudio(
                          (current) => ({
                            ...current,
                            [key]: file,
                          })
                        );
                      }}
                    />
                  </label>

                  {pendingPlatformAudio[key] && (
                    <small>
                      Selected:{" "}
                      {
                        pendingPlatformAudio[key]
                          ?.name
                      }
                    </small>
                  )}

                  <div className="passengerReviewActions">
                    <button
                      disabled={
                        busy ||
                        !pendingPlatformAudio[key]
                      }
                      onClick={() =>
                        void savePlatformAudio(key)
                      }
                    >
                      {busy
                        ? "Uploading…"
                        : item?.url
                          ? "Replace audio"
                          : "Upload audio"}
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {adminSection === "operations" && (
        <section className="operationsSection">
          <div className="operationsMetrics">
            {operationsMetrics && [
              ["Stored uploads", formatBytes(operationsMetrics.storage_bytes)],
              ["Creators", operationsMetrics.creators],
              ["All tours", operationsMetrics.tours],
              ["Live tours", operationsMetrics.published_tours],
              ["Stories", operationsMetrics.stories],
              ["Awaiting approval", operationsMetrics.pending_approvals],
              ["Reviews awaiting moderation", operationsMetrics.pending_reviews],
              ["Open reports", operationsMetrics.open_reports],
              ["Tours started", operationsMetrics.tours_started],
              ["Tours completed", operationsMetrics.tours_completed],
              ["Recommendation clicks", operationsMetrics.recommendation_clicks],
            ].map(([label, value]) => (
              <article key={label}><span>{label}</span><strong>{value}</strong></article>
            ))}
          </div>

          {operationsMetrics && Object.keys(operationsMetrics.storage_by_bucket).length > 0 && (
            <div className="storageBreakdown">
              <h2>Upload storage by area</h2>
              {Object.entries(operationsMetrics.storage_by_bucket)
                .sort((first, second) => second[1] - first[1])
                .map(([bucket, bytes]) => (
                  <div key={bucket}><span>{bucket}</span><strong>{formatBytes(bytes)}</strong></div>
                ))}
              <p>Allowance varies by Supabase plan. This shows actual files stored, without hard-coding a potentially outdated limit.</p>
            </div>
          )}

          <div className="analyticsControls">
            <div><h2>Tour analytics</h2><p>Simulator journeys are excluded. Reset this once testing is finished to begin public reporting from zero.</p></div>
            <button disabled={busyId === "analytics-reset"} onClick={resetTourAnalytics}>Reset test metrics</button>
          </div>

          <div className="recommendationClickList">
            <div className="destinationListHeading"><h2>Destination recommendation clicks</h2><span>{recommendationClicks.length}</span></div>
            {recommendationClicks.length === 0 ? (
              <div className="adminEmpty">No recommendation clicks recorded.</div>
            ) : recommendationClicks.map((click) => {
              const recommendation = recommendations.find((item) => item.id === click.recommendation_id);
              const tour = experiences.find((item) => item.id === click.experience_id);
              return (
                <article className="recommendationClickRow" key={click.id}>
                  <div><strong>{recommendation?.title ?? "Recommendation"}</strong><span>{tour?.title ?? "Tour"}</span></div>
                  <small>{new Date(click.created_at).toLocaleString("en-GB")} · {click.user_id ? "Signed-in passenger" : `Anonymous device ${click.device_token?.slice(0, 8) ?? "unknown"}`}</small>
                </article>
              );
            })}
          </div>

          <div className="platformReportList">
            <div className="destinationListHeading"><h2>Issues, ideas and errors</h2><span>{platformReports.length}</span></div>
            {platformReports.length === 0 ? (
              <div className="adminEmpty">No reports yet.</div>
            ) : platformReports.map((report) => (
              <article className={`platformReportCard report-${report.report_type}`} key={report.id}>
                <div><span>{report.report_type}</span><b>{report.status.replace("_", " ")}</b></div>
                <p>{report.message}</p>
                <small>{new Date(report.created_at).toLocaleString("en-GB")}{report.reporter_email ? ` · ${report.reporter_email}` : ""}</small>
                {report.page_url && <a href={report.page_url} target="_blank" rel="noreferrer">Open reported page</a>}
                <div className="platformReportActions">
                  <button disabled={busyId === report.id} onClick={() => setPlatformReportStatus(report.id, "in_progress")}>In progress</button>
                  <button disabled={busyId === report.id} onClick={() => setPlatformReportStatus(report.id, "resolved")}>Resolve</button>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
