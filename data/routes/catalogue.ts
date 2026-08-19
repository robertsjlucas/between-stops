import { route35Full } from "@/data/routes/bus35-full";
import {
  lothianBusRoutes,
  lothianRoutesUpdatedAt,
} from "@/data/routes/lothian-buses.generated";
import { edinburghTramFullRoute } from "@/data/routes/tram-full";

import type {
  RouteDefinition,
} from "@/lib/types";

export type RouteChoice = {
  id: string;
  route: RouteDefinition;
  label: string;
  description: string;
};

const allBusRoutes = [
  ...lothianBusRoutes,
  route35Full,
].sort((first, second) =>
  (first.number ?? first.name).localeCompare(
    second.number ?? second.name,
    "en-GB",
    {
      numeric: true,
      sensitivity: "base",
    }
  )
);

export const routeChoices: RouteChoice[] = [
  {
    id: "tram",
    route: edinburghTramFullRoute,
    label: "Edinburgh Tram",
    description: `${edinburghTramFullRoute.canonicalStart} ⇄ ${edinburghTramFullRoute.canonicalEnd}`,
  },
  ...allBusRoutes.map((route) => ({
    id:
      route.id === "route-35-full"
        ? "35"
        : route.id,
    route,
    label: route.number ?? route.name,
    description: `${route.canonicalStart} ⇄ ${route.canonicalEnd}`,
  })),
];

export const routesById:
  Record<string, RouteDefinition> =
  Object.fromEntries(
    [
      edinburghTramFullRoute,
      ...allBusRoutes,
    ].map((route) => [
      route.id,
      route,
    ])
  );

export {
  lothianRoutesUpdatedAt,
};
