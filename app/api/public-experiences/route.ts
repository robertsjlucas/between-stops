import { NextResponse } from "next/server";

import { loadPublishedExperiences } from "@/lib/public-experiences";
import { createPublicServerClient } from "@/lib/supabase/public-server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const experiences = await loadPublishedExperiences(
      createPublicServerClient()
    );

    return NextResponse.json(experiences, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Published experiences could not be loaded.";

    return NextResponse.json(
      { error: message },
      {
        status: 500,
        headers: {
          "Cache-Control": "no-store",
        },
      }
    );
  }
}
