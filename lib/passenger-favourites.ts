import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadAndSyncPassengerFavourites(
  supabase: SupabaseClient,
  localExperienceIds: string[]
) {
  if (localExperienceIds.length > 0) {
    const { error: syncError } = await supabase
      .from("passenger_favourites")
      .upsert(
        localExperienceIds.map((experienceId) => ({
          experience_id: experienceId,
        })),
        { onConflict: "user_id,experience_id", ignoreDuplicates: true }
      );

    if (syncError) throw syncError;
  }

  const { data, error } = await supabase
    .from("passenger_favourites")
    .select("experience_id");

  if (error) throw error;
  return (data ?? []).map((item) => item.experience_id as string);
}

export async function savePassengerFavourite(
  supabase: SupabaseClient,
  experienceId: string,
  isFavourite: boolean
) {
  if (isFavourite) {
    const { error } = await supabase
      .from("passenger_favourites")
      .upsert(
        { experience_id: experienceId },
        { onConflict: "user_id,experience_id", ignoreDuplicates: true }
      );
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from("passenger_favourites")
    .delete()
    .eq("experience_id", experienceId);
  if (error) throw error;
}
