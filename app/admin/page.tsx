"use client";

import {
  useEffect,
  useState,
} from "react";

import "./admin.css";

import {
  TransportIcon,
} from "@/components/transport-icon";
import {
  routesById,
} from "@/data/routes/catalogue";
import {
  createClient,
} from "@/lib/supabase/client";
import type {
  ProjectStatus,
} from "@/lib/creator-projects";

type ReviewStory = {
  id: string;
  title: string;
  audio_path: string | null;
  image_path: string | null;
};

type ReviewExperience = {
  id: string;
  owner_id: string;
  title: string;
  summary: string;
  route_id: string;
  status: ProjectStatus;
  visibility: string;
  cover_image_path: string | null;
  duration_minutes: number | null;
  rights_confirmed_at: string | null;
  featured_rank: number | null;
  updated_at: string;
  published_at: string | null;
  stories: ReviewStory[];
};

type ReviewProfile = {
  id: string;
  display_name: string;
  bio: string;
  avatar_path: string | null;
};

const statusLabels: Record<
  ProjectStatus,
  string
> = {
  draft: "Draft",
  ready_for_review: "Ready for review",
  submitted: "Awaiting review",
  changes_requested: "Changes requested",
  approved: "Approved",
  published: "Published",
  archived: "Archived",
};

type ReviewFilter =
  | "all"
  | "submitted"
  | "approved"
  | "published"
  | "changes_requested";

