import type {
  SupabaseClient,
} from "@supabase/supabase-js";
import length from "@turf/length";
import { lineString } from "@turf/helpers";

import {
  routesById,
} from "@/data/routes/catalogue";

import type {
  Coordinates,
  ExperienceDefinition,
  RouteDefinition,
  RouteStop,
  StoryType,
} from "@/lib/types";

import {
  loadRatingSummaries,
} from "@/lib/passenger-reviews";

export type PublicCreator = {
  displayName: string;
  bio: string;
  avatarUrl?: string;
  avatarSizeBytes?: number;
  leftPromptUrl?: string;
  leftPromptSizeBytes?: number;
  rightPromptUrl?: string;
  rightPromptSizeBytes?: number;
};

export type PublicExperienceOption = {
  slug?: string;
  experience: ExperienceDefinition;
  summary: string;
  fullDescription: string;
  route: RouteDefinition;
  badge: string;
  transportLabel: string;
  visualClass: string;
  coverImageUrl?: string;
  coverImageSizeBytes?: number;
  galleryImageUrls: string[];
  galleryImageSizeBytes?: number[];
  availableFrom?: string;
  availableTo?: string;
  ageGuidance:
    | "all_ages"
    | "not_for_children";
  creator?: PublicCreator;
  featuredRank?: number;
  accessType: "free" | "paid" | "sponsored";
  pricePence?: number;
  currency: string;
  startCoordinates: Coordinates;
  startStopId?: string;
  endStopId?: string;
  journeyDirectionAvailability?:
    | "either"
    | "forward"
    | "reverse";
  downloadSizeBytes?: number;
  averageRating?: number;
  reviewCount?: number;
};

type DatabaseStory = {
  id: string;
  title: string;
  notes: string;
  story_type: StoryType;
  subject_longitude: number;
  subject_latitude: number;
  route_progress: number;
  audio_path: string | null;
  audio_duration_seconds: number | null;
  audio_size_bytes: number | null;
  image_path: string | null;
  image_size_bytes: number | null;
};

type DatabaseExperience = {
  id: string;
  slug: string | null;
  owner_id: string;
  title: string;
  summary: string;
  description: string;
  route_id: string;
  journey_direction_availability:
    | "either"
    | "forward"
    | "reverse";
  start_stop_id: string;
  end_stop_id: string;
  cover_image_path: string | null;
  cover_image_size_bytes: number | null;
  available_from: string | null;
  available_to: string | null;
  age_guidance:
    | "all_ages"
    | "not_for_children";
  duration_minutes: number | null;
  start_longitude: number | null;
  start_latitude: number | null;
  featured_rank: number | null;
  access_type:
    | "free"
    | "paid"
    | "sponsored";
  price_pence: number | null;
  currency: string;
  published_at: string | null;
  stories: DatabaseStory[];
  experience_gallery_images: {
    path: string;
    position: number;
    size_bytes: number;
  }[];
};

type DatabaseProfile = {
  id: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  avatar_size_bytes: number | null;
  left_prompt_path: string | null;
  left_prompt_size_bytes: number | null;
  right_prompt_path: string | null;
  right_prompt_size_bytes: number | null;
};

async function createSignedUrlMap(
  supabase: SupabaseClient,
  bucket: string,
  paths: string[]
) {
  const uniquePaths =
    Array.from(new Set(paths));

  const urls =
    new Map<string, string>();

  if (uniquePaths.length === 0) {
    return urls;
  }

  const { data, error } =
    await supabase.storage
      .from(bucket)
      .createSignedUrls(
        uniquePaths,
        60 * 60
      );

  if (error) {
    const individualResults =
      await Promise.all(
        uniquePaths.map(
          async (path) => {
            const {
              data: signedData,
            } =
              await supabase.storage
                .from(bucket)
                .createSignedUrl(
                  path,
                  60 * 60
                );

            return {
              path,
              signedUrl:
                signedData?.signedUrl,
            };
          }
        )
      );

    individualResults.forEach(
      (item) => {
        if (item.signedUrl) {
          urls.set(
            item.path,
            item.signedUrl
          );
        }
      }
    );

    return urls;
  }

  (data ?? []).forEach(
    (item, index) => {
      if (item.signedUrl) {
        urls.set(
          uniquePaths[index],
          item.signedUrl
        );
      }
    }
  );

  return urls;
}

