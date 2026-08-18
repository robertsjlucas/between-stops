import type { ExperienceDefinition } from "@/lib/types";

export const royalMileToShoreExperience: ExperienceDefinition = {
  id: "royal-mile-to-shore",

  title: "Royal Mile to the Shore",

  description:
    "Follow the 35 from the Old Town towards Leith, with stories unfolding between the stops.",

  routeId: "route-35-museum-ocean-terminal",

  startProgress: 0,
  endProgress: 100,

  startLabel: "Museum of Childhood",
  endLabel: "Ocean Terminal",

  durationMinutes: 25,

  stories: [
    {
      id: "museum-start",
      routeProgress: 2,
      eyebrow: "Getting underway",
      title: "Leaving the Old Town",
      text:
        "A first story as the bus leaves the Royal Mile and starts heading towards Leith.",
      type: "audio",
      direction: "both",
    },

    {
      id: "canongate",
      routeProgress: 18,
      eyebrow: "Between stops",
      title: "The city starts to open out",
      text:
        "This is a test story positioned between stops rather than tied to one specific bus stop.",
      type: "image",
      direction: "both",
    },

    {
      id: "holyrood",
      routeProgress: 31,
      eyebrow: "Something to spot",
      title: "A landmark nearby",
      text:
        "This will later use a real subject pin so Between Stops can automatically decide which side of the bus to look towards.",
      type: "look",
      direction: "both",
      directionalPrompt: true,
    },

    {
      id: "leith-walk",
      routeProgress: 49,
      eyebrow: "Listen",
      title: "Old Edinburgh meets Leith",
      text:
        "A short story about how the character of the journey changes as the bus moves north.",
      type: "audio",
      direction: "both",
    },

    {
      id: "towards-shore",
      routeProgress: 68,
      eyebrow: "Between stops",
      title: "Towards the Shore",
      text:
        "A visual story can sit here, triggered while the bus is moving rather than when it arrives at a stop.",
      type: "image",
      direction: "both",
    },

    {
      id: "leith-question",
      routeProgress: 79,
      eyebrow: "A quick question",
      title: "What changes first?",
      text:
        "This is a placeholder for a simple interactive story.",
      type: "question",
      direction: "both",
    },

    {
      id: "ocean-terminal-approach",
      routeProgress: 91,
      eyebrow: "Something to spot",
      title: "Approaching the waterfront",
      text:
        "This will become a pinned visual story near Ocean Terminal.",
      type: "look",
      direction: "both",
      directionalPrompt: true,
    },

    {
      id: "ocean-terminal-arrival",
      routeProgress: 98,
      eyebrow: "Almost there",
      title: "The journey reaches the waterfront",
      text:
        "A final story as the bus approaches Ocean Terminal.",
      type: "audio",
      direction: "both",
    },
  ],
};