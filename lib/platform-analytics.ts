import type { SupabaseClient } from "@supabase/supabase-js";

const analyticsDeviceKey = "between-stops-analytics-device";

function getDeviceToken() {
  const existing = localStorage.getItem(analyticsDeviceKey);
  if (existing) return existing;
  const token = crypto.randomUUID();
  localStorage.setItem(analyticsDeviceKey, token);
  return token;
}

export async function recordTourAnalyticsEvent(
  supabase: SupabaseClient,
  event: {
    eventType: "tour_started" | "tour_completed" | "recommendation_clicked";
    experienceId: string;
    journeyId?: string;
    recommendationId?: string;
  }
) {
  const { error } = await supabase.rpc("record_tour_analytics_event", {
    p_event_type: event.eventType,
    p_experience_id: event.experienceId,
    p_journey_id: event.journeyId ?? null,
    p_recommendation_id: event.recommendationId ?? null,
    p_device_token: getDeviceToken(),
  });

  if (error) throw error;
}