function getEyebrow(
  type: StoryType
) {
  if (
    type === "audio" ||
    type === "image"
  ) {
    return "Listen";
  }

  if (type === "look") {
    return "Something to spot";
  }

  return "Story";
}

function estimateJourneyMinutes(
  route: RouteDefinition,
  startProgress: number,
  endProgress: number
) {
  const distanceKm = length(
    lineString(route.coordinates),
    { units: "kilometers" }
  ) * (Math.abs(endProgress - startProgress) / 100);
  const low = Math.min(startProgress, endProgress);
  const high = Math.max(startProgress, endProgress);
  const stopCount = (route.stops ?? []).filter(
    (stop) =>
      stop.routeProgress >= low &&
      stop.routeProgress <= high
  ).length;
  const movingSpeed =
    route.mode === "tram"
      ? 32
      : route.mode === "train"
        ? 55
        : route.mode === "cab"
          ? 24
          : 22;
  const dwellMinutes =
    route.mode === "tram"
      ? 0.65
      : route.mode === "bus"
        ? 0.55
        : 0.2;
  const rawMinutes =
    (distanceKm / movingSpeed) * 60 +
    Math.max(0, stopCount - 1) * dwellMinutes;

  return Math.max(5, Math.ceil(rawMinutes / 5) * 5);
}

export async function loadPublishedExperiences(
  supabase: SupabaseClient
): Promise<PublicExperienceOption[]> {
  const { data, error } =
    await supabase
      .from("experiences")
      .select(`
        id,
        slug,
        owner_id,
        title,
        summary,
        description,
        route_id,
        journey_direction_availability,
        start_stop_id,
        end_stop_id,
        cover_image_path,
        cover_image_size_bytes,
        available_from,
        available_to,
        age_guidance,
        duration_minutes,
        start_longitude,
        start_latitude,
        featured_rank,
        access_type,
        price_pence,
        currency,
        published_at,
        experience_gallery_images (
          path,
          position,
          size_bytes
        ),
        stories (
          id,
          title,
          notes,
          story_type,
          subject_longitude,
          subject_latitude,
          route_progress,
          audio_path,
          audio_duration_seconds,
          audio_size_bytes,
          image_path,
          image_size_bytes
        )
      `)
      .eq("status", "published")
      .eq("visibility", "public")
      .order("featured_rank", {
        ascending: true,
        nullsFirst: false,
      })
      .order("published_at", {
        ascending: false,
      });

  if (error) {
    throw error;
  }

  const today = new Date()
    .toISOString()
    .slice(0, 10);

  const rows = (
    (data ?? []) as DatabaseExperience[]
  ).filter(
    (row) =>
      (!row.available_from || row.available_from <= today) &&
      (!row.available_to || row.available_to >= today)
  );

  const [options, ratingSummaries] = await Promise.all([
    hydrateExperienceRows(supabase, rows),
    loadRatingSummaries(supabase),
  ]);

  const ratingsByExperience = new Map(
    ratingSummaries.map((summary) => [summary.experienceId, summary])
  );

  return options.map((option) => {
    const summary = ratingsByExperience.get(option.experience.id);
    return {
      ...option,
      averageRating: summary?.averageRating,
      reviewCount: summary?.reviewCount ?? 0,
    };
  });
}

