import fs from "node:fs";
import path from "node:path";

import {
  lineString,
  point,
} from "@turf/helpers";

import nearestPointOnLine from "@turf/nearest-point-on-line";
import length from "@turf/length";
import distance from "@turf/distance";

const ROOT = process.cwd();

function readJson(relativePath) {
  return JSON.parse(
    fs.readFileSync(
      path.join(ROOT, relativePath),
      "utf8"
    )
  );
}

function cleanStopName(name) {
  return String(name ?? "")
    .replace(/\s*\(Edinburgh Trams\)\s*/gi, "")
    .trim();
}

function getRouteObject(data) {
  if (
    !data ||
    !Array.isArray(data.routes) ||
    data.routes.length === 0
  ) {
    throw new Error(
      "No routes found in Transitland response."
    );
  }

  return data.routes[0];
}

function getGeometryLines(route) {
  const geometry = route.geometry;

  if (!geometry) {
    throw new Error(
      "Route has no geometry."
    );
  }

  if (geometry.type === "LineString") {
    return [geometry.coordinates];
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates;
  }

  throw new Error(
    `Unsupported geometry type: ${geometry.type}`
  );
}

function getRawStops(route) {
  const routeStops =
    route.route_stops ?? [];

  return routeStops
    .map((item) => item.stop ?? item)
    .filter(
      (stop) =>
        stop?.geometry?.coordinates &&
        stop?.stop_name
    )
    .map((stop) => ({
      id: String(
        stop.stop_id ??
          stop.id ??
          crypto.randomUUID()
      ),

      name: cleanStopName(
        stop.stop_name
      ),

      coordinates:
        stop.geometry.coordinates,
    }));
}

function deduplicateStops(stops) {
  const found = new Map();

  for (const stop of stops) {
    const key = stop.name
      .toLowerCase()
      .trim();

    const existing = found.get(key);

    if (!existing) {
      found.set(key, stop);
    }
  }

  return [...found.values()];
}

function findStop(stops, searchTerms) {
  for (const term of searchTerms) {
    const lower =
      term.toLowerCase();

    const exact = stops.find(
      (stop) =>
        stop.name.toLowerCase() ===
        lower
    );

    if (exact) return exact;
  }

  for (const term of searchTerms) {
    const lower =
      term.toLowerCase();

    const partial = stops.find(
      (stop) =>
        stop.name
          .toLowerCase()
          .includes(lower)
    );

    if (partial) return partial;
  }

  return null;
}

function chooseBestLine(
  lines,
  startStop,
  endStop
) {
  let best = null;

  for (const coordinates of lines) {
    if (
      !Array.isArray(coordinates) ||
      coordinates.length < 2
    ) {
      continue;
    }

    const first =
      coordinates[0];

    const last =
      coordinates[
        coordinates.length - 1
      ];

    const direct =
      distance(
        point(first),
        point(startStop.coordinates),
        { units: "kilometers" }
      ) +
      distance(
        point(last),
        point(endStop.coordinates),
        { units: "kilometers" }
      );

    const reverse =
      distance(
        point(first),
        point(endStop.coordinates),
        { units: "kilometers" }
      ) +
      distance(
        point(last),
        point(startStop.coordinates),
        { units: "kilometers" }
      );

    const score =
      Math.min(direct, reverse);

    if (
      !best ||
      score < best.score
    ) {
      best = {
        coordinates,
        score,
        reverse:
          reverse < direct,
      };
    }
  }

  if (!best) {
    throw new Error(
      "Could not select route geometry."
    );
  }

  return best.reverse
    ? [...best.coordinates].reverse()
    : [...best.coordinates];
}

function orderStopsAlongRoute(
  coordinates,
  rawStops
) {
  const line =
    lineString(coordinates);

  const routeLengthKm =
    length(line, {
      units: "kilometers",
    });

  const projected =
    rawStops.map((stop) => {
      const snapped =
        nearestPointOnLine(
          line,
          point(stop.coordinates),
          {
            units: "kilometers",
          }
        );

      const location =
        Number(
          snapped.properties.location ??
            0
        );

      const dist =
        Number(
          snapped.properties.dist ??
            999
        );

      return {
        ...stop,

        routeProgress:
          routeLengthKm > 0
            ? (location /
                routeLengthKm) *
              100
            : 0,

        distanceFromRouteKm:
          dist,
      };
    });

  /*
    Transitland route_stops can contain
    stops belonging to both directions
    and variants.

    Keep stops reasonably close to the
    selected geometry.
  */
  const nearby =
    projected.filter(
      (stop) =>
        stop.distanceFromRouteKm <=
        0.3
    );

  nearby.sort(
    (a, b) =>
      a.routeProgress -
      b.routeProgress
  );

  /*
    Remove duplicate named stops which
    often represent the opposite platform.
  */
  const ordered = [];
  const seen = new Set();

  for (const stop of nearby) {
    const key = stop.name
      .toLowerCase()
      .trim();

    if (seen.has(key)) continue;

    seen.add(key);

    ordered.push({
      id: stop.id,
      name: stop.name,
      coordinates:
        stop.coordinates,
      routeProgress:
        Math.round(
          stop.routeProgress * 1000
        ) / 1000,
    });
  }

  return ordered;
}

