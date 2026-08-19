import type {
  SupabaseClient,
} from "@supabase/supabase-js";

import type {
  Coordinates,
} from "@/lib/types";

export type SectionMode =
  | "whole"
  | "section";

export type CreatorStoryType =
  | "audio"
  | "look";

export type ProjectStatus =
  | "draft"
  | "ready_for_review"
  | "submitted"
  | "changes_requested"
  | "approved"
  | "published"
  | "archived";

export type TourVisibility =
  | "private"
  | "unlisted"
  | "public";

export type TourAccessType =
  | "free"
  | "paid"
  | "sponsored";

export type AgeGuidance =
  | "all_ages"
  | "not_for_children";

export type MediaAttachment = {
  path: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  url?: string;
};

export type CreatorStory = {
  id: string;
  title: string;
  text: string;
  type: CreatorStoryType;
  subjectCoordinates: Coordinates;
  routeProgress: number;
  audio?: MediaAttachment;
  image?: MediaAttachment;
};

export type SavedProject = {
  id: string;
  name: string;
  city: string;
  selectedRouteId: string;
  sectionMode: SectionMode;
  startStopId: string;
  endStopId: string;
  summary: string;
  description: string;
  coverImage?: MediaAttachment;
  galleryImages: MediaAttachment[];
  durationMinutes?: number;
  availableFrom?: string;
  availableTo?: string;
  ageGuidance: AgeGuidance;
  startCoordinates?: Coordinates;
  visibility: TourVisibility;
  accessType: TourAccessType;
  pricePence?: number;
  currency: string;
  languageCode: string;
  publishedAt?: string;
  rightsConfirmedAt?: string;
  reviewNote?: string;
  stories: CreatorStory[];
  status: ProjectStatus;
  updatedAt: string;
};

export type CreatorProfile = {
  id: string;
  displayName: string;
  bio: string;
  avatar?: MediaAttachment;
  leftPrompt?: MediaAttachment;
  rightPrompt?: MediaAttachment;
  isPublic: boolean;
  updatedAt: string;
};

type DatabaseStory = {
  id: string;
  title: string;
  notes: string;
  story_type:
    | CreatorStoryType
    | "image";
  subject_longitude: number;
  subject_latitude: number;
  route_progress: number;
  audio_path: string | null;
  audio_filename: string | null;
  audio_mime_type: string | null;
  audio_size_bytes: number | null;
  audio_duration_seconds: number | null;
  image_path: string | null;
  image_filename: string | null;
  image_mime_type: string | null;
  image_size_bytes: number | null;
};

type DatabaseExperience = {
  id: string;
  title: string;
  city: string;
  route_id: string;
  section_mode: SectionMode;
  start_stop_id: string;
  end_stop_id: string;
  summary: string;
  description: string;
  cover_image_path: string | null;
  cover_image_filename: string | null;
  cover_image_mime_type: string | null;
  cover_image_size_bytes: number | null;
  available_from: string | null;
  available_to: string | null;
  age_guidance: AgeGuidance;
  duration_minutes: number | null;
  start_longitude: number | null;
  start_latitude: number | null;
  visibility: TourVisibility;
  access_type: TourAccessType;
  price_pence: number | null;
  currency: string;
  language_code: string;
  published_at: string | null;
  rights_confirmed_at: string | null;
  status: ProjectStatus;
  updated_at: string;
  experience_status_history?: {
    to_status: string;
    note: string | null;
    created_at: string;
  }[];
  experience_gallery_images?: {
    id: string;
    path: string;
    filename: string;
    mime_type: string;
    size_bytes: number;
    position: number;
  }[];
  stories: DatabaseStory[];
};

type DatabaseCreatorProfile = {
  id: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
  avatar_filename: string | null;
  avatar_mime_type: string | null;
  avatar_size_bytes: number | null;
  left_prompt_path: string | null;
  left_prompt_filename: string | null;
  left_prompt_mime_type: string | null;
  left_prompt_size_bytes: number | null;
  right_prompt_path: string | null;
  right_prompt_filename: string | null;
  right_prompt_mime_type: string | null;
  right_prompt_size_bytes: number | null;
  is_public: boolean;
  updated_at: string;
};

const DATABASE_ROUTE_IDS:
  Record<string, string> = {
    tram: "edinburgh-tram-full",
    "35": "route-35-full",
  };

