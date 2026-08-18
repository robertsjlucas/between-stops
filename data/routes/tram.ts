import { RouteDefinition } from "@/lib/types";
import { tramRouteCoordinates } from "@/data/tram-airport-west-end-geometry";

export const edinburghTramRoute: RouteDefinition = {
  id: "edinburgh-tram-airport-west-end",

  number: "T50",

  name: "Edinburgh Tram",

  mode: "tram",

  canonicalStart: "Edinburgh Airport",
  canonicalEnd: "West End",

  coordinates: tramRouteCoordinates,
};