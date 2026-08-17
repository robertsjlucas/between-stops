"use client";

import { useEffect, useMemo, useState } from "react";
import { lineString, point } from "@turf/helpers";
import nearestPointOnLine from "@turf/nearest-point-on-line";
import length from "@turf/length";
import { tramRouteCoordinates } from "@/data/tram-airport-west-end-geometry";

type Screen = "home" | "overview" | "journey";

type LocationData = {
  latitude: number;
  longitude: number;
  accuracy: number;
};

type Cue = {
  id: string;
  progress: number;
  eyebrow: string;
  title: string;
  text: string;
  type: "audio" | "image" | "look" | "question";
  lookDirection?: "left" | "right";
};

type MarkedSpot = {
  id: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  routeProgress: number;
  distanceAlongKm: number;
  distanceFromRouteMetres: number;
};

const cues: Cue[] = [
  {
    id: "departure",
    progress: 0,
    eyebrow: "Welcome",
    title: "Your journey starts here",
    text: "A short introduction to Between Stops and the journey into Edinburgh.",
    type: "audio",
  },
  {
    id: "west-of-ingliston",
    progress: 14,
    eyebrow: "Between stops",
    title: "Leaving the airport behind",
    text: "The city is still some distance away, but the landscape is already beginning to change.",
    type: "image",
  },
  {
    id: "gateway-look",
    progress: 27,
    eyebrow: "Look right",
    title: "Watch the city begin to appear",
    text: "Keep an eye through the right-hand window as we approach Edinburgh Gateway.",
    type: "look",
    lookDirection: "right",
  },
  {
    id: "edinburgh-park",
    progress: 43,
    eyebrow: "Listen",
    title: "A different Edinburgh",
    text: "Not every story of the city begins in the Old Town. This part of Edinburgh tells a very different one.",
    type: "audio",
  },
  {
    id: "bankhead-saughton",
    progress: 58,
    eyebrow: "Between stops",
    title: "The journey changes character",
    text: "A test image and short story would live here, triggered while the tram is moving.",
    type: "image",
  },
  {
    id: "balgreen",
    progress: 75,
    eyebrow: "A quick question",
    title: "What do you notice first?",
    text: "This is where a simple interactive reveal or question could interrupt the narration.",
    type: "question",
  },
  {
    id: "murrayfield-haymarket",
    progress: 87,
    eyebrow: "Look left",
    title: "The centre is getting close",
    text: "Look left. This kind of cue should arrive early enough to give you time to actually see the thing being described.",
    type: "look",
    lookDirection: "left",
  },
  {
    id: "arrival",
    progress: 97,
    eyebrow: "Coming into West End",
    title: "Almost there",
    text: "A final audio moment as the journey reaches central Edinburgh.",
    type: "audio",
  },
];

