"use client";

import { useEffect } from "react";
import { createClient } from "@/lib/supabase/client";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    void createClient().rpc("submit_platform_report", {
      p_report_type: "error",
      p_message: `Unexpected application error: ${error.message || "No message supplied"}`,
      p_page_url: window.location.href,
      p_reporter_email: null,
      p_context: {
        digest: error.digest ?? null,
        userAgent: navigator.userAgent,
      },
    });
  }, [error]);

  return (
    <main className="systemErrorPage">
      <img src="/branding/between-stops-icon.png?v=2" alt="" />
      <p>BETWEEN STOPS</p>
      <h1>Something went wrong</h1>
      <span>The problem has been reported. You can try this page again now.</span>
      <button onClick={reset}>Try again</button>
    </main>
  );
}
