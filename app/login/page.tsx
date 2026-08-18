"use client";

import {
  useState,
  type FormEvent,
} from "react";

import {
  createClient,
} from "@/lib/supabase/client";

import "./login.css";

export default function LoginPage() {
  const [email, setEmail] =
    useState("");

  const [
    isSubmitting,
    setIsSubmitting,
  ] = useState(false);

  const [isSent, setIsSent] =
    useState(false);

  const [error, setError] =
    useState("");

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const cleanEmail =
      email.trim();

    if (!cleanEmail) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    const supabase =
      createClient();

    const {
      error: signInError,
    } =
      await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo:
            `${window.location.origin}` +
            "/auth/callback?next=/creator",
          shouldCreateUser: true,
        },
      });

    if (signInError) {
      setError(
        "We could not send the sign-in link. Please try again."
      );

      setIsSubmitting(false);
      return;
    }

    setIsSent(true);
    setIsSubmitting(false);
  }

  return (
    <main className="loginShell">
      <section className="loginCard">
        <header className="loginHeader">
          <div>
            <div className="loginLogo">
              Between Stops
            </div>

            <p className="loginArea">
              Creator Studio
            </p>
          </div>

          <a href="/">
            Passenger view →
          </a>
        </header>

        <div className="loginContent">
          <p className="loginKicker">
            CREATOR ACCESS
          </p>

          <h1>
            Sign in to continue
          </h1>

          {!isSent ? (
            <>
              <p className="loginIntro">
                Enter your email address
                and we’ll send you a
                secure sign-in link. No
                password required.
              </p>

              <form
                onSubmit={
                  handleSubmit
                }
              >
                <label
                  htmlFor="email"
                >
                  Email address
                </label>

                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) =>
                    setEmail(
                      event.target.value
                    )
                  }
                  required
                />

                <button
                  type="submit"
                  disabled={
                    isSubmitting
                  }
                >
                  {isSubmitting
                    ? "Sending…"
                    : "Send sign-in link"}
                </button>
              </form>

              {error && (
                <p
                  className="loginError"
                  role="alert"
                >
                  {error}
                </p>
              )}
            </>
          ) : (
            <div
              className="loginConfirmation"
              aria-live="polite"
            >
              <strong>
                Check your email
              </strong>

              <p>
                We’ve sent a sign-in
                link to {email.trim()}.
              </p>

              <button
                type="button"
                onClick={() =>
                  setIsSent(false)
                }
              >
                Use a different email
              </button>
            </div>
          )}
        </div>
      </section>
    </main>
  );
}