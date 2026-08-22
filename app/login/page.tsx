"use client";

import { useEffect, useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import "./login.css";

type LoginView = "signin" | "signup" | "forgot";

function safeNextPath(value: string | null) {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/creator";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [view, setView] = useState<LoginView>("signin");
  const [nextPath, setNextPath] = useState("/creator");
  const [passengerMode, setPassengerMode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const parameters = new URLSearchParams(window.location.search);
    const next = safeNextPath(parameters.get("next"));
    setNextPath(next);
    setPassengerMode(parameters.get("mode") === "passenger" || next === "/tours");
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleanEmail = email.trim();
    if (!cleanEmail) return;

    if (view !== "forgot" && password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    setMessage("");
    const supabase = createClient();

    try {
      if (view === "forgot") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
          redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
        });
        if (resetError) throw resetError;
        setMessage("Check your email for a secure password reset link.");
        return;
      }

      if (view === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(nextPath)}`,
          },
        });
        if (signUpError) throw signUpError;
        if (data.session) window.location.assign(nextPath);
        else setMessage("Check your email to confirm your account, then sign in.");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (signInError) throw signInError;
      window.location.assign(nextPath);
    } catch (authError) {
      const rawMessage = authError instanceof Error ? authError.message : "";
      setError(
        rawMessage.toLowerCase().includes("invalid login")
          ? "The email address or password is incorrect."
          : "We could not complete that request. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const areaLabel = passengerMode ? "Passenger account" : "Creator Studio";
  const heading = view === "signup"
    ? "Create your account"
    : view === "forgot"
      ? "Reset your password"
      : "Sign in to continue";

  function showView(nextView: LoginView) {
    setView(nextView);
    setError("");
    setMessage("");
  }

  return (
    <main className="loginShell">
      <section className="loginCard">
        <header className="loginHeader">
          <div className="loginHeaderBrand">
            <img src="/branding/between-stops-icon-v2.png" alt="" />
            <div><div className="loginLogo">Between Stops</div><p className="loginArea">{areaLabel}</p></div>
          </div>
          <a href="/">Passenger view</a>
        </header>

        <div className="loginContent">
          <p className="loginKicker">{passengerMode ? "YOUR BETWEEN STOPS ACCOUNT" : "CREATOR ACCESS"}</p>
          <h1>{heading}</h1>
          <p className="loginIntro">
            {view === "forgot"
              ? "Enter your email address and we’ll send you a secure reset link."
              : passengerMode
                ? "An account is optional. Sign in to keep favourites available across your devices."
                : "Use your email address and password to access Creator Studio."}
          </p>

          <form onSubmit={handleSubmit}>
            <label htmlFor="email">Email address</label>
            <input id="email" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required />

            {view !== "forgot" && (
              <>
                <label htmlFor="password">Password</label>
                <input id="password" type="password" autoComplete={view === "signup" ? "new-password" : "current-password"} value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
              </>
            )}

            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Please wait…" : view === "signup" ? "Create account" : view === "forgot" ? "Send reset link" : "Sign in"}
            </button>
          </form>

          {error && <p className="loginError" role="alert">{error}</p>}
          {message && <div className="loginConfirmation" role="status"><p>{message}</p></div>}

          <div className="loginOptions">
            {view === "signin" ? (
              <><button onClick={() => showView("forgot")}>Forgotten password?</button><button onClick={() => showView("signup")}>Create an account</button></>
            ) : (
              <button onClick={() => showView("signin")}>← Back to sign in</button>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
