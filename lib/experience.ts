import {
  ExperienceDefinition,
  JourneyDirection,
  StoryDefinition,
} from "./types";

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
};

export function getStoriesForJourney(
  experience: ExperienceDefinition,
  direction: JourneyDirection
): JourneyStory[] {
  return experience.stories
    .filter(
      (story) =>
        story.direction === "both" ||
        story.direction === direction
    )
    .map((story) => ({
      ...story,
      journeyProgress: getJourneyProgress(
        story.routeProgress,
        experience,
        direction
      ),
    }))
    .sort(
      (a, b) =>
        a.journeyProgress - b.journeyProgress
    );
}