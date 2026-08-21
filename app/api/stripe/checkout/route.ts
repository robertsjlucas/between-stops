import { NextResponse } from "next/server";
import Stripe from "stripe";

import {
  createClient,
} from "@/lib/supabase/server";

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
            "Sign in before buying a tour.",
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
            "No tour was selected.",
        },
        { status: 400 }
      );
    }

    const {
      data: experience,
      error: experienceError,
    } = await supabase
      .from("experiences")
      .select(`
        id,
        owner_id,
        title,
        slug,
        access_type,
        price_pence,
        currency,
        status,
        visibility
      `)
      .eq("id", experienceId)
      .eq("status", "published")
      .eq("visibility", "public")
      .maybeSingle();

    if (experienceError) {
      throw experienceError;
    }

    if (!experience) {
      return NextResponse.json(
        {
          error:
            "This tour is not currently available.",
        },
        { status: 404 }
      );
    }

    if (
      experience.access_type !== "paid" ||
      !experience.price_pence ||
      experience.price_pence < 299
    ) {
      return NextResponse.json(
        {
          error:
            "This tour does not require a paid checkout.",
        },
        { status: 400 }
      );
    }

    const {
      data: existingPurchase,
      error: purchaseError,
    } = await supabase
      .from("passenger_purchases")
      .select("id, status")
      .eq("user_id", user.id)
      .eq("experience_id", experience.id)
      .maybeSingle();

    if (purchaseError) {
      throw purchaseError;
    }

    if (
      existingPurchase?.status === "paid"
    ) {
      return NextResponse.json(
        {
          alreadyPurchased: true,
        }
      );
    }

    const {
      data: creator,
      error: creatorError,
    } = await supabase
      .from("creator_profiles")
      .select(`
        stripe_account_id,
        stripe_onboarding_complete,
        stripe_payouts_enabled
      `)
      .eq("id", experience.owner_id)
      .maybeSingle();

    if (creatorError) {
      throw creatorError;
    }

    if (
      !creator?.stripe_account_id ||
      !creator.stripe_onboarding_complete ||
      !creator.stripe_payouts_enabled
    ) {
      return NextResponse.json(
        {
          error:
            "This creator is not yet ready to receive payments.",
        },
        { status: 409 }
      );
    }

    const creatorAmount =
      Math.floor(
        experience.price_pence * 0.75
      );

    const platformAmount =
      experience.price_pence -
      creatorAmount;

    const origin =
      new URL(request.url).origin;

    const stripe =
      getStripe();

    const session =
      await stripe.checkout.sessions.create({
        mode: "payment",

        customer_email:
          user.email ?? undefined,

        line_items: [
          {
            quantity: 1,
            price_data: {
              currency:
                (
                  experience.currency ??
                  "GBP"
                ).toLowerCase(),
              unit_amount:
                experience.price_pence,
              product_data: {
                name:
                  experience.title,
                description:
                  "Between Stops audio tour",
              },
            },
          },
        ],

        payment_intent_data: {
          application_fee_amount:
            platformAmount,

          transfer_data: {
            destination:
              creator.stripe_account_id,
          },

          metadata: {
            between_stops_user_id:
              user.id,
            between_stops_experience_id:
              experience.id,
            between_stops_creator_id:
              experience.owner_id,
            creator_amount_pence:
              String(creatorAmount),
            platform_amount_pence:
              String(platformAmount),
          },
        },

        metadata: {
          between_stops_user_id:
            user.id,
          between_stops_experience_id:
            experience.id,
        },

        success_url:
          `${origin}/tours/${experience.slug}?checkout=success&session_id={CHECKOUT_SESSION_ID}`,

        cancel_url:
          `${origin}/tours/${experience.slug}?checkout=cancelled`,
      });

    if (!session.url) {
      throw new Error(
        "Stripe did not return a checkout URL."
      );
    }

    return NextResponse.json({
      url: session.url,
    });
  } catch (error) {
    console.error(
      "Stripe Checkout error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Checkout could not be started.",
      },
      { status: 500 }
    );
  }
}