const CREATOR_ROUTE_IDS:
  Record<string, string> = {
    "edinburgh-tram-full": "tram",
    "route-35-full": "35",
  };

export const LOCAL_STORAGE_KEY =
  "between-stops-creator-projects";

export function loadBrowserProjects():
  SavedProject[] {
  if (
    typeof window === "undefined"
  ) {
    return [];
  }

  const raw =
    localStorage.getItem(
      LOCAL_STORAGE_KEY
    );

  if (!raw) {
    return [];
  }

  try {
    return JSON.parse(
      raw
    ) as SavedProject[];
  } catch {
    return [];
  }
}

export async function loadCreatorProjects(
  supabase: SupabaseClient,
  retryFutureJwt = true
): Promise<SavedProject[]> {
  const { data, error } =
    await supabase
      .from("experiences")
      .select(`
        id,
        title,
        city,
        route_id,
        section_mode,
        start_stop_id,
        end_stop_id,
        summary,
        description,
        cover_image_path,
        cover_image_filename,
        cover_image_mime_type,
        cover_image_size_bytes,
        available_from,
        available_to,
        age_guidance,
        duration_minutes,
        start_longitude,
        start_latitude,
        visibility,
        access_type,
        price_pence,
        currency,
        language_code,
        published_at,
        rights_confirmed_at,
        status,
        updated_at,
        experience_status_history (
          to_status,
          note,
          created_at
        ),
        experience_gallery_images (
          id,
          path,
          filename,
          mime_type,
          size_bytes,
          position
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
          audio_filename,
          audio_mime_type,
          audio_size_bytes,
          audio_duration_seconds,
          image_path,
          image_filename,
          image_mime_type,
          image_size_bytes
        )
      `)
      .order(
        "updated_at",
        {
          ascending: false,
        }
      );

  if (error) {
    if (
      retryFutureJwt &&
      error.message
        .toLowerCase()
        .includes(
          "jwt issued at future"
        )
    ) {
      const {
        error: refreshError,
      } =
        await supabase.auth.refreshSession();

      if (!refreshError) {
        try {
          return await loadCreatorProjects(
            supabase,
            false
          );
        } catch (retryError) {
          if (
            retryError instanceof Error &&
            retryError.message
              .toLowerCase()
              .includes(
                "jwt issued at future"
              )
          ) {
            throw new Error(
              "Your sign-in session is temporarily out of sync. Sign out, then sign in again."
            );
          }

          throw retryError;
        }
      }
    }

    throw error;
  }

  const rows =
    (data ??
      []) as DatabaseExperience[];

  const mediaPaths =
    Array.from(
      new Set(
        rows.flatMap(
          (experience) =>
            (
              experience.stories ?? []
            ).flatMap(
              (story) =>
                [
                  story.audio_path,
                  story.image_path,
                ].filter(
                  (
                    path
                  ): path is string =>
                    Boolean(path)
                )
            )
        )
      )
    );

  const signedUrls =
    new Map<string, string>();

  if (mediaPaths.length > 0) {
    const {
      data: signedData,
      error: signedError,
    } =
      await supabase.storage
        .from("story-media")
        .createSignedUrls(
          mediaPaths,
          60 * 60
        );

    if (signedError) {
      throw new Error(
        signedError.message
      );
    }

    (signedData ?? []).forEach(
      (item, index) => {
        if (item.signedUrl) {
          signedUrls.set(
            mediaPaths[index],
            item.signedUrl
          );
        }
      }
    );
  }

  const coverPaths =
    rows
      .flatMap(
        (experience) => [
          experience.cover_image_path,
          ...(experience.experience_gallery_images ?? [])
            .map((image) => image.path),
        ]
      )
      .filter(
        (path): path is string =>
          Boolean(path)
      );

  const coverSignedUrls =
    new Map<string, string>();

  if (coverPaths.length > 0) {
    const {
      data: coverSignedData,
      error: coverSignedError,
    } = await supabase.storage
      .from("tour-media")
      .createSignedUrls(
        coverPaths,
        60 * 60
      );

    if (coverSignedError) {
      throw new Error(
        coverSignedError.message
      );
    }

    (coverSignedData ?? []).forEach(
      (item, index) => {
        if (item.signedUrl) {
          coverSignedUrls.set(
            coverPaths[index],
            item.signedUrl
          );
        }
      }
    );
  }

  return rows.map(
    (experience) => ({
      id: experience.id,
      name: experience.title,
      city: experience.city,
      selectedRouteId:
        CREATOR_ROUTE_IDS[
          experience.route_id
        ] ?? experience.route_id,
      sectionMode:
        experience.section_mode,
      startStopId:
        experience.start_stop_id,
      endStopId:
        experience.end_stop_id,
      summary:
        experience.summary ?? "",
      description:
        experience.description ?? "",
      coverImage:
        experience.cover_image_path
          ? {
              path:
                experience.cover_image_path,
              filename:
                experience.cover_image_filename ??
                "Tour cover",
              mimeType:
                experience.cover_image_mime_type ??
                "image/jpeg",
              sizeBytes:
                experience.cover_image_size_bytes ??
                0,
              url:
                coverSignedUrls.get(
                  experience.cover_image_path
                ),
            }
          : undefined,
      galleryImages:
        (experience.experience_gallery_images ?? [])
          .sort(
            (first, second) =>
              first.position - second.position
          )
          .map((image) => ({
            path: image.path,
            filename: image.filename,
            mimeType: image.mime_type,
            sizeBytes: image.size_bytes,
            url: coverSignedUrls.get(image.path),
          })),
      durationMinutes:
        experience.duration_minutes ??
        undefined,
      availableFrom:
        experience.available_from ?? undefined,
      availableTo:
        experience.available_to ?? undefined,
      ageGuidance:
        experience.age_guidance ?? "all_ages",
      startCoordinates:
        experience.start_longitude !==
          null &&
        experience.start_latitude !==
          null
          ? [
              experience.start_longitude,
              experience.start_latitude,
            ] as Coordinates
          : undefined,
      visibility:
        experience.visibility ??
        "private",
      accessType:
        experience.access_type ??
        "free",
      pricePence:
        experience.price_pence ??
        undefined,
      currency:
        experience.currency ??
        "GBP",
      languageCode:
        experience.language_code ??
        "en-GB",
      publishedAt:
        experience.published_at ??
        undefined,
      rightsConfirmedAt:
        experience.rights_confirmed_at ??
        undefined,
      reviewNote:
        (experience.experience_status_history ?? [])
          .filter(
            (item) =>
              item.to_status === "changes_requested" &&
              Boolean(item.note)
          )
          .sort(
            (first, second) =>
              Date.parse(second.created_at) -
              Date.parse(first.created_at)
          )[0]?.note ?? undefined,
      status: experience.status,
      updatedAt:
        experience.updated_at,
      stories: (
        experience.stories ?? []
      )
        .map(
          (story) => ({
            id: story.id,
            title: story.title,
            text: story.notes,
            type:
              story.story_type === "look"
                ? "look"
                : "audio" as CreatorStoryType,
            subjectCoordinates: [
              story.subject_longitude,
              story.subject_latitude,
            ] as Coordinates,
            routeProgress:
              story.route_progress,

            audio:
              story.audio_path
                ? {
                    path:
                      story.audio_path,
                    filename:
                      story.audio_filename ??
                      "Audio file",
                    mimeType:
                      story.audio_mime_type ??
                      "audio/mpeg",
                    sizeBytes:
                      story.audio_size_bytes ??
                      0,
                    durationSeconds:
                      story.audio_duration_seconds ??
                      undefined,
                    url:
                      signedUrls.get(
                        story.audio_path
                      ),
                  }
                : undefined,

            image:
              story.image_path
                ? {
                    path:
                      story.image_path,
                    filename:
                      story.image_filename ??
                      "Image file",
                    mimeType:
                      story.image_mime_type ??
                      "image/jpeg",
                    sizeBytes:
                      story.image_size_bytes ??
                      0,
                    url:
                      signedUrls.get(
                        story.image_path
                      ),
                  }
                : undefined,
          })
        )
        .sort(
          (first, second) =>
            first.routeProgress -
            second.routeProgress
        ),
    })
  );
}