export default function Home() {
  const [screen, setScreen] = useState<Screen>("home");
  const [location, setLocation] = useState<LocationData | null>(null);
  const [error, setError] = useState("");
  const [watching, setWatching] = useState(false);

  // This is the passenger's trusted journey position.
  // It only advances when they are plausibly on the route.
  const [journeyProgress, setJourneyProgress] = useState(0);

  const [testerOpen, setTesterOpen] = useState(false);
  const [markedSpots, setMarkedSpots] = useState<MarkedSpot[]>([]);

  const routeLine = useMemo(
    () => lineString(tramRouteCoordinates),
    []
  );

  const routeLengthKm = useMemo(
    () => length(routeLine, { units: "kilometers" }),
    [routeLine]
  );

  useEffect(() => {
    const saved = localStorage.getItem("between-stops-marked-spots");

    if (saved) {
      try {
        setMarkedSpots(JSON.parse(saved));
      } catch {
        // Ignore malformed local test data.
      }
    }
  }, []);

  useEffect(() => {
    if (!watching) return;

    if (!navigator.geolocation) {
      setError("Location is not supported on this device.");
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (position) => {
        setLocation({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
        });

        setError("");
      },
      (err) => setError(err.message),
      {
        enableHighAccuracy: true,
        maximumAge: 0,
        timeout: 10000,
      }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }, [watching]);

  const routeMatch = useMemo(() => {
    if (!location) return null;

    const userPoint = point([
      location.longitude,
      location.latitude,
    ]);

    const snapped = nearestPointOnLine(routeLine, userPoint, {
      units: "kilometers",
    });

    const distanceFromRouteKm = snapped.properties.dist ?? 0;
    const distanceAlongRouteKm = snapped.properties.location ?? 0;

    const progress =
      routeLengthKm > 0
        ? (distanceAlongRouteKm / routeLengthKm) * 100
        : 0;

    const distanceFromRouteMetres = distanceFromRouteKm * 1000;

    let status = "OFF ROUTE";

    if (distanceFromRouteMetres <= 50) {
      status = "GOOD";
    } else if (distanceFromRouteMetres <= 150) {
      status = "POSSIBLE";
    }

    return {
      status,
      progress,
      distanceAlongRouteKm,
      distanceFromRouteMetres,
    };
  }, [location, routeLine, routeLengthKm]);

  useEffect(() => {
    if (!routeMatch) return;
    if (routeMatch.status === "OFF ROUTE") return;

    // Do not let normal GPS wobble send the experience backwards.
    setJourneyProgress((current) =>
      Math.max(current, routeMatch.progress)
    );
  }, [routeMatch]);

  const currentCueIndex = useMemo(() => {
    let index = 0;

    cues.forEach((cue, cueIndex) => {
      if (journeyProgress >= cue.progress) {
        index = cueIndex;
      }
    });

    return index;
  }, [journeyProgress]);

  const currentCue = cues[currentCueIndex];
  const previousCue =
    currentCueIndex > 0 ? cues[currentCueIndex - 1] : null;
  const nextCue =
    currentCueIndex < cues.length - 1
      ? cues[currentCueIndex + 1]
      : null;

  function startExperience() {
    setScreen("journey");
    setWatching(true);
    setJourneyProgress(0);
  }

  function markCurrentSpot() {
    if (!location || !routeMatch) return;

    const spot: MarkedSpot = {
      id: crypto.randomUUID(),
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      routeProgress: routeMatch.progress,
      distanceAlongKm: routeMatch.distanceAlongRouteKm,
      distanceFromRouteMetres:
        routeMatch.distanceFromRouteMetres,
    };

    const updated = [...markedSpots, spot];

    setMarkedSpots(updated);

    localStorage.setItem(
      "between-stops-marked-spots",
      JSON.stringify(updated)
    );
  }

  function speakCue() {
    if (!("speechSynthesis" in window)) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(
      `${currentCue.title}. ${currentCue.text}`
    );

    utterance.rate = 0.95;

    window.speechSynthesis.speak(utterance);
  }

  if (screen === "home") {
    return (
      <main className="shell">
        <header className="brandHeader">
          <div className="brandMark">BS</div>
          <span>Between Stops</span>
        </header>

        <section className="hero">
          <p className="kicker">DISCOVER WHAT'S BETWEEN</p>

          <h1>
            Turn ordinary journeys
            <br />
            into experiences.
          </h1>

          <p className="heroCopy">
            Stories, sights and sounds that unfold as you travel
            through the city.
          </p>
        </section>

        <section className="discoverSection">
          <div className="sectionHeading">
            <div>
              <p className="kicker">NEAR YOU</p>
              <h2>Available experiences</h2>
            </div>

            <span className="countPill">1</span>
          </div>

          <button
            className="experienceCard"
            onClick={() => setScreen("overview")}
          >
            <div className="experienceImage">
              <div className="tramLine">
                <span />
                <span />
                <span />
                <span />
              </div>

              <div className="imageBadge">EDINBURGH TRAM</div>
            </div>

            <div className="experienceBody">
              <p className="routeLabel">
                Airport <span>→</span> West End
              </p>

              <h3>Into Edinburgh</h3>

              <p>
                A location-aware journey through west Edinburgh
                as the city gradually comes into view.
              </p>

              <div className="metaRow">
                <span>🎧 Audio</span>
                <span>◫ Images</span>
                <span>◉ Things to spot</span>
              </div>

              <div className="cardFooter">
                <span>Approx. 30 mins</span>
                <strong>Explore →</strong>
              </div>
            </div>
          </button>
        </section>
      </main>
    );
  }

  if (screen === "overview") {
    return (
      <main className="shell">
        <header className="topBar">
          <button
            className="textButton"
            onClick={() => setScreen("home")}
          >
            ← Back
          </button>

          <span className="miniBrand">Between Stops</span>
        </header>

        <section className="overviewHero">
          <div className="overviewArt">
            <div className="imageBadge">EDINBURGH TRAM</div>
          </div>

          <p className="kicker">AIRPORT → WEST END</p>

          <h1>Into Edinburgh</h1>

          <p className="lead">
            Watch Edinburgh emerge through the window, one story
            at a time.
          </p>

          <div className="overviewMeta">
            <span>About 30 mins</span>
            <span>8 moments</span>
            <span>Mostly seated</span>
          </div>
        </section>

        <section className="journeyOutline">
          <p className="kicker">YOUR JOURNEY</p>

          <div className="timeline">
            <div className="timelineStop startStop">
              <span className="timelineDot" />
              <div>
                <strong>Edinburgh Airport</strong>
                <small>Start here</small>
              </div>
            </div>

            {cues.slice(1, -1).map((cue) => (
              <div className="timelineMoment" key={cue.id}>
                <span className="timelineDot small" />

                <div>
                  <small>{cue.eyebrow}</small>
                  <strong>{cue.title}</strong>
                </div>
              </div>
            ))}

            <div className="timelineStop">
              <span className="timelineDot" />

              <div>
                <strong>West End</strong>
                <small>Journey ends</small>
              </div>
            </div>
          </div>
        </section>

        <div className="stickyAction">
          <button className="primaryButton" onClick={startExperience}>
            Start experience
          </button>

          <p>
            Location access is used to keep the experience in sync
            with your journey.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="journeyShell">
      <header className="journeyHeader">
        <div>
          <span className="miniBrand">Between Stops</span>
          <p>Airport → West End</p>
        </div>

        <button
          className="iconButton"
          onClick={() => setTesterOpen(!testerOpen)}
          aria-label="Toggle test information"
        >
          •••
        </button>
      </header>

      <div className="progressTrack">
        <div
          className="progressFill"
          style={{
            width: `${Math.min(100, journeyProgress)}%`,
          }}
        />
      </div>

      {routeMatch?.status === "OFF ROUTE" && (
        <div className="routeNotice">
          <strong>Waiting to join the route</strong>
          <span>
            Your experience will begin progressing once you're near
            the tram line.
          </span>
        </div>
      )}

      <section className="cueStack">
        {previousCue && (
          <article className="cueCard previousCue">
            <p className="kicker">JUST PASSED</p>
            <h3>{previousCue.title}</h3>
          </article>
        )}

        <article className="cueCard activeCue">
          <div className="cueTop">
            <p className="kicker">{currentCue.eyebrow}</p>

            <span className="cueNumber">
              {currentCueIndex + 1} / {cues.length}
            </span>
          </div>

          {currentCue.type === "image" && (
            <div className="mediaPlaceholder">
              <span>TEST IMAGE</span>
            </div>
          )}

          {currentCue.type === "look" && (
            <div className="lookPanel">
              <span className="lookArrow">
                {currentCue.lookDirection === "left" ? "←" : "→"}
              </span>

              <span>
                Look {currentCue.lookDirection}
              </span>
            </div>
          )}

          {currentCue.type === "question" && (
            <div className="questionMarker">?</div>
          )}

          <h1>{currentCue.title}</h1>

          <p className="cueCopy">{currentCue.text}</p>

          {currentCue.type === "audio" && (
            <button className="audioButton" onClick={speakCue}>
              <span className="playIcon">▶</span>

              <span>
                <strong>Play test audio</strong>
                <small>Temporary voice for prototype</small>
              </span>
            </button>
          )}

          {currentCue.type === "question" && (
            <div className="answerChoices">
              <button>Buildings</button>
              <button>Landscape</button>
              <button>People</button>
            </div>
          )}
        </article>

        {nextCue && (
          <article className="cueCard nextCue">
            <p className="kicker">COMING UP</p>

            <h3>{nextCue.title}</h3>

            <p>{nextCue.eyebrow}</p>
          </article>
        )}
      </section>

      {testerOpen && (
        <section className="testerPanel">
          <div className="testerHeading">
            <div>
              <p className="kicker">TEST MODE</p>
              <h2>Journey diagnostics</h2>
            </div>

            <button
              className="textButton"
              onClick={() => setTesterOpen(false)}
            >
              Close
            </button>
          </div>

          <div className="diagnosticGrid">
            <div>
              <small>GPS accuracy</small>
              <strong>
                {location
                  ? `±${Math.round(location.accuracy)}m`
                  : "—"}
              </strong>
            </div>

            <div>
              <small>Route match</small>
              <strong>{routeMatch?.status ?? "—"}</strong>
            </div>

            <div>
              <small>Raw route position</small>
              <strong>
                {routeMatch
                  ? `${routeMatch.progress.toFixed(1)}%`
                  : "—"}
              </strong>
            </div>

            <div>
              <small>Trusted progress</small>
              <strong>{journeyProgress.toFixed(1)}%</strong>
            </div>

            <div>
              <small>Distance from route</small>
              <strong>
                {routeMatch
                  ? `${Math.round(
                      routeMatch.distanceFromRouteMetres
                    )}m`
                  : "—"}
              </strong>
            </div>

            <div>
              <small>Distance along route</small>
              <strong>
                {routeMatch
                  ? `${routeMatch.distanceAlongRouteKm.toFixed(
                      2
                    )}km`
                  : "—"}
              </strong>
            </div>
          </div>

          <button
            className="markButton"
            onClick={markCurrentSpot}
            disabled={!location || !routeMatch}
          >
            📍 Mark this spot
          </button>

          <p className="testerHelp">
            Use this while travelling to record an interesting place
            that could become a future trigger.
          </p>

          {markedSpots.length > 0 && (
            <div className="markedList">
              <p className="kicker">
                MARKED SPOTS ({markedSpots.length})
              </p>

              {markedSpots.map((spot, index) => (
                <div className="markedSpot" key={spot.id}>
                  <strong>Spot {index + 1}</strong>

                  <span>
                    {spot.routeProgress.toFixed(1)}% ·{" "}
                    {spot.distanceAlongKm.toFixed(2)}km along route
                  </span>

                  <small>
                    GPS ±{Math.round(spot.accuracy)}m ·{" "}
                    {Math.round(spot.distanceFromRouteMetres)}m from
                    route
                  </small>
                </div>
              ))}
            </div>
          )}

          <button
            className="resetButton"
            onClick={() => setJourneyProgress(0)}
          >
            Reset journey progress
          </button>
        </section>
      )}

      {error && <div className="errorNotice">{error}</div>}
    </main>
  );
}