export default function AdminPage() {
  const [experiences, setExperiences] =
    useState<ReviewExperience[]>([]);
  const [profiles, setProfiles] =
    useState<Record<string, ReviewProfile>>({});
  const [coverUrls, setCoverUrls] =
    useState<Record<string, string>>({});
  const [filter, setFilter] =
    useState<ReviewFilter>("submitted");
  const [notes, setNotes] =
    useState<Record<string, string>>({});
  const [ranks, setRanks] =
    useState<Record<string, string>>({});
  const [loading, setLoading] =
    useState(true);
  const [busyId, setBusyId] =
    useState<string | null>(null);
  const [error, setError] =
    useState("");
  const [accessDenied, setAccessDenied] =
    useState(false);

  async function loadQueue() {
    const supabase = createClient();
    setLoading(true);
    setError("");

    const { data: userData } =
      await supabase.auth.getUser();

    if (!userData.user) {
      window.location.href = "/login";
      return;
    }

    const {
      data: membership,
      error: membershipError,
    } = await supabase
      .from("platform_admins")
      .select("user_id")
      .maybeSingle();

    if (membershipError || !membership) {
      setAccessDenied(true);
      setLoading(false);
      return;
    }

    const {
      data: experienceData,
      error: experienceError,
    } = await supabase
      .from("experiences")
      .select(`
        id,
        owner_id,
        title,
        summary,
        route_id,
        status,
        visibility,
        cover_image_path,
        duration_minutes,
        rights_confirmed_at,
        featured_rank,
        updated_at,
        published_at,
        stories (
          id,
          title,
          audio_path,
          image_path
        )
      `)
      .order("updated_at", {
        ascending: false,
      });

    if (experienceError) {
      throw experienceError;
    }

    const rows =
      (experienceData ?? []) as ReviewExperience[];
    const ownerIds = Array.from(
      new Set(rows.map((row) => row.owner_id))
    );
    let profileRows: ReviewProfile[] = [];

    if (ownerIds.length > 0) {
      const {
        data: profileData,
        error: profileError,
      } = await supabase
        .from("creator_profiles")
        .select("id, display_name, bio, avatar_path")
        .in("id", ownerIds);

      if (profileError) {
        throw profileError;
      }

      profileRows =
        (profileData ?? []) as ReviewProfile[];
    }

    const paths = rows
      .map((row) => row.cover_image_path)
      .filter((path): path is string => Boolean(path));
    const nextCoverUrls: Record<string, string> = {};

    if (paths.length > 0) {
      const {
        data: signedData,
        error: signedError,
      } = await supabase.storage
        .from("tour-media")
        .createSignedUrls(paths, 60 * 60);

      if (signedError) {
        throw signedError;
      }

      (signedData ?? []).forEach((item, index) => {
        if (item.signedUrl) {
          nextCoverUrls[paths[index]] = item.signedUrl;
        }
      });
    }

    setExperiences(rows);
    setProfiles(
      Object.fromEntries(
        profileRows.map((profile) => [profile.id, profile])
      )
    );
    setCoverUrls(nextCoverUrls);
    setRanks(
      Object.fromEntries(
        rows.map((row) => [
          row.id,
          row.featured_rank
            ? String(row.featured_rank)
            : "",
        ])
      )
    );
    setAccessDenied(false);
    setLoading(false);
  }

  useEffect(() => {
    void loadQueue().catch((loadError) => {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "The review queue could not be loaded."
      );
      setLoading(false);
    });
  }, []);

  async function reviewExperience(
    experienceId: string,
    status: "approved" | "changes_requested" | "published"
  ) {
    const note = notes[experienceId]?.trim() ?? "";

    if (status === "changes_requested" && !note) {
      window.alert("Add a clear note for the creator first.");
      return;
    }

    setBusyId(experienceId);
    setError("");

    try {
      const supabase = createClient();
      const { error: reviewError } = await supabase.rpc(
        "admin_review_experience",
        {
          p_experience_id: experienceId,
          p_status: status,
          p_note: note || null,
        }
      );

      if (reviewError) {
        throw reviewError;
      }

      setNotes((current) => ({
        ...current,
        [experienceId]: "",
      }));
      await loadQueue();
    } catch (reviewError) {
      setError(
        reviewError instanceof Error
          ? reviewError.message
          : "The review decision could not be saved."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function saveFeaturedRank(experienceId: string) {
    const value = ranks[experienceId]?.trim() ?? "";
    const parsed = value ? Number.parseInt(value, 10) : null;

    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 1)) {
      window.alert("Use a whole number of 1 or higher, or leave it blank.");
      return;
    }

    setBusyId(experienceId);
    setError("");

    try {
      const supabase = createClient();
      const { error: rankError } = await supabase.rpc(
        "admin_set_featured_rank",
        {
          p_experience_id: experienceId,
          p_featured_rank: parsed,
        }
      );

      if (rankError) {
        throw rankError;
      }

      await loadQueue();
    } catch (rankError) {
      setError(
        rankError instanceof Error
          ? rankError.message
          : "The featured position could not be saved."
      );
    } finally {
      setBusyId(null);
    }
  }

  if (accessDenied) {
    return (
      <main className="adminShell adminMessage">
        <img src="/branding/between-stops-icon.png" alt="" />
        <h1>Administrator access only</h1>
        <p>This account is not an administrator.</p>
        <a href="/creator">Return to Creator Studio</a>
      </main>
    );
  }

  const visibleExperiences = experiences.filter(
    (experience) =>
      filter === "all" || experience.status === filter
  );

  return (
    <main className="adminShell">
      <header className="adminHeader">
        <a className="adminBrand" href="/">
          <img src="/branding/between-stops-icon.png" alt="" />
          <span>Between Stops</span>
        </a>

        <nav>
          <a href="/creator">Creator Studio</a>
          <a href="/">Passenger view</a>
        </nav>
      </header>

      <section className="adminIntro">
        <p>ADMIN</p>
        <h1>Experience review</h1>
        <span>Approve the content first, then publish it when it is ready for passengers.</span>
      </section>

      <div className="adminFilters" aria-label="Review queue filters">
        {([
          ["submitted", "Awaiting review"],
          ["approved", "Approved"],
          ["published", "Published"],
          ["changes_requested", "Changes requested"],
          ["all", "All"],
        ] as [ReviewFilter, string][]).map(([value, label]) => (
          <button
            key={value}
            className={filter === value ? "active" : ""}
            onClick={() => setFilter(value)}
          >
            {label}
          </button>
        ))}
      </div>

      {error && <div className="adminError">{error}</div>}

      {loading ? (
        <div className="adminEmpty">Loading review queue…</div>
      ) : visibleExperiences.length === 0 ? (
        <div className="adminEmpty">Nothing in this part of the queue.</div>
      ) : (
        <section className="reviewGrid">
          {visibleExperiences.map((experience) => {
            const route = routesById[experience.route_id];
            const profile = profiles[experience.owner_id];
            const busy = busyId === experience.id;

            return (
              <article className="reviewCard" key={experience.id}>
                <div className="reviewCover">
                  {experience.cover_image_path && coverUrls[experience.cover_image_path] ? (
                    <img
                      src={coverUrls[experience.cover_image_path]}
                      alt=""
                    />
                  ) : (
                    <span>No cover image</span>
                  )}
                  <b>{statusLabels[experience.status]}</b>
                </div>

                <div className="reviewBody">
                  <p className="reviewCreator">
                    Created by {profile?.display_name || "Unnamed creator"}
                  </p>
                  <h2>{experience.title}</h2>
                  <p className="reviewSummary">{experience.summary || "No summary supplied."}</p>

                  <div className="reviewFacts">
                    <span>
                      {route && <TransportIcon mode={route.mode} />}
                      {route?.number ?? route?.name ?? experience.route_id}
                    </span>
                    <span>About {experience.duration_minutes ?? "—"} mins</span>
                    <span>{experience.stories?.length ?? 0} Stories</span>
                    <span>{experience.rights_confirmed_at ? "Rights confirmed" : "Rights not confirmed"}</span>
                  </div>

                  <textarea
                    value={notes[experience.id] ?? ""}
                    onChange={(event) =>
                      setNotes((current) => ({
                        ...current,
                        [experience.id]: event.target.value,
                      }))
                    }
                    placeholder="Review note for the creator"
                    rows={3}
                  />

                  <div className="reviewActions">
                    <a
                      className="reviewPreviewLink"
                      href={`/preview?id=${experience.id}&from=admin`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Preview tour and audio
                    </a>
                    {experience.status === "submitted" && (
                      <button disabled={busy} onClick={() => reviewExperience(experience.id, "approved")}>Approve</button>
                    )}
                    {(experience.status === "submitted" || experience.status === "approved") && (
                      <button className="secondary" disabled={busy} onClick={() => reviewExperience(experience.id, "changes_requested")}>Request changes</button>
                    )}
                    {experience.status === "approved" && (
                      <button disabled={busy} onClick={() => reviewExperience(experience.id, "published")}>Publish</button>
                    )}
                    {experience.status === "published" && (
                      <button className="secondary" disabled={busy} onClick={() => reviewExperience(experience.id, "approved")}>Unpublish</button>
                    )}
                  </div>

                  {experience.status === "published" && (
                    <div className="featuredControl">
                      <label htmlFor={`rank-${experience.id}`}>Featured position</label>
                      <input
                        id={`rank-${experience.id}`}
                        type="number"
                        min="1"
                        value={ranks[experience.id] ?? ""}
                        onChange={(event) =>
                          setRanks((current) => ({
                            ...current,
                            [experience.id]: event.target.value,
                          }))
                        }
                        placeholder="Not featured"
                      />
                      <button disabled={busy} onClick={() => saveFeaturedRank(experience.id)}>Save</button>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </section>
      )}
    </main>
  );
}
