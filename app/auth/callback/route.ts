import {
  NextResponse,
} from "next/server";

import {
  createClient,
} from "@/lib/supabase/server";

export async function GET(
  request: Request
) {
  const requestUrl =
    new URL(request.url);

  const code =
    requestUrl.searchParams.get(
      "code"
    );

  let next =
    requestUrl.searchParams.get(
      "next"
    ) ?? "/creator";

  if (!next.startsWith("/")) {
    next = "/creator";
  }

  if (code) {
    const supabase =
      await createClient();

    const { error } =
      await supabase.auth
        .exchangeCodeForSession(
          code
        );

    if (!error) {
      return NextResponse.redirect(
        new URL(
          next,
          requestUrl.origin
        )
      );
    }
  }

  const loginUrl =
    new URL(
      "/login",
      requestUrl.origin
    );

  loginUrl.searchParams.set(
    "error",
    "signin"
  );

  return NextResponse.redirect(
    loginUrl
  );
}