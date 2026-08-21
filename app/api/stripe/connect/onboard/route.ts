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
            "You must be signed in as a creator.",
        },
        { status: 401 }
      );
    }

    const {
      data: profile,
      error: profileError,
    } = await supabase
      .from("creator_profiles")
      .select(`
        id,
        stripe_account_id
      `)
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile) {
      return NextResponse.json(
        {
          error:
            "Create your creator profile before setting up payouts.",
        },
        { status: 400 }
      );
    }

    const stripe = getStripe();

    let stripeAccountId =
      profile.stripe_account_id;

    if (!stripeAccountId) {
      const account =
        await stripe.accounts.create({
          type: "express",
          country: "GB",
          email:
            user.email ?? undefined,
          capabilities: {
            transfers: {
              requested: true,
            },
          },
          metadata: {
            between_stops_creator_id:
              user.id,
          },
        });

      stripeAccountId =
        account.id;

      const {
        error: updateError,
      } = await supabase
        .from("creator_profiles")
        .update({
          stripe_account_id:
            stripeAccountId,
          stripe_onboarding_complete:
            false,
          stripe_charges_enabled:
            false,
          stripe_payouts_enabled:
            false,
        })
        .eq("id", user.id);

      if (updateError) {
        throw updateError;
      }
    }

    const origin =
      new URL(request.url).origin;

    const accountLink =
      await stripe.accountLinks.create({
        account: stripeAccountId,
        refresh_url:
          `${origin}/creator?stripe=refresh`,
        return_url:
          `${origin}/creator?stripe=return`,
        type: "account_onboarding",
      });

    return NextResponse.json({
      url: accountLink.url,
    });
  } catch (error) {
    console.error(
      "Stripe Connect onboarding error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Stripe onboarding could not be started.",
      },
      { status: 500 }
    );
  }
}
