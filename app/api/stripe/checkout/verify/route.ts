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
            "Sign in to confirm this purchase.",
        },
        { status: 401 }
      );
    }

    const body =
      await request.json();

    const sessionId =
      typeof body.sessionId === "string"
        ? body.sessionId
        : "";

    if (!sessionId) {
      return NextResponse.json(
        {
          error:
            "Checkout session is missing.",
        },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    const session =
      await stripe.checkout.sessions.retrieve(
        sessionId,
        {
          expand: ["payment_intent"],
        }
      );

    const paymentIntent =
      typeof session.payment_intent === "string"
        ? await stripe.paymentIntents.retrieve(
            session.payment_intent
          )
        : session.payment_intent;

    const paymentConfirmed =
      session.payment_status === "paid" ||
      paymentIntent?.status === "succeeded";

    if (!paymentConfirmed) {
      return NextResponse.json(
        {
          error:
            `Stripe payment is not complete. Session status: ${session.payment_status}; payment status: ${paymentIntent?.status ?? "unknown"}.`,
        },
        { status: 409 }
      );
    }

    const metadataUserId =
      session.metadata
        ?.between_stops_user_id;

    const experienceId =
      session.metadata
        ?.between_stops_experience_id;

    if (
      !metadataUserId ||
      !experienceId ||
      metadataUserId !== user.id
    ) {
      return NextResponse.json(
        {
          error:
            "This payment does not belong to the signed-in account.",
        },
        { status: 403 }
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
          "Purchased tour could not be found."
        )
      );
    }

    const amountPence =
      session.amount_total ??
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
      typeof session.payment_intent ===
      "string"
        ? session.payment_intent
        : session.payment_intent?.id ??
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
            session.id,
          stripe_payment_intent_id:
            paymentIntentId,
          amount_pence:
            amountPence,
          currency:
            (
              session.currency ??
              experience.currency ??
              "gbp"
            ).toLowerCase(),
          creator_amount_pence:
            creatorAmountPence,
          platform_amount_pence:
            platformAmountPence,
          status: "paid",
          purchased_at:
            new Date().toISOString(),
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
      verified: true,
      experienceId,
    });
  } catch (error) {
    console.error(
      "Stripe Checkout verification error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Purchase could not be verified.",
      },
      { status: 500 }
    );
  }
}
