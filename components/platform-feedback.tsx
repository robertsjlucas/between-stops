"use client";

import { useState, type FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

export function PlatformFeedback() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"issue" | "idea">("issue");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState("");
  const [sending, setSending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSending(true);
    setStatus("");
    const { error } = await createClient().rpc("submit_platform_report", {
      p_report_type: type,
      p_message: message,
      p_page_url: window.location.href,
      p_reporter_email: email || null,
      p_context: { userAgent: navigator.userAgent },
    });
    setSending(false);
    if (error) {
      setStatus("We could not send this yet. Please try again.");
      return;
    }
    setMessage("");
    setStatus("Thank you. Your report has been sent.");
  }

  return (
    <div className="platformFeedback">
      <button className="platformFeedbackTrigger" onClick={() => setOpen((current) => !current)}>
        {open ? "Close" : "Report an issue or idea"}
      </button>
      {open && (
        <div className="platformFeedbackPanel">
          <strong>Help improve Between Stops</strong>
          <form onSubmit={submit}>
            <label htmlFor="platform-report-type">This is an</label>
            <select id="platform-report-type" value={type} onChange={(event) => setType(event.target.value as "issue" | "idea")}>
              <option value="issue">Issue</option>
              <option value="idea">Idea</option>
            </select>
            <label htmlFor="platform-report-message">What happened, or what would help?</label>
            <textarea id="platform-report-message" value={message} onChange={(event) => setMessage(event.target.value)} minLength={10} maxLength={2000} rows={5} required />
            <label htmlFor="platform-report-email">Email for a reply <span>Optional</span></label>
            <input id="platform-report-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            <button type="submit" disabled={sending}>{sending ? "Sending…" : "Send report"}</button>
          </form>
          {status && <p role="status">{status}</p>}
        </div>
      )}
    </div>
  );
}
