import { NextResponse } from "next/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

import {
  createClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

function getSupabaseAdmin() {
  const url =
    process.env.NEXT_PUBLIC_SUPABASE_URL;

  const serviceRoleKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      "Supabase service role configuration is missing."
    );
  }

  return createAdminClient(
    url,
    serviceRoleKey,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );
}

export async function POST(
  request: Request
) {
  try {
    const supabase =
      await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return NextResponse.json(
        { error: "Sign in to update this purchase." },
        { status: 401 }
      );
    }

    const body =
      await request.json();

    const experienceId =
      typeof body.experienceId === "string"
        ? body.experienceId
        : "";

    const action =
      body.action === "start" ||
      body.action === "complete"
        ? body.action
        : null;

    if (!experienceId || !action) {
      return NextResponse.json(
        { error: "Purchase lifecycle request is incomplete." },
        { status: 400 }
      );
    }

    const admin =
      getSupabaseAdmin();

    const {
      data: purchase,
      error: purchaseError,
    } = await admin
      .from("passenger_purchases")
      .select(`
        id,
        status,
        started_at,
        completed_at
      `)
      .eq("user_id", user.id)
      .eq("experience_id", experienceId)
      .maybeSingle();

    if (purchaseError) {
      throw purchaseError;
    }

    if (
      !purchase ||
      purchase.status !== "paid"
    ) {
      return NextResponse.json(
        { error: "No paid purchase was found for this tour." },
        { status: 404 }
      );
    }

    if (purchase.completed_at) {
      return NextResponse.json({
        startedAt: purchase.started_at,
        completedAt: purchase.completed_at,
      });
    }

    const now =
      new Date().toISOString();

    const update =
      action === "complete"
        ? {
            started_at:
              purchase.started_at ?? now,
            completed_at: now,
          }
        : purchase.started_at
          ? {}
          : {
              started_at: now,
            };

    if (Object.keys(update).length > 0) {
      const {
        error: updateError,
      } = await admin
        .from("passenger_purchases")
        .update(update)
        .eq("id", purchase.id);

      if (updateError) {
        throw updateError;
      }
    }

    return NextResponse.json({
      startedAt:
        purchase.started_at ??
        now,
      completedAt:
        action === "complete"
          ? now
          : null,
    });
  } catch (error) {
    console.error(
      "Paid tour lifecycle error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Purchase status could not be updated.",
      },
      { status: 500 }
    );
  }
}
