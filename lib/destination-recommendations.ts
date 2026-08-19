import type {
  SupabaseClient,
} from "@supabase/supabase-js";

export type RecommendationPlacement =
  | "editorial"
  | "sponsored";

export const recommendationCategories = [
  ["food_drink", "Food & drink"],
  ["museum", "Museum"],
  ["attraction", "Attraction"],
  ["peace_quiet", "Peace & quiet"],
  ["great_view", "A great view"],
  ["walk", "Walk"],
  ["shopping", "Shopping"],
  ["family", "Family"],
  ["events", "Events"],
] as const;

export type RecommendationCategory =
  typeof recommendationCategories[number][0];

export function getRecommendationCategoryLabel(
  category: RecommendationCategory
) {
  return recommendationCategories.find(
    ([value]) => value === category
  )?.[1] ?? "Attraction";
}

export type DestinationRecommendation = {
  id: string;
  routeId: string;
  stopId: string;
  title: string;
  category: RecommendationCategory;
  summary: string;
  url: string;
  placementType: RecommendationPlacement;
  displayOrder: number;
  isActive: boolean;
  imagePath?: string;
  imageFilename?: string;
  imageMimeType?: string;
  imageSizeBytes?: number;
  imageUrl?: string;
};

type DatabaseRecommendation = {
  id: string;
  route_id: string;
  stop_id: string;
  title: string;
  category: RecommendationCategory;
  summary: string;
  url: string;
  placement_type: RecommendationPlacement;
  display_order: number;
  is_active: boolean;
  image_path: string | null;
  image_filename: string | null;
  image_mime_type: string | null;
  image_size_bytes: number | null;
};

const recommendationColumns = `
  id,
  route_id,
  stop_id,
  title,
  category,
  summary,
  url,
  placement_type,
  display_order,
  is_active,
  image_path,
  image_filename,
  image_mime_type,
  image_size_bytes
`;

function mapRecommendation(
  row: DatabaseRecommendation,
  imageUrl?: string
): DestinationRecommendation {
  return {
    id: row.id,
    routeId: row.route_id,
    stopId: row.stop_id,
    title: row.title,
    category: row.category,
    summary: row.summary,
    url: row.url,
    placementType: row.placement_type,
    displayOrder: row.display_order,
    isActive: row.is_active,
    imagePath: row.image_path ?? undefined,
    imageFilename: row.image_filename ?? undefined,
    imageMimeType: row.image_mime_type ?? undefined,
    imageSizeBytes: row.image_size_bytes ?? undefined,
    imageUrl,
  };
}

async function hydrateRecommendations(
  supabase: SupabaseClient,
  rows: DatabaseRecommendation[]
) {
  const paths = rows
    .map((row) => row.image_path)
    .filter((path): path is string => Boolean(path));
  const urls = new Map<string, string>();

  if (paths.length > 0) {
    const { data } = await supabase.storage
      .from("recommendation-media")
      .createSignedUrls(paths, 60 * 60);

    (data ?? []).forEach((item, index) => {
      if (item.signedUrl) urls.set(paths[index], item.signedUrl);
    });
  }

  return rows.map((row) =>
    mapRecommendation(
      row,
      row.image_path ? urls.get(row.image_path) : undefined
    )
  );
}

export async function loadDestinationRecommendations(
  supabase: SupabaseClient,
  routeId: string,
  stopId: string
) {
  const { data, error } = await supabase
    .from("destination_recommendations")
    .select(recommendationColumns)
    .eq("route_id", routeId)
    .eq("stop_id", stopId)
    .eq("is_active", true)
    .order("display_order", { ascending: true })
    .order("title", { ascending: true });

  if (error) throw error;

  return hydrateRecommendations(
    supabase,
    (data ?? []) as DatabaseRecommendation[]
  );
}

export async function loadAllDestinationRecommendations(
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from("destination_recommendations")
    .select(recommendationColumns)
    .order("route_id", { ascending: true })
    .order("stop_id", { ascending: true })
    .order("display_order", { ascending: true });

  if (error) throw error;

  return hydrateRecommendations(
    supabase,
    (data ?? []) as DatabaseRecommendation[]
  );
}

export async function uploadRecommendationPhoto(
  supabase: SupabaseClient,
  recommendationId: string,
  file: File
) {
  const allowed = new Set([
    "image/jpeg",
    "image/png",
    "image/webp",
  ]);

  if (!allowed.has(file.type)) {
    throw new Error("Choose a JPG, PNG or WebP image.");
  }

  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Recommendation photographs must be 5 MB or smaller.");
  }

  const { data: userData, error: userError } =
    await supabase.auth.getUser();

  if (userError || !userData.user) {
    throw new Error("Your administrator session has expired.");
  }

  const extension =
    file.type === "image/png"
      ? "png"
      : file.type === "image/webp"
        ? "webp"
        : "jpg";
  const path = `${userData.user.id}/${recommendationId}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from("recommendation-media")
    .upload(path, file, {
      upsert: true,
      contentType: file.type,
      cacheControl: "3600",
    });

  if (uploadError) throw uploadError;

  return {
    path,
    filename: file.name,
    mimeType: file.type,
    sizeBytes: file.size,
  };
}

export async function removeRecommendationPhoto(
  supabase: SupabaseClient,
  path: string
) {
  const { error } = await supabase.storage
    .from("recommendation-media")
    .remove([path]);

  if (error) throw error;
}