export async function submitCreatorProjectForReview(
  supabase: SupabaseClient,
  experienceId: string
) {
  const { error } = await supabase.rpc(
    "submit_experience_for_review",
    {
      p_experience_id: experienceId,
    }
  );

  if (error) {
    throw error;
  }
}

export async function retractCreatorProjectReview(
  supabase: SupabaseClient,
  experienceId: string
) {
  const { error } = await supabase.rpc(
    "retract_experience_submission",
    {
      p_experience_id: experienceId,
    }
  );

  if (error) {
    throw error;
  }
}

export async function saveCreatorProject(
  supabase: SupabaseClient,
  project: SavedProject
) {
  const databaseRouteId =
    DATABASE_ROUTE_IDS[
      project.selectedRouteId
    ] ?? project.selectedRouteId;

  const {
    error: experienceError,
  } =
    await supabase
      .from("experiences")
      .upsert(
        {
          id: project.id,
          title: project.name,
          city: project.city,
          route_id:
            databaseRouteId,
          section_mode:
            project.sectionMode,
          start_stop_id:
            project.startStopId,
          end_stop_id:
            project.endStopId,
          summary:
            project.summary ?? "",
          description:
            project.description ?? "",
          cover_image_path:
            project.coverImage?.path ??
            null,
          cover_image_filename:
            project.coverImage
              ?.filename ?? null,
          cover_image_mime_type:
            project.coverImage
              ?.mimeType ?? null,
          cover_image_size_bytes:
            project.coverImage
              ?.sizeBytes ?? null,
          duration_minutes:
            project.durationMinutes ??
            null,
          available_from:
            project.availableFrom ?? null,
          available_to:
            project.availableTo ?? null,
          age_guidance:
            project.ageGuidance ?? "all_ages",
          start_longitude:
            project.startCoordinates?.[0] ??
            null,
          start_latitude:
            project.startCoordinates?.[1] ??
            null,
          visibility:
            project.visibility ??
            "private",
          access_type:
            project.accessType ??
            "free",
          price_pence:
            project.pricePence ?? null,
          currency:
            project.currency ?? "GBP",
          language_code:
            project.languageCode ??
            "en-GB",
          published_at:
            project.publishedAt ?? null,
          rights_confirmed_at:
            project.rightsConfirmedAt ??
            null,
          status: project.status,
        },
        {
          onConflict: "id",
        }
      );

  if (experienceError) {
    throw experienceError;
  }

  const {
    data: existingGallery,
    error: existingGalleryError,
  } = await supabase
    .from("experience_gallery_images")
    .select("id, path")
    .eq("experience_id", project.id);

  if (existingGalleryError) {
    throw existingGalleryError;
  }

  const currentGalleryPaths = new Set(
    project.galleryImages.map((image) => image.path)
  );
  const staleGallery = (existingGallery ?? []).filter(
    (item) => !currentGalleryPaths.has(item.path)
  );

  if ((existingGallery ?? []).length > 0) {
    const { error: galleryDeleteError } = await supabase
      .from("experience_gallery_images")
      .delete()
      .in("id", (existingGallery ?? []).map((item) => item.id));

    if (galleryDeleteError) {
      throw galleryDeleteError;
    }
  }

  if (project.galleryImages.length > 0) {
    const { error: galleryError } = await supabase
      .from("experience_gallery_images")
      .insert(
        project.galleryImages.map((image, position) => ({
          id:
            (existingGallery ?? []).find(
              (item) => item.path === image.path
            )?.id ?? crypto.randomUUID(),
          experience_id: project.id,
          path: image.path,
          filename: image.filename,
          mime_type: image.mimeType,
          size_bytes: image.sizeBytes,
          position,
        }))
      );

    if (galleryError) {
      throw galleryError;
    }
  }

  if (staleGallery.length > 0) {
    const { error: galleryMediaError } = await supabase.storage
      .from("tour-media")
      .remove(staleGallery.map((item) => item.path));

    if (galleryMediaError) {
      throw new Error(galleryMediaError.message);
    }
  }

  const {
    data: existingStories,
    error: existingStoriesError,
  } =
    await supabase
      .from("stories")
      .select(
        "id, audio_path, image_path"
      )
      .eq(
        "experience_id",
        project.id
      );

  if (existingStoriesError) {
    throw existingStoriesError;
  }

  if (project.stories.length > 0) {
    const storyRows =
      project.stories.map(
        (story) => ({
          id: story.id,
          experience_id:
            project.id,
          title: story.title,
          notes: story.text,
          story_type: story.type,
          subject_longitude:
            story
              .subjectCoordinates[0],
          subject_latitude:
            story
              .subjectCoordinates[1],
          route_progress:
            story.routeProgress,

          audio_path:
            story.audio?.path ??
            null,

          audio_filename:
            story.audio
              ?.filename ?? null,

          audio_mime_type:
            story.audio
              ?.mimeType ?? null,

          audio_size_bytes:
            story.audio
              ?.sizeBytes ?? null,

          audio_duration_seconds:
            story.audio
              ?.durationSeconds ?? null,

          image_path:
            story.image?.path ??
            null,

          image_filename:
            story.image
              ?.filename ?? null,

          image_mime_type:
            story.image
              ?.mimeType ?? null,

          image_size_bytes:
            story.image
              ?.sizeBytes ?? null,
        })
      );

    const {
      error: storiesError,
    } =
      await supabase
        .from("stories")
        .upsert(
          storyRows,
          {
            onConflict: "id",
          }
        );

    if (storiesError) {
      throw storiesError;
    }
  }

  const currentStoryIds =
    new Set(
      project.stories.map(
        (story) => story.id
      )
    );

  const staleStoryIds =
    (existingStories ?? [])
      .map((story) => story.id)
      .filter(
        (id) =>
          !currentStoryIds.has(id)
      );

  const currentStoriesById =
    new Map(
      project.stories.map(
        (story) => [
          story.id,
          story,
        ]
      )
    );

  const obsoleteMediaPaths =
    Array.from(
      new Set(
        (existingStories ?? [])
          .flatMap(
            (story) => {
              const currentStory =
                currentStoriesById.get(
                  story.id
                );

              const paths: string[] =
                [];

              if (
                story.audio_path &&
                story.audio_path !==
                  currentStory?.audio
                    ?.path
              ) {
                paths.push(
                  story.audio_path
                );
              }

              if (
                story.image_path &&
                story.image_path !==
                  currentStory?.image
                    ?.path
              ) {
                paths.push(
                  story.image_path
                );
              }

              return paths;
            }
          )
      )
    );

  if (staleStoryIds.length > 0) {
    const {
      error: deleteError,
    } =
      await supabase
        .from("stories")
        .delete()
        .in(
          "id",
          staleStoryIds
        );

    if (deleteError) {
      throw deleteError;
    }
  }

  if (
    obsoleteMediaPaths.length > 0
  ) {
    const {
      error: mediaDeleteError,
    } =
      await supabase.storage
        .from("story-media")
        .remove(
          obsoleteMediaPaths
        );

    if (mediaDeleteError) {
      throw new Error(
        `The draft was saved, but old media could not be removed: ${mediaDeleteError.message}`
      );
    }
  }
}

