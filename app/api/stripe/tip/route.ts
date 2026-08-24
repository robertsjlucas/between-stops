import { NextResponse } from "next/server";
import Stripe from "stripe";

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

export async function POST(
  request: Request
) {
  try {
    const supabase =
      await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    const body =
      await request.json();

    const experienceId =
      typeof body.experienceId === "string"
        ? body.experienceId
        : "";

    const amountPence =
      Number(body.amountPence);

    if (
      !experienceId ||
      !Number.isInteger(amountPence) ||
      amountPence < 100 ||
      amountPence > 50000
    ) {
      return NextResponse.json(
        {
          error:
            "Choose a tip between £1 and £500.",
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
            "This tour is not available.",
        },
        { status: 404 }
      );
    }

    const {
      data: creator,
      error: creatorError,
    } = await supabase
      .from("creator_profiles")
      .select(`
        display_name,
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
            "This guide cannot receive tips yet.",
        },
        { status: 409 }
      );
    }

    const stripe =
      getStripe();

    const origin =
      new URL(request.url).origin;

    const session =
      await stripe.checkout.sessions.create({
        mode: "payment",

        customer_email:
          user?.email ?? undefined,

        line_items: [
          {
            quantity: 1,
            price_data: {
              currency: "gbp",
              unit_amount: amountPence,
              product_data: {
                name:
                  `Tip for ${creator.display_name || "your guide"}`,
                description:
                  `Thank you for supporting the creator of ${experience.title}.`,
              },
            },
          },
        ],

        /*
          No application_fee_amount.

          The full gross tip is transferred to the creator.
          Beyond the Stops absorbs Stripe processing costs.
        */
        payment_intent_data: {
          transfer_data: {
            destination:
              creator.stripe_account_id,
          },

          metadata: {
            between_stops_payment_type:
              "tip",
            ...(user
              ? {
                  between_stops_user_id:
                    user.id,
                }
              : {}),
            between_stops_experience_id:
              experience.id,
            between_stops_creator_id:
              experience.owner_id,
            tip_amount_pence:
              String(amountPence),
          },
        },

        metadata: {
          between_stops_payment_type:
            "tip",
          ...(user
            ? {
                between_stops_user_id:
                  user.id,
              }
            : {}),
          between_stops_experience_id:
            experience.id,
          between_stops_creator_id:
            experience.owner_id,
          tip_amount_pence:
            String(amountPence),
        },

        success_url:
          `${origin}/tours/${experience.slug}?tip=success`,

        cancel_url:
          `${origin}/tours/${experience.slug}?tip=cancelled`,
      });

    if (!session.url) {
      throw new Error(
        "Stripe did not return a tip checkout URL."
      );
    }

    return NextResponse.json({
      url: session.url,
    });
  } catch (error) {
    console.error(
      "Stripe tip checkout error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Tip checkout could not be started.",
      },
      { status: 500 }
    );
  }
}
