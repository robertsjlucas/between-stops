import type { PublicExperienceOption } from "@/lib/public-experiences";

export const PUBLIC_SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://www.beyondthestops.com";

export type PublicIntentSlug =
  | "tram"
  | "free"
  | "airport";

export type PublicIntentConfig = {
  label: string;
  kicker: (city: string) => string;
  heading: (city: string) => string;
  intro: (city: string) => string;
  title: (city: string) => string;
  description: (city: string) => string;
  matches: (
    option: PublicExperienceOption
  ) => boolean;
};

export function publicCityPath(
  countrySlug: string,
  citySlug: string
) {
  return `/${countrySlug}/${citySlug}`;
}

export function publicIntentPath(
  countrySlug: string,
  citySlug: string,
  intent: string
) {
  return `${publicCityPath(
    countrySlug,
    citySlug
  )}/${intent}`;
}

export function publicExperiencePath(
  option: PublicExperienceOption
) {
  if (
    option.countrySlug &&
    option.citySlug &&
    option.slug
  ) {
    return `${publicCityPath(
      option.countrySlug,
      option.citySlug
    )}/experiences/${option.slug}`;
  }

  return `/tours?tour=${option.experience.id}`;
}

export function absolutePublicUrl(
  path: string
) {
  return new URL(
    path,
    `${PUBLIC_SITE_URL}/`
  ).toString();
}

export function formatCitySlug(
  citySlug: string
) {
  return citySlug
    .split("-")
    .map(
      (part) =>
        part.charAt(0).toUpperCase() +
        part.slice(1)
    )
    .join(" ");
}

function includesAirport(
  option: PublicExperienceOption
) {
  const values = [
    option.experience.title,
    option.summary,
    option.fullDescription,
    option.experience.startLabel,
    option.experience.endLabel,
  ];

  return values.some((value) =>
    value
      ?.toLowerCase()
      .includes("airport")
  );
}

export const PUBLIC_INTENT_CONFIGS:
  Record<
    PublicIntentSlug,
    PublicIntentConfig
  > = {
    tram: {
      label: "Tram",
      kicker: (city) =>
        `${city.toUpperCase()} BY TRAM`,
      heading: (city) =>
        `Audio experiences for tram journeys through ${city}.`,
      intro: (city) =>
        `Discover what is outside the window while you travel by tram through ${city}. These location-aware audio experiences follow the journey and play stories as the places they belong to come into view.`,
      title: (city) =>
        `${city} Tram Audio Guides`,
      description: (city) =>
        `Location-aware audio guides for tram journeys through ${city}. Listen to stories and discover places as you travel.`,
      matches: (option) =>
        option.route.mode === "tram",
    },
    free: {
      label: "Free",
      kicker: () =>
        "FREE TO LISTEN",
      heading: (city) =>
        `Free audio experiences for journeys through ${city}.`,
      intro: (city) =>
        `Explore ${city} from the public transport journey you are already making. These experiences are free to open and use, with stories triggered along the route as you travel.`,
      title: (city) =>
        `Free ${city} Audio Guides`,
      description: (city) =>
        `Free location-aware audio guides for public transport journeys through ${city}. Discover stories and places while you travel.`,
      matches: (option) =>
        option.accessType === "free",
    },
    airport: {
      label: "Airport",
      kicker: () =>
        "START AT THE AIRPORT",
      heading: (city) =>
        `Make the journey from the airport part of your visit to ${city}.`,
      intro: (city) =>
        `Your introduction to ${city} can start before you reach the centre. These audio experiences follow public transport journeys connected with the airport, turning the transfer into part of the trip.`,
      title: (city) =>
        `${city} Airport Audio Guide`,
      description: (city) =>
        `Audio experiences for public transport journeys between the airport and ${city}. Start discovering the city while you travel.`,
      matches: includesAirport,
    },
  };

export function getPublicIntentConfig(
  intent: string
) {
  return PUBLIC_INTENT_CONFIGS[
    intent as PublicIntentSlug
  ];
}

export function getAvailablePublicIntents(
  tours: PublicExperienceOption[]
): PublicIntentSlug[] {
  return (
    Object.keys(
      PUBLIC_INTENT_CONFIGS
    ) as PublicIntentSlug[]
  ).filter((intent) =>
    tours.some(
      PUBLIC_INTENT_CONFIGS[
        intent
      ].matches
    )
  );
}

export function truncateSeoText(
  value: string,
  maxLength: number
) {
  const clean = value
    .replace(/\\s+/g, " ")
    .trim();

  if (clean.length <= maxLength) {
    return clean;
  }

  const shortened =
    clean.slice(0, maxLength - 1);

  const lastSpace =
    shortened.lastIndexOf(" ");

  return `${
    lastSpace > 0
      ? shortened.slice(0, lastSpace)
      : shortened
  }…`;
}

export function experienceSeoTitle(
  option: PublicExperienceOption,
  cityName: string
) {
  return truncateSeoText(
    `${option.experience.title} | ${cityName} ${option.transportLabel} Audio Guide`,
    60
  );
}

export function experienceSeoDescription(
  option: PublicExperienceOption,
  cityName: string
) {
  const route =
    `${option.transportLabel} audio guide from ${option.experience.startLabel} to ${option.experience.endLabel} in ${cityName}.`;

  const summary =
    option.summary?.trim();

  return truncateSeoText(
    summary
      ? `${route} ${summary}`
      : route,
    160
  );
}

export function breadcrumbStructuredData(
  items: Array<{
    name: string;
    path: string;
  }>
) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map(
      (item, index) => ({
        "@type": "ListItem",
        position: index + 1,
        name: item.name,
        item: absolutePublicUrl(
          item.path
        ),
      })
    ),
  };
}
