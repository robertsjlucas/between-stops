import type {
  SupabaseClient,
} from "@supabase/supabase-js";

export type RatingSummary = {
  experienceId: string;
  averageRating: number;
  reviewCount: number;
};

export type PublicPassengerReview = {
  id: string;
  rating: number;
  reviewText: string;
  createdAt: string;
};

export type PassengerReviewStatus =
  | "pending"
  | "approved"
  | "hidden";

export type AdminPassengerReview = PublicPassengerReview & {
  experienceId: string;
  experienceTitle: string;
  moderationStatus: PassengerReviewStatus;
};

type RatingSummaryRow = {
  experience_id: string;
  average_rating: number | string;
  review_count: number | string;
};

type PublicReviewRow = {
  id: string;
  rating: number;
  review_text: string;
  created_at: string;
};

type AdminReviewRow = PublicReviewRow & {
  experience_id: string;
  moderation_status: PassengerReviewStatus;
  experiences: { title: string } | { title: string }[] | null;
};

export async function loadRatingSummaries(
  supabase: SupabaseClient
) {
  const { data, error } = await supabase.rpc(
    "get_public_experience_ratings"
  );

  if (error) throw error;

  return ((data ?? []) as RatingSummaryRow[]).map(
    (row): RatingSummary => ({
      experienceId: row.experience_id,
      averageRating: Number(row.average_rating),
      reviewCount: Number(row.review_count),
    })
  );
}

export async function loadPublicPassengerReviews(
  supabase: SupabaseClient,
  experienceId: string
) {
  const { data, error } = await supabase.rpc(
    "get_public_experience_reviews",
    { p_experience_id: experienceId }
  );

  if (error) throw error;

  return ((data ?? []) as PublicReviewRow[]).map(
    (row): PublicPassengerReview => ({
      id: row.id,
      rating: row.rating,
      reviewText: row.review_text,
      createdAt: row.created_at,
    })
  );
}

export async function submitPassengerReview(
  supabase: SupabaseClient,
  input: {
    experienceId: string;
    deviceToken: string;
    rating: number;
    reviewText: string;
  }
) {
  const reviewText = input.reviewText.trim();
  const { error } = await supabase
    .from("passenger_reviews")
    .insert({
      experience_id: input.experienceId,
      device_token: input.deviceToken,
      rating: input.rating,
      review_text: reviewText,
      moderation_status: reviewText ? "pending" : "approved",
    });

  if (error) throw error;
}

export async function loadAdminPassengerReviews(
  supabase: SupabaseClient
) {
  const { data, error } = await supabase
    .from("passenger_reviews")
    .select(`
      id,
      experience_id,
      rating,
      review_text,
      moderation_status,
      created_at,
      experiences (title)
    `)
    .order("created_at", { ascending: false });

  if (error) throw error;

  return ((data ?? []) as AdminReviewRow[]).map(
    (row): AdminPassengerReview => {
      const experience = Array.isArray(row.experiences)
        ? row.experiences[0]
        : row.experiences;

      return {
        id: row.id,
        experienceId: row.experience_id,
        experienceTitle: experience?.title ?? "Untitled tour",
        rating: row.rating,
        reviewText: row.review_text,
        moderationStatus: row.moderation_status,
        createdAt: row.created_at,
      };
    }
  );
}

export async function moderatePassengerReview(
  supabase: SupabaseClient,
  reviewId: string,
  moderationStatus: PassengerReviewStatus
) {
  const { error } = await supabase
    .from("passenger_reviews")
    .update({
      moderation_status: moderationStatus,
      updated_at: new Date().toISOString(),
    })
    .eq("id", reviewId);

  if (error) throw error;
}

export async function deletePassengerReview(
  supabase: SupabaseClient,
  reviewId: string
) {
  const { error } = await supabase
    .from("passenger_reviews")
    .delete()
    .eq("id", reviewId);

  if (error) throw error;
}