async function hydrateExperienceRows(
  supabase: SupabaseClient,
  rows: DatabaseExperience[]
): Promise<PublicExperienceOption[]> {

  const supportedRows =
    rows.filter(
      (row) =>
        Boolean(
          routesById[row.route_id]
        )
    );

  const ownerIds =
    Array.from(
      new Set(
        supportedRows.map(
          (row) => row.owner_id
        )
      )
    );

  let profiles:
    DatabaseProfile[] = [];

  if (ownerIds.length > 0) {
    const {
      data: profileData,
      error: profileError,
    } = await supabase
      .from("creator_profiles")
      .select(`
        id,
        display_name,
        bio,
        avatar_path,
        avatar_size_bytes,
        left_prompt_path,
        left_prompt_size_bytes,
        right_prompt_path,
        right_prompt_size_bytes
      `)
      .in("id", ownerIds);

    if (profileError) {
      throw profileError;
    }

    profiles =
      (profileData ?? []) as DatabaseProfile[];
  }

  const storyPaths =
    supportedRows.flatMap(
      (row) =>
        (row.stories ?? [])
          .flatMap(
            (story) => [
              story.audio_path,
              story.image_path,
            ]
          )
          .filter(
            (path): path is string =>
              Boolean(path)
          )
    );

  const coverPaths =
    supportedRows
      .flatMap((row) => [
        row.cover_image_path,
        ...(row.experience_gallery_images ?? [])
          .map((image) => image.path),
      ])
      .filter(
        (path): path is string =>
          Boolean(path)
      );

  const profileMediaPaths =
    profiles
      .flatMap(
        (profile) => [
          profile.avatar_path,
          profile.left_prompt_path,
          profile.right_prompt_path,
        ]
      )
      .filter(
        (path): path is string =>
          Boolean(path)
      );

  const [
    storyUrls,
    coverUrls,
    profileMediaUrls,
  ] = await Promise.all([
    createSignedUrlMap(
      supabase,
      "story-media",
      storyPaths
    ),
    createSignedUrlMap(
      supabase,
      "tour-media",
      coverPaths
    ),
    createSignedUrlMap(
      supabase,
      "profile-media",
      profileMediaPaths
    ),
  ]);

  const profilesById =
    new Map(
      profiles.map(
        (profile) => [
          profile.id,
          profile,
        ]
      )
    );

  return supportedRows.map(
    (row) => {
      const route =
        routesById[row.route_id];

      const firstFallback =
        route.stops?.[0];

      const lastFallback =
        route.stops?.[
          (route.stops?.length ?? 1) -
            1
        ];

      const selectedStart =
        route.stops?.find(
          (stop) =>
            stop.id ===
            row.start_stop_id
        ) ?? firstFallback;

      const selectedEnd =
        route.stops?.find(
          (stop) =>
            stop.id ===
            row.end_stop_id
        ) ?? lastFallback;

      const orderedStops =
        [selectedStart, selectedEnd]
          .filter(
            (stop): stop is RouteStop =>
              Boolean(stop)
          )
          .sort(
            (first, second) =>
              first.routeProgress -
              second.routeProgress
          );

      const start =
        orderedStops[0];

      const end =
        orderedStops[
          orderedStops.length - 1
        ];

      const profile =
        profilesById.get(
          row.owner_id
        );

      const startCoordinates:
        Coordinates =
        row.start_longitude !== null &&
        row.start_latitude !== null
          ? [
              row.start_longitude,
              row.start_latitude,
            ]
          : start?.coordinates ??
            route.coordinates[0];

      return {
        slug:
          row.slug ?? undefined,
        experience: {
          id: row.id,
          title: row.title,
          description:
            row.summary ||
            row.description,
          routeId: route.id,
          startProgress:
            start?.routeProgress ?? 0,
          endProgress:
            end?.routeProgress ?? 100,
          startLabel:
            start?.name ??
            route.canonicalStart,
          endLabel:
            end?.name ??
            route.canonicalEnd,
          durationMinutes:
            estimateJourneyMinutes(
              route,
              start?.routeProgress ?? 0,
              end?.routeProgress ?? 100
            ),
          stories:
            (row.stories ?? [])
              .map(
                (story) => ({
                  id: story.id,
                  title: story.title,
                  eyebrow:
                    getEyebrow(
                      story.story_type
                    ),
                  text: story.notes,
                  type:
                    story.story_type ===
                    "look"
                      ? "look"
                      : "audio" as StoryType,
                  routeProgress:
                    story.route_progress,
                  direction:
                    "both" as const,
                  subjectLocation: {
                    longitude:
                      story.subject_longitude,
                    latitude:
                      story.subject_latitude,
                  },
                  directionalPrompt:
                    story.story_type ===
                    "look",
                  audioUrl:
                    story.audio_path
                      ? storyUrls.get(
                          story.audio_path
                        )
                      : undefined,
                  audioDurationSeconds:
                    story.audio_duration_seconds ?? undefined,
                  audioSizeBytes:
                    story.audio_size_bytes ?? undefined,
                  imageUrl:
                    story.image_path
                      ? storyUrls.get(
                          story.image_path
                        )
                      : undefined,
                  imageSizeBytes:
                    story.image_size_bytes ?? undefined,
                })
              )
              .sort(
                (first, second) =>
                  first.routeProgress -
                  second.routeProgress
              ),
        },
        route,
        summary:
          row.summary ||
          row.description,
        fullDescription:
          row.description ||
          row.summary,
        badge:
          route.mode === "tram"
            ? "EDINBURGH TRAM"
            : `BUS ${route.number ?? ""}`.trim(),
        transportLabel:
          route.mode === "tram"
            ? "Tram"
            : `Bus ${route.number ?? ""}`.trim(),
        visualClass:
          route.mode === "tram"
            ? "tramExperience"
            : "busExperience",
        coverImageUrl:
          row.cover_image_path
            ? coverUrls.get(
                row.cover_image_path
              )
            : undefined,
        coverImageSizeBytes:
          row.cover_image_size_bytes ?? undefined,
        galleryImageUrls:
          (row.experience_gallery_images ?? [])
            .sort(
              (first, second) =>
                first.position - second.position
            )
            .map((image) => coverUrls.get(image.path))
            .filter((url): url is string => Boolean(url)),
        galleryImageSizeBytes:
          (row.experience_gallery_images ?? [])
            .sort(
              (first, second) => first.position - second.position
            )
            .map((image) => image.size_bytes ?? 0),
        availableFrom:
          row.available_from ?? undefined,
        availableTo:
          row.available_to ?? undefined,
        ageGuidance:
          row.age_guidance ?? "all_ages",
        creator:
          profile
            ? {
                displayName:
                  profile.display_name,
                bio: profile.bio,
              avatarUrl: profile.avatar_path
                ? profileMediaUrls.get(profile.avatar_path)
                : undefined,
              avatarSizeBytes:
                profile.avatar_size_bytes ?? undefined,
              leftPromptUrl: profile.left_prompt_path
                ? profileMediaUrls.get(profile.left_prompt_path)
                : undefined,
              leftPromptSizeBytes:
                profile.left_prompt_size_bytes ?? undefined,
              rightPromptUrl: profile.right_prompt_path
                ? profileMediaUrls.get(profile.right_prompt_path)
                : undefined,
              rightPromptSizeBytes:
                profile.right_prompt_size_bytes ?? undefined,
              }
            : undefined,
        featuredRank:
          row.featured_rank ??
          undefined,
        accessType:
          row.access_type,
        pricePence:
          row.price_pence ??
          undefined,
        currency:
          row.currency,
        startCoordinates,
        startStopId: selectedStart?.id,
        endStopId: selectedEnd?.id,
        journeyDirectionAvailability:
          row.journey_direction_availability ??
          "either",
        downloadSizeBytes:
          (row.cover_image_size_bytes ?? 0) +
          (row.experience_gallery_images ?? []).reduce(
            (total, image) => total + (image.size_bytes ?? 0),
            0
          ) +
          (row.stories ?? []).reduce(
            (total, story) =>
              total +
              (story.audio_size_bytes ?? 0) +
              (story.image_size_bytes ?? 0),
            0
          ) +
          (profile?.avatar_size_bytes ?? 0) +
          (profile?.left_prompt_size_bytes ?? 0) +
          (profile?.right_prompt_size_bytes ?? 0),
      };
    }
  );
}

