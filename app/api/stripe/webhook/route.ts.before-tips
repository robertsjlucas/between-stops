import { NextResponse } from "next/server";
import Stripe from "stripe";

import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getStripe() {
  const secretKey =
    process.env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    throw new Error(
      "STRIPE_SECRET_KEY is not configured."
    );
  }

  return new Stripe(secretKey);
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

  return createClient(
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
    const webhookSecret =
      process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET is not configured."
      );
    }

    const signature =
      request.headers.get(
        "stripe-signature"
      );

    if (!signature) {
      return NextResponse.json(
        {
          error:
            "Stripe signature is missing.",
        },
        { status: 400 }
      );
    }

    const rawBody =
      await request.text();

    const stripe =
      getStripe();

    let event: Stripe.Event;

    try {
      event =
        stripe.webhooks.constructEvent(
          rawBody,
          signature,
          webhookSecret
        );
    } catch (error) {
      console.error(
        "Stripe webhook signature verification failed:",
        error
      );

      return NextResponse.json(
        {
          error:
            "Invalid Stripe signature.",
        },
        { status: 400 }
      );
    }

    if (
      event.type !==
      "checkout.session.completed"
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    const session =
      event.data
        .object as Stripe.Checkout.Session;

    if (
      session.payment_status !== "paid"
    ) {
      return NextResponse.json({
        received: true,
      });
    }

    const userId =
      session.metadata
        ?.between_stops_user_id;

    const experienceId =
      session.metadata
        ?.between_stops_experience_id;

    if (!userId || !experienceId) {
      throw new Error(
        "Stripe Checkout metadata is incomplete."
      );
    }

    const supabase =
      getSupabaseAdmin();

    const {
      data: experience,
      error: experienceError,
    } = await supabase
      .from("experiences")
      .select(
        "id, owner_id, price_pence, currency"
      )
      .eq("id", experienceId)
      .maybeSingle();

    if (experienceError) {
      throw experienceError;
    }

    if (!experience) {
      throw new Error(
        "Purchased experience could not be found."
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
        "Stripe payment amount is invalid."
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
    } = await supabase
      .from("passenger_purchases")
      .upsert(
        {
          user_id: userId,
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
      received: true,
    });
  } catch (error) {
    console.error(
      "Stripe webhook error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Webhook processing failed.",
      },
      { status: 500 }
    );
  }
}