type MediaKind =
  | "audio"
  | "image";

function getExtension(
  file: File,
  kind: MediaKind
) {
  const extension =
    file.name
      .split(".")
      .pop()
      ?.toLowerCase();

  if (
    extension &&
    /^[a-z0-9]+$/.test(
      extension
    )
  ) {
    return extension;
  }

  if (kind === "audio") {
    return file.type ===
      "audio/wav"
      ? "wav"
      : file.type ===
            "audio/mp4" ||
          file.type ===
            "audio/x-m4a"
        ? "m4a"
        : "mp3";
  }

  return file.type ===
    "image/png"
    ? "png"
    : file.type ===
        "image/webp"
      ? "webp"
      : "jpg";
}

export async function uploadStoryMedia(
  supabase: SupabaseClient,
  projectId: string,
  storyId: string,
  kind: MediaKind,
  file: File
): Promise<MediaAttachment> {
  const maximumSize =
    25 * 1024 * 1024;

  if (file.size > maximumSize) {
    throw new Error(
      "Files must be 25 MB or smaller."
    );
  }

  const allowedAudioTypes =
    new Set([
      "audio/mpeg",
      "audio/mp4",
      "audio/x-m4a",
      "audio/wav",
      "audio/x-wav",
    ]);

  const allowedImageTypes =
    new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);

  const allowedTypes =
    kind === "audio"
      ? allowedAudioTypes
      : allowedImageTypes;

  if (
    !allowedTypes.has(file.type)
  ) {
    throw new Error(
      kind === "audio"
        ? "Choose an MP3, M4A or WAV audio file."
        : "Choose a JPG, PNG or WebP image."
    );
  }

  const {
    data: { user },
    error: userError,
  } =
    await supabase.auth.getUser();

  if (userError || !user) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  const extension =
    getExtension(file, kind);

  const path =
    `${user.id}/${projectId}/${storyId}/${kind}.${extension}`;

  const durationSeconds =
    kind === "audio"
      ? await readAudioDuration(file)
      : undefined;

  const { error: uploadError } =
    await supabase.storage
      .from("story-media")
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: true,
      });

  if (uploadError) {
    throw new Error(
      uploadError.message
    );
  }

  const {
    data: signedData,
    error: signedError,
  } =
    await supabase.storage
      .from("story-media")
      .createSignedUrl(
        path,
        60 * 60
      );

  if (signedError) {
    throw new Error(
      signedError.message
    );
  }

  return {
    path,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    durationSeconds,
    url: signedData.signedUrl,
  };
}

