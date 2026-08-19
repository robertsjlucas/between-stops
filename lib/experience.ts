import nearestPointOnLine from "@turf/nearest-point-on-line";
import { lineString, point } from "@turf/helpers";
import length from "@turf/length";

import type {
  ExperienceDefinition,
  JourneyDirection,
  RouteDefinition,
  StoryDefinition,
} from "./types";

export type DirectionalSide = "left" | "right";

export type StoryTiming = {
  subjectJourneyProgress: number;
  triggerJourneyProgress: number;
  estimatedEndJourneyProgress: number;
  leadDistanceMetres: number;
  playbackSeconds: number;
  durationIsEstimated: boolean;
};

const FALLBACK_AUDIO_SECONDS = 45;

function getTravelSpeedMetresPerSecond(
  route: RouteDefinition
) {
  if (route.mode === "train") return 15;
  if (route.mode === "tram") return 8.5;
  if (route.mode === "cab") return 7.5;
  return 6.5;
}

export function getStoryTiming(
  route: RouteDefinition,
  experience: ExperienceDefinition,
  story: Pick<
    StoryDefinition,
    | "routeProgress"
    | "audioDurationSeconds"
    | "directionalPrompt"
  >,
  direction: JourneyDirection
): StoryTiming {
  const subjectJourneyProgress = Math.min(
    100,
    Math.max(
      0,
      getJourneyProgress(
        story.routeProgress,
        experience,
        direction
      )
    )
  );
  const durationIsEstimated =
    !story.audioDurationSeconds ||
    story.audioDurationSeconds <= 0;
  const playbackSeconds =
    (durationIsEstimated
      ? FALLBACK_AUDIO_SECONDS
      : story.audioDurationSeconds ?? FALLBACK_AUDIO_SECONDS) +
    (story.directionalPrompt ? 3 : 0);
  const routeDistanceMetres =
    length(lineString(route.coordinates), {
      units: "kilometers",
    }) * 1000;
  const sectionDistanceMetres = Math.max(
    1,
    routeDistanceMetres *
      (Math.abs(
        experience.endProgress -
          experience.startProgress
      ) /
        100)
  );
  const speed =
    getTravelSpeedMetresPerSecond(route);
  const minimumLead =
    route.mode === "train" ? 250 : 90;
  const maximumLead =
    route.mode === "train" ? 1800 : 900;
  const leadDistanceMetres = Math.min(
    maximumLead,
    Math.max(
      minimumLead,
      playbackSeconds * speed + 35
    )
  );
  const leadJourneyShare =
    (leadDistanceMetres /
      sectionDistanceMetres) *
    100;
  const playbackJourneyShare =
    ((playbackSeconds * speed) /
      sectionDistanceMetres) *
    100;
  const triggerJourneyProgress = Math.max(
    0,
    subjectJourneyProgress -
      leadJourneyShare
  );

  return {
    subjectJourneyProgress,
    triggerJourneyProgress,
    estimatedEndJourneyProgress:
      triggerJourneyProgress +
      playbackJourneyShare,
    leadDistanceMetres: Math.min(
      leadDistanceMetres,
      (subjectJourneyProgress / 100) *
        sectionDistanceMetres
    ),
    playbackSeconds,
    durationIsEstimated,
  };
}

export type StoryTimingWarning = {
  direction: JourneyDirection;
  firstStoryId: string;
  secondStoryId: string;
};

export function getStoryTimingWarnings(
  route: RouteDefinition,
  experience: ExperienceDefinition
): StoryTimingWarning[] {
  const warnings: StoryTimingWarning[] = [];

  (["forward", "reverse"] as const).forEach(
    (direction) => {
      const timedStories = experience.stories
        .filter(
          (story) =>
            story.direction === "both" ||
            story.direction === direction
        )
        .map((story) => ({
          story,
          timing: getStoryTiming(
            route,
            experience,
            story,
            direction
          ),
        }))
        .sort(
          (first, second) =>
            first.timing.triggerJourneyProgress -
            second.timing.triggerJourneyProgress
        );

      timedStories.forEach((item, index) => {
        const next = timedStories[index + 1];

        if (
          next &&
          next.timing.triggerJourneyProgress <
            item.timing.estimatedEndJourneyProgress
        ) {
          warnings.push({
            direction,
            firstStoryId: item.story.id,
            secondStoryId: next.story.id,
          });
        }
      });
    }
  );

  return warnings;
}

