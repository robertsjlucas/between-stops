export type JourneyDirection = "forward" | "reverse";

export type TransportMode =
  | "tram"
  | "bus"
  | "train"
  | "cab";

export type Coordinates = [number, number];

export type RouteStop = {
  id: string;
  name: string;
  coordinates: Coordinates;
  routeProgress: number;
};

export type RouteDefinition = {
  id: string;
  number?: string;
  name: string;
  mode: TransportMode;

  canonicalStart: string;
  canonicalEnd: string;

  coordinates: Coordinates[];

  stops?: RouteStop[];
};

export type StoryType =
  | "audio"
  | "image"
  | "look"
  | "question";

export type StoryDirection =
  | "both"
  | JourneyDirection;

export type SubjectLocation = {
  latitude: number;
  longitude: number;
};

export type StoryDefinition = {
  id: string;
  title: string;
  eyebrow: string;
  text: string;
  type: StoryType;

  routeProgress: number;

  direction: StoryDirection;

  subjectLocation?: SubjectLocation;

  directionalPrompt?: boolean;

  audioUrl?: string;
  audioDurationSeconds?: number;
  audioSizeBytes?: number;
  imageUrl?: string;
  imageSizeBytes?: number;
};

export type ExperienceDefinition = {
  id: string;
  title: string;
  description: string;

  routeId: string;

  startProgress: number;
  endProgress: number;

  startLabel: string;
  endLabel: string;

  durationMinutes: number;

  stories: StoryDefinition[];
};