export async function loadPublishedExperienceBySlug(
  supabase: SupabaseClient,
  slug: string
): Promise<PublicExperienceOption | null> {
  const { data, error } = await supabase
    .from("experiences")
    .select(`
      id,
      slug,
      owner_id,
      title,
      summary,
      description,
      route_id,
      journey_direction_availability,
      start_stop_id,
      end_stop_id,
      cover_image_path,
      cover_image_size_bytes,
      available_from,
      available_to,
      age_guidance,
      duration_minutes,
      start_longitude,
      start_latitude,
      featured_rank,
      access_type,
      price_pence,
      currency,
      published_at,
      experience_gallery_images (
        path,
        position,
        size_bytes
      ),
      stories (
        id,
        title,
        notes,
        story_type,
        subject_longitude,
        subject_latitude,
        route_progress,
        audio_path,
        audio_duration_seconds,
        audio_size_bytes,
        image_path,
        image_size_bytes
      )
    `)
    .eq("slug", slug)
    .eq("status", "published")
    .eq("visibility", "public")
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const [options, ratingSummaries] = await Promise.all([
    hydrateExperienceRows(
      supabase,
      [data as DatabaseExperience]
    ),
    loadRatingSummaries(supabase),
  ]);

  const summary = ratingSummaries.find(
    (item) => item.experienceId === data.id
  );

  return options[0]
    ? {
        ...options[0],
        averageRating: summary?.averageRating,
        reviewCount: summary?.reviewCount ?? 0,
      }
    : null;
}