export function getDirectionalSide(
  route: RouteDefinition,
  subject: StoryDefinition["subjectLocation"],
  direction: JourneyDirection
): DirectionalSide | null {
  if (!subject || route.coordinates.length < 2) {
    return null;
  }

  const nearest = nearestPointOnLine(
    lineString(route.coordinates),
    point([subject.longitude, subject.latitude]),
    { units: "kilometers" }
  );
  const segmentIndex = Math.min(
    route.coordinates.length - 2,
    Math.max(0, Number(nearest.properties.index ?? 0))
  );
  const first = route.coordinates[segmentIndex];
  const second = route.coordinates[segmentIndex + 1];
  const start = direction === "forward" ? first : second;
  const end = direction === "forward" ? second : first;
  const longitudeScale = Math.cos(
    (subject.latitude * Math.PI) / 180
  );
  const routeX = (end[0] - start[0]) * longitudeScale;
  const routeY = end[1] - start[1];
  const subjectX =
    (subject.longitude - start[0]) * longitudeScale;
  const subjectY = subject.latitude - start[1];
  const crossProduct =
    routeX * subjectY - routeY * subjectX;

  if (Math.abs(crossProduct) < 1e-12) {
    return null;
  }

  return crossProduct > 0 ? "left" : "right";
}

export type TranscriptAvailability =
  | "none"
  | "partial"
  | "full";

export function getTranscriptAvailability(
  stories: Pick<StoryDefinition, "text">[]
): TranscriptAvailability {
  const transcriptCount = stories.filter(
    (story) => story.text.trim().length > 0
  ).length;

  if (transcriptCount === 0) {
    return "none";
  }

  return transcriptCount === stories.length
    ? "full"
    : "partial";
}

export function getSectionProgress(
  routeProgress: number,
  experience: ExperienceDefinition
) {
  const start = experience.startProgress;
  const end = experience.endProgress;

  const sectionLength = end - start;

  if (sectionLength <= 0) {
    return 0;
  }

  return ((routeProgress - start) / sectionLength) * 100;
}

export function getJourneyProgress(
  routeProgress: number,
  experience: ExperienceDefinition,
  direction: JourneyDirection
) {
  const sectionProgress = getSectionProgress(
    routeProgress,
    experience
  );

  const clamped = Math.min(
    100,
    Math.max(0, sectionProgress)
  );

  return direction === "forward"
    ? clamped
    : 100 - clamped;
}

export function isInsideExperienceSection(
  routeProgress: number,
  experience: ExperienceDefinition
) {
  return (
    routeProgress >= experience.startProgress &&
    routeProgress <= experience.endProgress
  );
}

export type JourneyStory = StoryDefinition & {
  journeyProgress: number;
  triggerJourneyProgress: number;
  leadDistanceMetres: number;
  playbackSeconds: number;
  durationIsEstimated: boolean;
};

export function getStoriesForJourney(
  route: RouteDefinition,
  experience: ExperienceDefinition,
  direction: JourneyDirection
): JourneyStory[] {
  return experience.stories
    .filter(
      (story) =>
        story.direction === "both" ||
        story.direction === direction
    )
    .map((story) => {
      const timing = getStoryTiming(
        route,
        experience,
        story,
        direction
      );

      return {
        ...story,
        journeyProgress:
          timing.subjectJourneyProgress,
        triggerJourneyProgress:
          timing.triggerJourneyProgress,
        leadDistanceMetres:
          timing.leadDistanceMetres,
        playbackSeconds:
          timing.playbackSeconds,
        durationIsEstimated:
          timing.durationIsEstimated,
      };
    })
    .sort(
      (a, b) =>
        a.triggerJourneyProgress -
        b.triggerJourneyProgress
    );
}
