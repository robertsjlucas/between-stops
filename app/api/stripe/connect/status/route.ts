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

export async function GET() {
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
          connected: false,
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
        stripe_account_id,
        stripe_onboarding_complete,
        stripe_charges_enabled,
        stripe_payouts_enabled
      `)
      .eq("id", user.id)
      .maybeSingle();

    if (profileError) {
      throw profileError;
    }

    if (!profile?.stripe_account_id) {
      return NextResponse.json({
        connected: false,
        onboardingComplete: false,
        chargesEnabled: false,
        payoutsEnabled: false,
      });
    }

    const stripe = getStripe();

    const account =
      await stripe.accounts.retrieve(
        profile.stripe_account_id
      );

    const onboardingComplete =
      Boolean(account.details_submitted);

    const chargesEnabled =
      Boolean(account.charges_enabled);

    const payoutsEnabled =
      Boolean(account.payouts_enabled);

    const {
      error: updateError,
    } = await supabase
      .from("creator_profiles")
      .update({
        stripe_onboarding_complete:
          onboardingComplete,
        stripe_charges_enabled:
          chargesEnabled,
        stripe_payouts_enabled:
          payoutsEnabled,
      })
      .eq("id", user.id);

    if (updateError) {
      throw updateError;
    }

    return NextResponse.json({
      connected: true,
      onboardingComplete,
      chargesEnabled,
      payoutsEnabled,
      stripeAccountId:
        profile.stripe_account_id,
    });
  } catch (error) {
    console.error(
      "Stripe Connect status error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Stripe payout status could not be checked.",
      },
      { status: 500 }
    );
  }
}