export async function loadExperiencePreview(
  supabase: SupabaseClient,
  experienceId: string
): Promise<PublicExperienceOption | null> {
  const { data: userData, error: userError } =
    await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error("Sign in to preview this experience.");
  }

  const { data, error } = await supabase
    .from("experiences")
    .select(`
      id,
      slug,
      owner_id,
      title,
      summary,
      description,
      route_id,
      journey_direction_availability,
      start_stop_id,
      end_stop_id,
      cover_image_path,
      cover_image_size_bytes,
      available_from,
      available_to,
      age_guidance,
      duration_minutes,
      start_longitude,
      start_latitude,
      featured_rank,
      access_type,
      price_pence,
      currency,
      published_at,
      experience_gallery_images (
        path,
        position,
        size_bytes
      ),
      stories (
        id,
        title,
        notes,
        story_type,
        subject_longitude,
        subject_latitude,
        route_progress,
        audio_path,
        audio_duration_seconds,
        audio_size_bytes,
        image_path,
        image_size_bytes
      )
    `)
    .eq("id", experienceId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  if (data.owner_id !== userData.user.id) {
    const { data: membership } = await supabase
      .from("platform_admins")
      .select("user_id")
      .maybeSingle();

    if (!membership) {
      throw new Error(
        "This experience could not be found or you do not have access to it."
      );
    }
  }

  const [options, ratingSummaries] = await Promise.all([
    hydrateExperienceRows(
      supabase,
      [data as DatabaseExperience]
    ),
    loadRatingSummaries(supabase),
  ]);

  const summary = ratingSummaries.find(
    (item) => item.experienceId === data.id
  );

  return options[0]
    ? {
        ...options[0],
        averageRating: summary?.averageRating,
        reviewCount: summary?.reviewCount ?? 0,
      }
    : null;
}
