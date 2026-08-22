import type { SupabaseClient } from "@supabase/supabase-js";

export type HomepageImage = {
  id: string;
  city: string;
  imagePath: string;
  imageUrl: string | null;
  altText: string;
  isHero: boolean;
  isActive: boolean;
  displayOrder: number;
  createdAt: string;
  updatedAt: string;
};

type HomepageImageRow = {
  id: string;
  city: string;
  image_path: string;
  alt_text: string;
  is_hero: boolean;
  is_active: boolean;
  display_order: number;
  created_at: string;
  updated_at: string;
};

const HOMEPAGE_BUCKET = "homepage-media";
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = [
  "image/jpeg",
  "image/png",
  "image/webp",
];

function extensionForFile(file: File) {
  const extension = file.name.split(".").pop()?.toLowerCase();

  if (extension && ["jpg", "jpeg", "png", "webp"].includes(extension)) {
    return extension === "jpeg" ? "jpg" : extension;
  }

  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

function mapRow(
  row: HomepageImageRow,
  imageUrl: string | null
): HomepageImage {
  return {
    id: row.id,
    city: row.city,
    imagePath: row.image_path,
    imageUrl,
    altText: row.alt_text,
    isHero: row.is_hero,
    isActive: row.is_active,
    displayOrder: row.display_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadHomepageImages(
  supabase: SupabaseClient,
  options?: {
    city?: string;
    includeInactive?: boolean;
  }
): Promise<HomepageImage[]> {
  let query = supabase
    .from("homepage_images")
    .select(
      "id, city, image_path, alt_text, is_hero, is_active, display_order, created_at, updated_at"
    )
    .order("city", { ascending: true })
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!options?.includeInactive) {
    query = query.eq("is_active", true);
  }

  if (options?.city) {
    query = query.in("city", [options.city, "Global"]);
  }

  const { data, error } = await query;

  if (error) throw error;

  const rows = (data ?? []) as HomepageImageRow[];

  return rows.map((row) => {
    const {
      data: { publicUrl },
    } = supabase.storage
      .from(HOMEPAGE_BUCKET)
      .getPublicUrl(row.image_path);

    return mapRow(row, publicUrl || null);
  });
}

export async function uploadHomepageImage(
  supabase: SupabaseClient,
  imageId: string,
  file: File
) {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
    throw new Error("Use a JPG, PNG or WebP image.");
  }

  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Homepage images must be 10 MB or smaller.");
  }

  const extension = extensionForFile(file);
  const path = `${imageId}/${crypto.randomUUID()}.${extension}`;

  const { error } = await supabase.storage
    .from(HOMEPAGE_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });

  if (error) throw error;

  return path;
}

export async function removeHomepageImage(
  supabase: SupabaseClient,
  path: string
) {
  const { error } = await supabase.storage
    .from(HOMEPAGE_BUCKET)
    .remove([path]);

  if (error) throw error;
}

export function chooseHomepageImages(
  images: HomepageImage[],
  city: string
) {
  const cityImages = images
    .filter(
      (image) =>
        image.isActive &&
        image.city.toLocaleLowerCase("en-GB") ===
          city.toLocaleLowerCase("en-GB")
    )
    .sort((a, b) => a.displayOrder - b.displayOrder);

  const globalImages = images
    .filter(
      (image) =>
        image.isActive &&
        image.city.toLocaleLowerCase("en-GB") === "global"
    )
    .sort((a, b) => a.displayOrder - b.displayOrder);

  return cityImages.length > 0 ? cityImages : globalImages;
}