async function readAudioDuration(
  file: File
): Promise<number | undefined> {
  if (
    typeof document === "undefined" ||
    typeof URL === "undefined"
  ) {
    return undefined;
  }

  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    const objectUrl = URL.createObjectURL(file);
    let settled = false;

    const finish = (duration?: number) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      audio.removeAttribute("src");
      audio.load();
      URL.revokeObjectURL(objectUrl);
      resolve(
        duration && Number.isFinite(duration)
          ? Math.round(duration * 10) / 10
          : undefined
      );
    };

    const timeoutId = window.setTimeout(
      () => finish(),
      10000
    );

    audio.preload = "metadata";
    audio.onloadedmetadata = () =>
      finish(audio.duration);
    audio.onerror = () => finish();
    audio.src = objectUrl;
  });
}

function validateImageFile(
  file: File,
  maximumSize: number
) {
  const allowedTypes =
    new Set([
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);

  if (file.size > maximumSize) {
    throw new Error(
      `Images must be ${Math.round(
        maximumSize /
          (1024 * 1024)
      )} MB or smaller.`
    );
  }

  if (!allowedTypes.has(file.type)) {
    throw new Error(
      "Choose a JPG, PNG or WebP image."
    );
  }
}

async function getCurrentUser(
  supabase: SupabaseClient
) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error(
      "Your session has expired. Please sign in again."
    );
  }

  return user;
}

