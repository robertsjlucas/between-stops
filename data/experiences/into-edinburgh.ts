import { ExperienceDefinition } from "@/lib/types";

export const intoEdinburghExperience: ExperienceDefinition = {
  id: "into-edinburgh",

  title: "Into Edinburgh",

  description:
    "Watch Edinburgh emerge through the window, one story at a time.",

  routeId: "edinburgh-tram-airport-west-end",

  startProgress: 0,
  endProgress: 100,

  startLabel: "Edinburgh Airport",
  endLabel: "West End",

  durationMinutes: 30,

  stories: [
    {
      id: "airport-start",
      routeProgress: 2,
      eyebrow: "Getting underway",
      title: "Leaving the airport",
      text:
        "Edinburgh is still some distance away. The journey into the city begins here.",
      type: "audio",
      direction: "both",
    },

    {
      id: "ingliston-gogarburn",
      routeProgress: 14,
      eyebrow: "Between stops",
      title: "The landscape starts to change",
      text:
        "The airport is beginning to disappear behind us and the edges of Edinburgh are coming into view.",
      type: "image",
      direction: "both",
    },

    {
      id: "gateway",
      routeProgress: 27,
      eyebrow: "Something to spot",
      title: "The city begins to appear",
      text:
        "This is where a future story can point out something visible from the tram.",
      type: "look",
      direction: "both",

      /*
        We will replace this with a real subject pin.
      */
      directionalPrompt: true,
    },

    {
      id: "edinburgh-park",
      routeProgress: 43,
      eyebrow: "Listen",
      title: "A different Edinburgh",
      text:
        "Not every Edinburgh story begins in the Old Town. The western edge of the city tells a very different one.",
      type: "audio",
      direction: "both",
    },

    {
      id: "bankhead-saughton",
      routeProgress: 58,
      eyebrow: "Between stops",
      title: "The journey changes character",
      text:
        "This is an example of a story deliberately positioned between two stops rather than at one.",
      type: "image",
      direction: "both",
    },

    {
      id: "balgreen",
      routeProgress: 75,
      eyebrow: "A quick question",
      title: "What do you notice first?",
      text:
        "Some stories can contain simple interactive elements rather than narration.",
      type: "question",
      direction: "both",
    },

    {
      id: "murrayfield",
      routeProgress: 87,
      eyebrow: "Something to spot",
      title: "Central Edinburgh is getting close",
      text:
        "A future subject pin here will allow Between Stops to decide automatically which direction you should look.",
      type: "look",
      direction: "both",
      directionalPrompt: true,
    },

    {
      id: "haymarket-west-end",
      routeProgress: 97,
      eyebrow: "Almost there",
      title: "The journey reaches the centre",
      text:
        "One final story as the tram approaches West End.",
      type: "audio",
      direction: "both",
    },
  ],
};