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
  routeChoices,
  routesById,
} from "@/data/routes/catalogue";
import {
  createClient,
} from "@/lib/supabase/client";
import type {
  ProjectStatus,
} from "@/lib/creator-projects";
import {
  loadAllDestinationRecommendations,
  recommendationCategories,
  uploadRecommendationPhoto,
  removeRecommendationPhoto,
} from "@/lib/destination-recommendations";
import {
  deletePassengerReview,
  loadAdminPassengerReviews,
  moderatePassengerReview,
} from "@/lib/passenger-reviews";
import type {
  AdminPassengerReview,
  PassengerReviewStatus,
} from "@/lib/passenger-reviews";
import type {
  DestinationRecommendation,
  RecommendationCategory,
  RecommendationPlacement,
} from "@/lib/destination-recommendations";

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
  ready_for_review: "Ready for approval",
  submitted: "Awaiting approval",
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

type AdminSection =
  | "approvals"
  | "passenger_reviews"
  | "destinations";

type PassengerReviewFilter =
  | "all"
  | PassengerReviewStatus;

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
  const [adminSection, setAdminSection] =
    useState<AdminSection>("approvals");
  const [passengerReviews, setPassengerReviews] =
    useState<AdminPassengerReview[]>([]);
  const [passengerReviewFilter, setPassengerReviewFilter] =
    useState<PassengerReviewFilter>("pending");
  const [recommendations, setRecommendations] =
    useState<DestinationRecommendation[]>([]);
  const [editingRecommendationId, setEditingRecommendationId] =
    useState<string | null>(null);
  const [recommendationRouteId, setRecommendationRouteId] =
    useState(routeChoices[0]?.route.id ?? "");
  const [recommendationStopId, setRecommendationStopId] =
    useState(routeChoices[0]?.route.stops?.[0]?.id ?? "");
  const [recommendationTitle, setRecommendationTitle] =
    useState("");
  const [recommendationCategory, setRecommendationCategory] =
    useState<RecommendationCategory>("attraction");
  const [recommendationSummary, setRecommendationSummary] =
    useState("");
  const [recommendationUrl, setRecommendationUrl] =
    useState("");
  const [recommendationPlacement, setRecommendationPlacement] =
    useState<RecommendationPlacement>("editorial");
  const [recommendationOrder, setRecommendationOrder] =
    useState("100");
  const [recommendationActive, setRecommendationActive] =
    useState(true);
  const [pendingRecommendationPhoto, setPendingRecommendationPhoto] =
    useState<File | null>(null);

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

    const recommendationRows =
      await loadAllDestinationRecommendations(
        supabase
      );

    const passengerReviewRows =
      await loadAdminPassengerReviews(supabase);

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
    setRecommendations(recommendationRows);
    setPassengerReviews(passengerReviewRows);
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
          : "The approval queue could not be loaded."
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
          : "The approval decision could not be saved."
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

  async function setPassengerReviewStatus(
    reviewId: string,
    moderationStatus: PassengerReviewStatus
  ) {
    setBusyId(reviewId);
    setError("");

    try {
      await moderatePassengerReview(
        createClient(),
        reviewId,
        moderationStatus
      );
      await loadQueue();
    } catch (moderationError) {
      setError(
        moderationError instanceof Error
          ? moderationError.message
          : "The passenger review could not be updated."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function removePassengerReview(
    review: AdminPassengerReview
  ) {
    if (!window.confirm("Delete this rating and written review permanently?")) {
      return;
    }

    setBusyId(review.id);
    setError("");

    try {
      await deletePassengerReview(createClient(), review.id);
      await loadQueue();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The passenger review could not be deleted."
      );
    } finally {
      setBusyId(null);
    }
  }

  function resetRecommendationForm() {
    setEditingRecommendationId(null);
    setRecommendationTitle("");
    setRecommendationCategory("attraction");
    setRecommendationSummary("");
    setRecommendationUrl("");
    setRecommendationPlacement("editorial");
    setRecommendationOrder("100");
    setRecommendationActive(true);
    setPendingRecommendationPhoto(null);
  }

  function editRecommendation(
    recommendation: DestinationRecommendation
  ) {
    setAdminSection("destinations");
    setEditingRecommendationId(recommendation.id);
    setRecommendationRouteId(recommendation.routeId);
    setRecommendationStopId(recommendation.stopId);
    setRecommendationTitle(recommendation.title);
    setRecommendationCategory(recommendation.category);
    setRecommendationSummary(recommendation.summary);
    setRecommendationUrl(recommendation.url);
    setRecommendationPlacement(recommendation.placementType);
    setRecommendationOrder(String(recommendation.displayOrder));
    setRecommendationActive(recommendation.isActive);
    setPendingRecommendationPhoto(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveRecommendation() {
    const title = recommendationTitle.trim();
    const category = recommendationCategory;
    const summary = recommendationSummary.trim();
    const url = recommendationUrl.trim();
    const displayOrder = Number.parseInt(
      recommendationOrder,
      10
    );

    if (!recommendationRouteId || !recommendationStopId) {
      window.alert("Choose a route and destination stop.");
      return;
    }

    if (!title || !summary || !url) {
      window.alert("Add a name, category, description and link.");
      return;
    }

    try {
      const parsedUrl = new URL(url);
      if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        throw new Error("Unsupported link");
      }
    } catch {
      window.alert("Add a complete web link beginning with https://");
      return;
    }

    if (!Number.isFinite(displayOrder) || displayOrder < 1) {
      window.alert("Display order must be a whole number of 1 or higher.");
      return;
    }

    const recommendationId =
      editingRecommendationId ?? crypto.randomUUID();
    setBusyId(recommendationId);
    setError("");

    try {
      const supabase = createClient();
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        throw new Error("Your administrator session has expired.");
      }

      const existingRecommendation = recommendations.find(
        (item) => item.id === recommendationId
      );
      const uploadedPhoto = pendingRecommendationPhoto
        ? await uploadRecommendationPhoto(
            supabase,
            recommendationId,
            pendingRecommendationPhoto
          )
        : undefined;

      const { error: saveError } = await supabase
        .from("destination_recommendations")
        .upsert({
          id: recommendationId,
          route_id: recommendationRouteId,
          stop_id: recommendationStopId,
          title,
          category,
          summary,
          url,
          placement_type: recommendationPlacement,
          display_order: displayOrder,
          is_active: recommendationActive,
          created_by: userData.user.id,
          image_path:
            uploadedPhoto?.path ??
            existingRecommendation?.imagePath ??
            null,
          image_filename:
            uploadedPhoto?.filename ??
            existingRecommendation?.imageFilename ??
            null,
          image_mime_type:
            uploadedPhoto?.mimeType ??
            existingRecommendation?.imageMimeType ??
            null,
          image_size_bytes:
            uploadedPhoto?.sizeBytes ??
            existingRecommendation?.imageSizeBytes ??
            null,
          updated_at: new Date().toISOString(),
        });

      if (saveError) throw saveError;

      if (
        uploadedPhoto &&
        existingRecommendation?.imagePath &&
        existingRecommendation.imagePath !== uploadedPhoto.path
      ) {
        await removeRecommendationPhoto(
          supabase,
          existingRecommendation.imagePath
        );
      }

      resetRecommendationForm();
      await loadQueue();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "The recommendation could not be saved."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function setRecommendationVisibility(
    recommendation: DestinationRecommendation
  ) {
    setBusyId(recommendation.id);
    setError("");

    try {
      const { error: updateError } = await createClient()
        .from("destination_recommendations")
        .update({
          is_active: !recommendation.isActive,
          updated_at: new Date().toISOString(),
        })
        .eq("id", recommendation.id);

      if (updateError) throw updateError;
      await loadQueue();
    } catch (updateError) {
      setError(
        updateError instanceof Error
          ? updateError.message
          : "The recommendation could not be updated."
      );
    } finally {
      setBusyId(null);
    }
  }

  async function deleteRecommendation(
    recommendation: DestinationRecommendation
  ) {
    if (!window.confirm(`Delete “${recommendation.title}”?`)) {
      return;
    }

    setBusyId(recommendation.id);
    setError("");

    try {
      const { error: deleteError } = await createClient()
        .from("destination_recommendations")
        .delete()
        .eq("id", recommendation.id);

      if (deleteError) throw deleteError;
      if (recommendation.imagePath) {
        await removeRecommendationPhoto(
          createClient(),
          recommendation.imagePath
        );
      }
      if (editingRecommendationId === recommendation.id) {
        resetRecommendationForm();
      }
      await loadQueue();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "The recommendation could not be deleted."
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
  const visiblePassengerReviews = passengerReviews.filter(
    (review) =>
      passengerReviewFilter === "all" ||
      review.moderationStatus === passengerReviewFilter
  );
  const recommendationRoute =
    routesById[recommendationRouteId];
  const recommendationStops =
    recommendationRoute?.stops ?? [];

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
        <h1>
          {adminSection === "approvals"
            ? "Tour approvals"
            : adminSection === "passenger_reviews"
              ? "Passenger reviews"
              : "Things to do here"}
        </h1>
        <span>
          {adminSection === "approvals"
            ? "Approve the content first, then publish it when it is ready for passengers."
            : adminSection === "passenger_reviews"
              ? "Approve written comments before they appear publicly, or remove abusive submissions entirely."
              : "Manage the recommendations passengers see when they finish at a destination."}
        </span>
      </section>

      <div className="adminSectionTabs">
        <button
          className={adminSection === "approvals" ? "active" : ""}
          onClick={() => setAdminSection("approvals")}
        >
          Tour approvals
        </button>
        <button
          className={adminSection === "passenger_reviews" ? "active" : ""}
          onClick={() => setAdminSection("passenger_reviews")}
        >
          Passenger reviews
        </button>
        <button
          className={adminSection === "destinations" ? "active" : ""}
          onClick={() => setAdminSection("destinations")}
        >
          Destination recommendations
        </button>
      </div>

      {error && <div className="adminError">{error}</div>}

      {adminSection === "approvals" && (
        <>

      <div className="adminFilters" aria-label="Approval queue filters">
        {([
          ["submitted", "Awaiting approval"],
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

      {loading ? (
        <div className="adminEmpty">Loading approval queue…</div>
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
                    placeholder="Approval note for the creator"
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
        </>
      )}

      {adminSection === "passenger_reviews" && (
        <>
          <div className="adminFilters" aria-label="Passenger review filters">
            {([
              ["pending", "Awaiting approval"],
              ["approved", "Published"],
              ["hidden", "Hidden"],
              ["all", "All"],
            ] as [PassengerReviewFilter, string][]).map(([value, label]) => (
              <button
                key={value}
                className={passengerReviewFilter === value ? "active" : ""}
                onClick={() => setPassengerReviewFilter(value)}
              >
                {label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="adminEmpty">Loading passenger reviews…</div>
          ) : visiblePassengerReviews.length === 0 ? (
            <div className="adminEmpty">No passenger reviews in this section.</div>
          ) : (
            <section className="passengerReviewGrid">
              {visiblePassengerReviews.map((review) => {
                const busy = busyId === review.id;

                return (
                  <article className="passengerReviewCard" key={review.id}>
                    <div className="passengerReviewTopline">
                      <span aria-label={`${review.rating} out of 5 stars`}>
                        {"★".repeat(review.rating)}
                        <i>{"★".repeat(5 - review.rating)}</i>
                      </span>
                      <b>{review.moderationStatus}</b>
                    </div>

                    <h2>{review.experienceTitle}</h2>
                    <p className={review.reviewText ? "" : "ratingOnly"}>
                      {review.reviewText || "Rating only — no written comment."}
                    </p>
                    <small>
                      Submitted {new Date(review.createdAt).toLocaleDateString(
                        "en-GB",
                        { day: "numeric", month: "short", year: "numeric" }
                      )}
                    </small>

                    <div className="passengerReviewActions">
                      {review.moderationStatus !== "approved" && review.reviewText && (
                        <button
                          disabled={busy}
                          onClick={() =>
                            void setPassengerReviewStatus(review.id, "approved")
                          }
                        >
                          Approve comment
                        </button>
                      )}
                      {review.moderationStatus !== "hidden" && review.reviewText && (
                        <button
                          className="secondary"
                          disabled={busy}
                          onClick={() =>
                            void setPassengerReviewStatus(review.id, "hidden")
                          }
                        >
                          Hide comment
                        </button>
                      )}
                      <button
                        className="danger"
                        disabled={busy}
                        onClick={() => void removePassengerReview(review)}
                      >
                        Delete rating
                      </button>
                    </div>
                  </article>
                );
              })}
            </section>
          )}
        </>
      )}

      {adminSection === "destinations" && (
        <section className="destinationAdminLayout">
          <div className="destinationFormCard">
            <p className="destinationAdminKicker">
              {editingRecommendationId ? "EDIT RECOMMENDATION" : "NEW RECOMMENDATION"}
            </p>
            <h2>
              {editingRecommendationId
                ? "Update this listing"
                : "Add something nearby"}
            </h2>

            <label htmlFor="recommendation-route">Route</label>
            <select
              id="recommendation-route"
              value={recommendationRouteId}
              onChange={(event) => {
                const routeId = event.target.value;
                const selectedRoute = routesById[routeId];
                setRecommendationRouteId(routeId);
                setRecommendationStopId(
                  selectedRoute?.stops?.[0]?.id ?? ""
                );
              }}
            >
              {routeChoices.map((choice) => (
                <option
                  key={choice.route.id}
                  value={choice.route.id}
                >
                  {choice.label} · {choice.description}
                </option>
              ))}
            </select>

            <label htmlFor="recommendation-stop">Destination stop</label>
            <select
              id="recommendation-stop"
              value={recommendationStopId}
              onChange={(event) =>
                setRecommendationStopId(event.target.value)
              }
            >
              {recommendationStops.map((stop) => (
                <option key={stop.id} value={stop.id}>
                  {stop.name}
                </option>
              ))}
            </select>

            <label htmlFor="recommendation-title">Name</label>
            <input
              id="recommendation-title"
              value={recommendationTitle}
              onChange={(event) => setRecommendationTitle(event.target.value)}
              placeholder="e.g. Museum of Edinburgh"
              maxLength={120}
            />

            <label htmlFor="recommendation-category">Category</label>
            <select
              id="recommendation-category"
              value={recommendationCategory}
              onChange={(event) =>
                setRecommendationCategory(
                  event.target.value as RecommendationCategory
                )
              }
            >
              {recommendationCategories.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>

            <label htmlFor="recommendation-summary">Short description</label>
            <textarea
              id="recommendation-summary"
              value={recommendationSummary}
              onChange={(event) => setRecommendationSummary(event.target.value)}
              placeholder="Why might somebody want to go?"
              rows={4}
              maxLength={300}
            />

            <label htmlFor="recommendation-url">Web link</label>
            <input
              id="recommendation-url"
              type="url"
              value={recommendationUrl}
              onChange={(event) => setRecommendationUrl(event.target.value)}
              placeholder="https://…"
            />

            <label htmlFor="recommendation-photo">
              Photograph <span>Optional</span>
            </label>
            {editingRecommendationId &&
              recommendations.find(
                (item) => item.id === editingRecommendationId
              )?.imageUrl && (
              <img
                className="destinationPhotoPreview"
                src={
                  recommendations.find(
                    (item) => item.id === editingRecommendationId
                  )?.imageUrl
                }
                alt="Current recommendation"
              />
            )}
            <input
              id="recommendation-photo"
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(event) =>
                setPendingRecommendationPhoto(
                  event.target.files?.[0] ?? null
                )
              }
            />
            <small className="destinationPhotoHelp">
              JPG, PNG or WebP, up to 5 MB. Without a photo,
              Between Stops uses branded category artwork.
            </small>

            <div className="destinationFormRow">
              <div>
                <label htmlFor="recommendation-placement">Placement</label>
                <select
                  id="recommendation-placement"
                  value={recommendationPlacement}
                  onChange={(event) =>
                    setRecommendationPlacement(
                      event.target.value as RecommendationPlacement
                    )
                  }
                >
                  <option value="editorial">Editorial</option>
                  <option value="sponsored">Sponsored</option>
                </select>
              </div>
              <div>
                <label htmlFor="recommendation-order">Display order</label>
                <input
                  id="recommendation-order"
                  type="number"
                  min="1"
                  value={recommendationOrder}
                  onChange={(event) => setRecommendationOrder(event.target.value)}
                />
              </div>
            </div>

            <label className="destinationActiveToggle">
              <input
                type="checkbox"
                checked={recommendationActive}
                onChange={(event) => setRecommendationActive(event.target.checked)}
              />
              <span>Visible to passengers</span>
            </label>

            <div className="destinationFormActions">
              {editingRecommendationId && (
                <button
                  className="secondary"
                  onClick={resetRecommendationForm}
                >
                  Cancel
                </button>
              )}
              <button
                disabled={Boolean(busyId)}
                onClick={saveRecommendation}
              >
                {editingRecommendationId ? "Save changes" : "Add recommendation"}
              </button>
            </div>
          </div>

          <div className="destinationRecommendationList">
            <div className="destinationListHeading">
              <h2>Current recommendations</h2>
              <span>{recommendations.length}</span>
            </div>

            {loading ? (
              <div className="adminEmpty">Loading recommendations…</div>
            ) : recommendations.length === 0 ? (
              <div className="adminEmpty">No destination recommendations yet.</div>
            ) : (
              recommendations.map((recommendation) => {
                const itemRoute = routesById[recommendation.routeId];
                const itemStop = itemRoute?.stops?.find(
                  (stop) => stop.id === recommendation.stopId
                );
                const busy = busyId === recommendation.id;

                return (
                  <article
                    className={
                      recommendation.isActive
                        ? "destinationAdminCard"
                        : "destinationAdminCard inactive"
                    }
                    key={recommendation.id}
                  >
                    <div className="destinationAdminMeta">
                      <span>
                        {recommendationCategories.find(
                          ([value]) => value === recommendation.category
                        )?.[1] ?? "Attraction"}
                      </span>
                      {recommendation.placementType === "sponsored" && (
                        <b>Sponsored</b>
                      )}
                      {!recommendation.isActive && <b>Hidden</b>}
                    </div>
                    <h3>{recommendation.title}</h3>
                    <p>{recommendation.summary}</p>
                    <small>
                      {itemRoute?.number ?? itemRoute?.name ?? recommendation.routeId}
                      {" · "}
                      {itemStop?.name ?? recommendation.stopId}
                      {" · order "}
                      {recommendation.displayOrder}
                    </small>
                    <a href={recommendation.url} target="_blank" rel="noreferrer">
                      Open link ↗
                    </a>
                    <div className="destinationCardActions">
                      <button disabled={busy} onClick={() => editRecommendation(recommendation)}>
                        Edit
                      </button>
                      <button disabled={busy} onClick={() => setRecommendationVisibility(recommendation)}>
                        {recommendation.isActive ? "Hide" : "Show"}
                      </button>
                      <button className="danger" disabled={busy} onClick={() => deleteRecommendation(recommendation)}>
                        Delete
                      </button>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </section>
      )}
    </main>
  );
}