export async function uploadTourCover(
  supabase: SupabaseClient,
  projectId: string,
  file: File
): Promise<MediaAttachment> {
  validateImageFile(
    file,
    10 * 1024 * 1024
  );

  const user =
    await getCurrentUser(
      supabase
    );

  const extension =
    getExtension(file, "image");

  const path =
    `${user.id}/${projectId}/cover.${extension}`;

  const { error: uploadError } =
    await supabase.storage
      .from("tour-media")
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: true,
      });

  if (uploadError) {
    throw new Error(
      uploadError.message
    );
  }

  const {
    data: signedData,
    error: signedError,
  } = await supabase.storage
    .from("tour-media")
    .createSignedUrl(
      path,
      60 * 60
    );

  if (signedError) {
    throw new Error(
      signedError.message
    );
  }

  return {
    path,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    url: signedData.signedUrl,
  };
}

export async function uploadTourGalleryImage(
  supabase: SupabaseClient,
  projectId: string,
  position: number,
  file: File
): Promise<MediaAttachment> {
  validateImageFile(file, 10 * 1024 * 1024);

  const user = await getCurrentUser(supabase);
  const extension = getExtension(file, "image");
  const path = `${user.id}/${projectId}/gallery-${position}-${crypto.randomUUID()}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("tour-media")
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data, error } = await supabase.storage
    .from("tour-media")
    .createSignedUrl(path, 60 * 60);

  if (error) {
    throw new Error(error.message);
  }

  return {
    path,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    url: data.signedUrl,
  };
}

export async function loadCreatorProfile(
  supabase: SupabaseClient
): Promise<CreatorProfile | null> {
  const user =
    await getCurrentUser(
      supabase
    );

  const { data, error } =
    await supabase
      .from("creator_profiles")
      .select(`
        id,
        display_name,
        bio,
        avatar_path,
        avatar_filename,
        avatar_mime_type,
        avatar_size_bytes,
        left_prompt_path,
        left_prompt_filename,
        left_prompt_mime_type,
        left_prompt_size_bytes,
        right_prompt_path,
        right_prompt_filename,
        right_prompt_mime_type,
        right_prompt_size_bytes,
        is_public,
        updated_at
      `)
      .eq("id", user.id)
      .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    return null;
  }

  const row =
    data as DatabaseCreatorProfile;

  const profileMediaPaths = [
    row.avatar_path,
    row.left_prompt_path,
    row.right_prompt_path,
  ].filter(
    (path): path is string => Boolean(path)
  );

  const profileMediaUrls = new Map<string, string>();

  if (profileMediaPaths.length > 0) {
    const {
      data: signedData,
      error: signedError,
    } = await supabase.storage
      .from("profile-media")
      .createSignedUrls(
        profileMediaPaths,
        60 * 60
      );

    if (signedError) {
      throw new Error(
        signedError.message
      );
    }

    (signedData ?? []).forEach((item, index) => {
      if (item.signedUrl) {
        profileMediaUrls.set(
          profileMediaPaths[index],
          item.signedUrl
        );
      }
    });
  }

  return {
    id: row.id,
    displayName:
      row.display_name,
    bio: row.bio,
    avatar:
      row.avatar_path
        ? {
            path: row.avatar_path,
            filename:
              row.avatar_filename ??
              "Profile image",
            mimeType:
              row.avatar_mime_type ??
              "image/jpeg",
            sizeBytes:
              row.avatar_size_bytes ??
              0,
            url: profileMediaUrls.get(row.avatar_path),
          }
        : undefined,
    leftPrompt:
      row.left_prompt_path
        ? {
            path: row.left_prompt_path,
            filename:
              row.left_prompt_filename ?? "Look left prompt",
            mimeType:
              row.left_prompt_mime_type ?? "audio/mpeg",
            sizeBytes:
              row.left_prompt_size_bytes ?? 0,
            url: profileMediaUrls.get(row.left_prompt_path),
          }
        : undefined,
    rightPrompt:
      row.right_prompt_path
        ? {
            path: row.right_prompt_path,
            filename:
              row.right_prompt_filename ?? "Look right prompt",
            mimeType:
              row.right_prompt_mime_type ?? "audio/mpeg",
            sizeBytes:
              row.right_prompt_size_bytes ?? 0,
            url: profileMediaUrls.get(row.right_prompt_path),
          }
        : undefined,
    isPublic: row.is_public,
    updatedAt: row.updated_at,
  };
}

export async function uploadProfileAvatar(
  supabase: SupabaseClient,
  file: File
): Promise<MediaAttachment> {
  validateImageFile(
    file,
    5 * 1024 * 1024
  );

  const user =
    await getCurrentUser(
      supabase
    );

  const extension =
    getExtension(file, "image");

  const path =
    `${user.id}/avatar.${extension}`;

  const { error: uploadError } =
    await supabase.storage
      .from("profile-media")
      .upload(path, file, {
        cacheControl: "3600",
        contentType: file.type,
        upsert: true,
      });

  if (uploadError) {
    throw new Error(
      uploadError.message
    );
  }

  const {
    data: signedData,
    error: signedError,
  } = await supabase.storage
    .from("profile-media")
    .createSignedUrl(
      path,
      60 * 60
    );

  if (signedError) {
    throw new Error(
      signedError.message
    );
  }

  return {
    path,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    url: signedData.signedUrl,
  };
}

export async function uploadProfileDirectionPrompt(
  supabase: SupabaseClient,
  side: "left" | "right",
  file: File
): Promise<MediaAttachment> {
  const maximumSize = 25 * 1024 * 1024;
  const allowedAudioTypes = new Set([
    "audio/mpeg",
    "audio/mp4",
    "audio/x-m4a",
    "audio/wav",
    "audio/x-wav",
  ]);

  if (file.size > maximumSize) {
    throw new Error("Audio files must be 25 MB or smaller.");
  }

  if (!allowedAudioTypes.has(file.type)) {
    throw new Error("Choose an MP3, M4A or WAV audio file.");
  }

  const user = await getCurrentUser(supabase);
  const extension = getExtension(file, "audio");
  const path = `${user.id}/direction-${side}.${extension}`;

  const { error: uploadError } = await supabase.storage
    .from("profile-media")
    .upload(path, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(uploadError.message);
  }

  const { data: signedData, error: signedError } =
    await supabase.storage
      .from("profile-media")
      .createSignedUrl(path, 60 * 60);

  if (signedError) {
    throw new Error(signedError.message);
  }

  return {
    path,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
    url: signedData.signedUrl,
  };
}

export async function saveCreatorProfile(
  supabase: SupabaseClient,
  profile: Omit<
    CreatorProfile,
    "id" | "updatedAt"
  >
) {
  const user =
    await getCurrentUser(
      supabase
    );

  const { error } =
    await supabase
      .from("creator_profiles")
      .upsert(
        {
          id: user.id,
          display_name:
            profile.displayName.trim(),
          bio: profile.bio.trim(),
          avatar_path:
            profile.avatar?.path ??
            null,
          avatar_filename:
            profile.avatar?.filename ??
            null,
          avatar_mime_type:
            profile.avatar?.mimeType ??
            null,
          avatar_size_bytes:
            profile.avatar?.sizeBytes ??
            null,
          left_prompt_path:
            profile.leftPrompt?.path ?? null,
          left_prompt_filename:
            profile.leftPrompt?.filename ?? null,
          left_prompt_mime_type:
            profile.leftPrompt?.mimeType ?? null,
          left_prompt_size_bytes:
            profile.leftPrompt?.sizeBytes ?? null,
          right_prompt_path:
            profile.rightPrompt?.path ?? null,
          right_prompt_filename:
            profile.rightPrompt?.filename ?? null,
          right_prompt_mime_type:
            profile.rightPrompt?.mimeType ?? null,
          right_prompt_size_bytes:
            profile.rightPrompt?.sizeBytes ?? null,
          is_public:
            profile.isPublic,
        },
        {
          onConflict: "id",
        }
      );

  if (error) {
    throw error;
  }
}

export async function removeMediaFile(
  supabase: SupabaseClient,
  bucket: "tour-media" | "profile-media",
  path: string
) {
  const { error } =
    await supabase.storage
      .from(bucket)
      .remove([path]);

  if (error) {
    throw new Error(
      error.message
    );
  }
}

export async function deleteCreatorProject(
  supabase: SupabaseClient,
  projectId: string
) {
  const {
    data: project,
    error: projectError,
  } = await supabase
    .from("experiences")
    .select("cover_image_path")
    .eq("id", projectId)
    .maybeSingle();

  if (projectError) {
    throw projectError;
  }

  const {
    data: projectGallery,
    error: galleryError,
  } = await supabase
    .from("experience_gallery_images")
    .select("path")
    .eq("experience_id", projectId);

  if (galleryError) {
    throw galleryError;
  }

  const {
    data: projectStories,
    error: storiesError,
  } =
    await supabase
      .from("stories")
      .select(
        "audio_path, image_path"
      )
      .eq(
        "experience_id",
        projectId
      );

  if (storiesError) {
    throw storiesError;
  }

  const mediaPaths =
    Array.from(
      new Set(
        (projectStories ?? [])
          .flatMap(
            (story) => [
              story.audio_path,
              story.image_path,
            ]
          )
          .filter(
            (
              path
            ): path is string =>
              Boolean(path)
          )
      )
    );

  if (mediaPaths.length > 0) {
    const {
      error: mediaError,
    } =
      await supabase.storage
        .from("story-media")
        .remove(mediaPaths);

    if (mediaError) {
      throw new Error(
        mediaError.message
      );
    }
  }

  const tourMediaPaths = [
    project?.cover_image_path,
    ...(projectGallery ?? []).map((image) => image.path),
  ].filter((path): path is string => Boolean(path));

  if (tourMediaPaths.length > 0) {
    const {
      error: coverError,
    } = await supabase.storage
      .from("tour-media")
      .remove(tourMediaPaths);

    if (coverError) {
      throw new Error(
        coverError.message
      );
    }
  }

  const { error } =
    await supabase
      .from("experiences")
      .delete()
      .eq("id", projectId);

  if (error) {
    throw error;
  }
}
