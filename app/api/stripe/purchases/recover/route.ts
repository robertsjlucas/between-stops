import { NextResponse } from "next/server";
import Stripe from "stripe";
import { createClient as createAdminClient } from "@supabase/supabase-js";

import {
  createClient,
} from "@/lib/supabase/server";

export const runtime = "nodejs";

function getStripe() {
  const key =
    process.env.STRIPE_SECRET_KEY;

  if (!key) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured."
    );
  }

  return new Stripe(key);
}

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
        {
          error:
            "Sign in to restore purchases.",
        },
        { status: 401 }
      );
    }

    const body =
      await request.json();

    const experienceId =
      typeof body.experienceId === "string"
        ? body.experienceId
        : "";

    if (!experienceId) {
      return NextResponse.json(
        {
          error:
            "Tour is missing.",
        },
        { status: 400 }
      );
    }

    const admin =
      getSupabaseAdmin();

    const {
      data: experience,
      error: experienceError,
    } = await admin
      .from("experiences")
      .select(
        "id, price_pence, currency"
      )
      .eq("id", experienceId)
      .maybeSingle();

    if (
      experienceError ||
      !experience
    ) {
      throw (
        experienceError ??
        new Error(
          "Tour could not be found."
        )
      );
    }

    const stripe =
      getStripe();

    const sessions =
      await stripe.checkout.sessions.list({
        limit: 100,
      });

    const matchingSession =
      sessions.data.find(
        (session) =>
          session.metadata
            ?.between_stops_user_id ===
            user.id &&
          session.metadata
            ?.between_stops_experience_id ===
            experienceId &&
          session.payment_status === "paid"
      );

    if (!matchingSession) {
      return NextResponse.json({
        recovered: false,
      });
    }

    const amountPence =
      matchingSession.amount_total ??
      experience.price_pence;

    if (
      !Number.isInteger(amountPence) ||
      amountPence < 0
    ) {
      throw new Error(
        "Payment amount is invalid."
      );
    }

    const creatorAmountPence =
      Math.floor(
        amountPence * 0.75
      );

    const platformAmountPence =
      amountPence -
      creatorAmountPence;

    const paymentIntentId =
      typeof matchingSession.payment_intent ===
      "string"
        ? matchingSession.payment_intent
        : matchingSession.payment_intent?.id ??
          null;

    const {
      error: purchaseError,
    } = await admin
      .from("passenger_purchases")
      .upsert(
        {
          user_id: user.id,
          experience_id:
            experienceId,

          stripe_checkout_session_id:
            matchingSession.id,

          stripe_payment_intent_id:
            paymentIntentId,

          amount_pence:
            amountPence,

          currency:
            (
              matchingSession.currency ??
              experience.currency ??
              "gbp"
            ).toLowerCase(),

          creator_amount_pence:
            creatorAmountPence,

          platform_amount_pence:
            platformAmountPence,

          status: "paid",

          purchased_at:
            new Date(
              matchingSession.created * 1000
            ).toISOString(),
        },
        {
          onConflict:
            "user_id,experience_id",
        }
      );

    if (purchaseError) {
      throw purchaseError;
    }

    return NextResponse.json({
      recovered: true,
    });
  } catch (error) {
    console.error(
      "Stripe purchase recovery error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Purchase could not be recovered.",
      },
      { status: 500 }
    );
  }
}