function toTsCoordinates(
  coordinates
) {
  return JSON.stringify(
    coordinates,
    null,
    2
  );
}

function toTsStops(stops) {
  return JSON.stringify(
    stops,
    null,
    2
  );
}

function buildRoute({
  input,
  output,
  exportName,
  id,
  number,
  name,
  mode,
  startNames,
  endNames,
}) {
  const data =
    readJson(input);

  const route =
    getRouteObject(data);

  const lines =
    getGeometryLines(route);

  const allStops =
    deduplicateStops(
      getRawStops(route)
    );

  const startStop =
    findStop(
      allStops,
      startNames
    );

  const endStop =
    findStop(
      allStops,
      endNames
    );

  if (!startStop) {
    console.log(
      "\nAvailable stops:"
    );

    allStops.forEach((stop) =>
      console.log(
        `- ${stop.name}`
      )
    );

    throw new Error(
      `Could not find start stop for ${name}`
    );
  }

  if (!endStop) {
    console.log(
      "\nAvailable stops:"
    );

    allStops.forEach((stop) =>
      console.log(
        `- ${stop.name}`
      )
    );

    throw new Error(
      `Could not find end stop for ${name}`
    );
  }

  const coordinates =
    chooseBestLine(
      lines,
      startStop,
      endStop
    );

  const stops =
    orderStopsAlongRoute(
      coordinates,
      allStops
    );

  const contents = `import type { RouteDefinition } from "@/lib/types";

export const ${exportName}: RouteDefinition = {
  id: ${JSON.stringify(id)},
  number: ${JSON.stringify(number)},
  name: ${JSON.stringify(name)},
  mode: ${JSON.stringify(mode)},

  canonicalStart: ${JSON.stringify(
    startStop.name
  )},

  canonicalEnd: ${JSON.stringify(
    endStop.name
  )},

  coordinates: ${toTsCoordinates(
    coordinates
  )},

  stops: ${toTsStops(stops)},
};
`;

  fs.mkdirSync(
    path.dirname(
      path.join(ROOT, output)
    ),
    {
      recursive: true,
    }
  );

  fs.writeFileSync(
    path.join(ROOT, output),
    contents
  );

  console.log(
    `\nCreated ${output}`
  );

  console.log(
    `${startStop.name} → ${endStop.name}`
  );

  console.log(
    `${coordinates.length} geometry points`
  );

  console.log(
    `${stops.length} ordered stops`
  );

  console.log("\nStops:");

  stops.forEach(
    (stop, index) => {
      console.log(
        `${index + 1}. ${stop.name} (${stop.routeProgress.toFixed(
          1
        )}%)`
      );
    }
  );
}

/*
  FULL EDINBURGH TRAM
*/

buildRoute({
  input:
    "data/t50-route.json",

  output:
    "data/routes/tram-full.ts",

  exportName:
    "edinburghTramFullRoute",

  id:
    "edinburgh-tram-full",

  number: "T50",

  name:
    "Edinburgh Tram",

  mode: "tram",

  startNames: [
    "Edinburgh Airport",
  ],

  endNames: [
    "Newhaven",
  ],
});

/*
  FULL LOTHIAN 35
*/

buildRoute({
  input:
    "data/route35.json",

  output:
    "data/routes/bus35-full.ts",

  exportName:
    "route35Full",

  id:
    "route-35-full",

  number: "35",

  name:
    "Lothian Bus 35",

  mode: "bus",

  startNames: [
    "Heriot-Watt University",
    "Heriot Watt University",
    "Heriot-Watt",
    "Heriot Watt",
  ],

  endNames: [
    "Ocean Terminal",
  ],
});