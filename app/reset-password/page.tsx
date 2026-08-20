"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import "../login/login.css";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function updatePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      setError("Use at least 8 characters for your password.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }

    setIsSubmitting(true);
    setError("");
    const { error: updateError } = await createClient().auth.updateUser({ password });
    if (updateError) {
      setError("The reset link may have expired. Request a new one and try again.");
      setIsSubmitting(false);
      return;
    }
    window.location.assign("/creator");
  }

  return (
    <main className="loginShell">
      <section className="loginCard">
        <header className="loginHeader">
          <div className="loginHeaderBrand">
            <img src="/branding/between-stops-icon.png" alt="" />
            <div><div className="loginLogo">Between Stops</div><p className="loginArea">Secure account</p></div>
          </div>
          <a href="/">Passenger view →</a>
        </header>
        <div className="loginContent">
          <p className="loginKicker">PASSWORD RECOVERY</p>
          <h1>Choose a new password</h1>
          <p className="loginIntro">Use at least 8 characters and avoid a password you use elsewhere.</p>
          <form onSubmit={updatePassword}>
            <label htmlFor="password">New password</label>
            <input id="password" type="password" autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8} required />
            <label htmlFor="confirmPassword">Confirm new password</label>
            <input id="confirmPassword" type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} minLength={8} required />
            <button type="submit" disabled={isSubmitting}>{isSubmitting ? "Saving…" : "Save new password"}</button>
          </form>
          {error && <p className="loginError" role="alert">{error}</p>}
        </div>
      </section>
    </main>
  );
}
