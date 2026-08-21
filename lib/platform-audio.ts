import type {
  SupabaseClient,
} from "@supabase/supabase-js";

export type PlatformAudioKey =
  | "welcome"
  | "next_stop"
  | "tour_end";

export type PlatformAudioItem = {
  key: PlatformAudioKey;
  path: string | null;
  url: string | null;
};

export const platformAudioLabels:
Record<PlatformAudioKey, {
  title: string;
  description: string;
}> = {
  welcome: {
    title: "Welcome",
    description:
      "Plays once when the passenger starts a tour.",
  },
  next_stop: {
    title: "Next stop",
    description:
      "Warns the passenger that the next stop is where they should get off.",
  },
  tour_end: {
    title: "End of tour",
    description:
      "Plays when the passenger reaches the destination and completes the tour.",
  },
};

export async function loadPlatformAudio(
  supabase: SupabaseClient
): Promise<PlatformAudioItem[]> {
  const { data, error } = await supabase
    .from("platform_audio")
    .select("audio_key, storage_path");

  if (error) throw error;

  return (
    (data ?? []) as {
      audio_key: PlatformAudioKey;
      storage_path: string | null;
    }[]
  ).map((row) => {
    const url = row.storage_path
      ? supabase.storage
          .from("platform-audio")
          .getPublicUrl(row.storage_path)
          .data.publicUrl
      : null;

    return {
      key: row.audio_key,
      path: row.storage_path,
      url,
    };
  });
}

export async function uploadPlatformAudio(
  supabase: SupabaseClient,
  key: PlatformAudioKey,
  file: File,
  userId: string
) {
  if (!file.type.startsWith("audio/")) {
    throw new Error("Choose an audio file.");
  }

  if (file.size > 10 * 1024 * 1024) {
    throw new Error(
      "Platform audio must be smaller than 10 MB."
    );
  }

  const extension =
    file.name.split(".").pop()?.toLowerCase() ||
    "mp3";

  const path =
    `${key}/${Date.now()}.${extension}`;

  const { error: uploadError } =
    await supabase.storage
      .from("platform-audio")
      .upload(path, file, {
        cacheControl: "3600",
        upsert: false,
        contentType: file.type,
      });

  if (uploadError) throw uploadError;

  const { data: existing } = await supabase
    .from("platform_audio")
    .select("storage_path")
    .eq("audio_key", key)
    .maybeSingle();

  const { error: updateError } = await supabase
    .from("platform_audio")
    .update({
      storage_path: path,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("audio_key", key);

  if (updateError) {
    await supabase.storage
      .from("platform-audio")
      .remove([path]);
    throw updateError;
  }

  if (
    existing?.storage_path &&
    existing.storage_path !== path
  ) {
    await supabase.storage
      .from("platform-audio")
      .remove([existing.storage_path]);
  }
}
