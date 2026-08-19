import fs from "node:fs";
import path from "node:path";

import {
  lineString,
  point,
} from "@turf/helpers";
import length from "@turf/length";
import nearestPointOnLine from "@turf/nearest-point-on-line";

const ROOT = process.cwd();
const ROUTES_URL =
  "https://lothianapi.co.uk/routesForService?service_name=lothian";
const PATTERNS_URL =
  "https://lothianapi.co.uk/routePatterns?route_name=";
const REFERER =
  "https://www.lothianbuses.com/our-services/lothian-city-buses/";
const OUTPUT = path.join(
  ROOT,
  "data/routes/lothian-buses.generated.ts"
);

const headers = {
  accept: "application/json",
  referer: REFERER,
  "user-agent":
    "Mozilla/5.0 Between-Stops route catalogue updater",
};

async function fetchJson(url) {
  const response = await fetch(url, {
    headers,
  });

  if (!response.ok) {
    throw new Error(
      `${response.status} ${response.statusText} while loading ${url}`
    );
  }

  return response.json();
}

function decodePolyline(encoded) {
  let index = 0;
  let latitude = 0;
  let longitude = 0;
  const coordinates = [];

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte;

    do {
      byte =
        encoded.charCodeAt(index++) -
        63;
      result |=
        (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude +=
      result & 1
        ? ~(result >> 1)
        : result >> 1;

    result = 0;
    shift = 0;

    do {
      byte =
        encoded.charCodeAt(index++) -
        63;
      result |=
        (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude +=
      result & 1
        ? ~(result >> 1)
        : result >> 1;

    coordinates.push([
      longitude / 1e5,
      latitude / 1e5,
    ]);
  }

  return coordinates;
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function naturalRouteSort(
  first,
  second
) {
  return first.name.localeCompare(
    second.name,
    "en-GB",
    {
      numeric: true,
      sensitivity: "base",
    }
  );
}

function selectCanonicalPatterns(
  patterns
) {
  const outbound = patterns.filter(
    (pattern) =>
      Number(pattern.direction) === 0
  );

  const candidates =
    outbound.length > 0
      ? outbound
      : patterns;

  const bestByJourney = new Map();

  for (const pattern of candidates) {
    const key = `${pattern.origin}::${pattern.destination}`;
    const current =
      bestByJourney.get(key);

    if (
      !current ||
      (pattern.stops?.length ?? 0) >
        (current.stops?.length ?? 0)
    ) {
      bestByJourney.set(
        key,
        pattern
      );
    }
  }

  return [...bestByJourney.values()];
}

function buildStops(
  coordinates,
  rawStops
) {
  const line =
    lineString(coordinates);
  const routeLength =
    length(line, {
      units: "kilometers",
    });
  const seen = new Set();

  return (rawStops ?? [])
    .filter((stop) => {
      const key = String(
        stop.id ?? stop.name
      );

      if (seen.has(key)) {
        return false;
      }

      seen.add(key);
      return Boolean(
        stop.coordinate
      );
    })
    .map((stop) => {
      const coordinatesForStop = [
        Number(
          stop.coordinate.longitude
        ),
        Number(
          stop.coordinate.latitude
        ),
      ];
      const snapped =
        nearestPointOnLine(
          line,
          point(coordinatesForStop),
          {
            units: "kilometers",
          }
        );
      const location = Number(
        snapped.properties.location ??
          0
      );

      return {
        id: String(
          stop.id ??
            `${stop.name}-${location}`
        ),
        name: String(
          stop.name ?? "Bus stop"
        ).trim(),
        coordinates:
          coordinatesForStop,
        routeProgress:
          routeLength > 0
            ? Math.round(
                (location /
                  routeLength) *
                  100000
              ) / 1000
            : 0,
      };
    })
    .sort(
      (first, second) =>
        first.routeProgress -
        second.routeProgress
    );
}

function makeDefinition(
  route,
  pattern,
  variantCount
) {
  const coordinates =
    decodePolyline(
      pattern.polyline
    );
  const routeId =
    variantCount === 1
      ? `lothian-${slug(route.name)}`
      : `lothian-${slug(
          route.name
        )}-${slug(
          pattern.origin
        )}-${slug(
          pattern.destination
        )}`;

  return {
    id: routeId,
    number: String(route.name),
    name: `Lothian Bus ${route.name}`,
    mode: "bus",
    canonicalStart: String(
      pattern.origin
    ),
    canonicalEnd: String(
      pattern.destination
    ),
    coordinates,
    stops: buildStops(
      coordinates,
      pattern.stops
    ),
  };
}

async function mapWithConcurrency(
  items,
  concurrency,
  mapper
) {
  const results =
    new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] =
        await mapper(
          items[index],
          index
        );
    }
  }

  await Promise.all(
    Array.from(
      {
        length: Math.min(
          concurrency,
          items.length
        ),
      },
      () => worker()
    )
  );

  return results;
}

async function main() {
  const catalogue =
    await fetchJson(ROUTES_URL);
  const routes = (
    catalogue.routes ?? []
  )
    .filter(
      (route) =>
        String(route.name) !== "35"
    )
    .sort(naturalRouteSort);

  const groups =
    await mapWithConcurrency(
      routes,
      5,
      async (route, index) => {
        process.stdout.write(
          `\rLoading Lothian route ${index + 1}/${routes.length}: ${route.name}   `
        );

        const data = await fetchJson(
          `${PATTERNS_URL}${encodeURIComponent(
            route.name
          )}`
        );
        const patterns =
          selectCanonicalPatterns(
            data.patterns ?? []
          );

        return patterns.map(
          (pattern) =>
            makeDefinition(
              route,
              pattern,
              patterns.length
            )
        );
      }
    );

  const definitions =
    groups.flat();
  const generatedAt =
    new Date().toISOString();
  const contents = `/*
  Generated by npm run routes:update.
  Source: the route-pattern service used by the official Lothian Buses interactive map.
  Generated: ${generatedAt}

  Route 35 remains in bus35-full.ts so existing saved tours retain their stop IDs.
*/

import type { RouteDefinition } from "@/lib/types";

export const lothianRoutesUpdatedAt = ${JSON.stringify(
    generatedAt
  )};

export const lothianBusRoutes: RouteDefinition[] = ${JSON.stringify(
    definitions,
    null,
    2
  )};
`;

  fs.writeFileSync(
    OUTPUT,
    contents
  );

  process.stdout.write("\n");
  console.log(
    `Created ${path.relative(
      ROOT,
      OUTPUT
    )}`
  );
  console.log(
    `${routes.length + 1} bus services available (${definitions.length + 1} bus route choices including preserved route 35, plus the tram).`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
