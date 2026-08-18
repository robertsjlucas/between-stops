import fs from "fs";

const raw = JSON.parse(
  fs.readFileSync("data/route35.json", "utf8")
);

const route = raw.routes?.[0];

if (!route) {
  throw new Error("No route found in route35.json");
}

if (!route.geometry?.coordinates) {
  throw new Error("Route geometry missing");
}

if (!route.route_stops?.length) {
  throw new Error("Route stops missing");
}

const allLines =
  route.geometry.type === "MultiLineString"
    ? route.geometry.coordinates
    : [route.geometry.coordinates];

const stops = route.route_stops.map((item) => ({
  id: item.stop.stop_id,
  name: item.stop.stop_name,
  coordinates: item.stop.geometry.coordinates,
}));

const museumCandidates = stops.filter((stop) =>
  stop.name.toLowerCase().includes("museum of childhood")
);

const oceanCandidates = stops.filter((stop) =>
  stop.name.toLowerCase().includes("ocean terminal")
);

console.log("Museum candidates:");
museumCandidates.forEach((stop) =>
  console.log(stop.name, stop.id, stop.coordinates)
);

console.log("\nOcean Terminal candidates:");
oceanCandidates.forEach((stop) =>
  console.log(stop.name, stop.id, stop.coordinates)
);

if (!museumCandidates.length) {
  throw new Error("Museum of Childhood stop not found");
}

if (!oceanCandidates.length) {
  throw new Error("Ocean Terminal stop not found");
}

function distanceSquared(a, b) {
  return (
    Math.pow(a[0] - b[0], 2) +
    Math.pow(a[1] - b[1], 2)
  );
}

function nearestIndex(line, target) {
  let bestIndex = 0;
  let bestDistance = Infinity;

  line.forEach((point, index) => {
    const d = distanceSquared(point, target);

    if (d < bestDistance) {
      bestDistance = d;
      bestIndex = index;
    }
  });

  return {
    index: bestIndex,
    distance: bestDistance,
  };
}

let bestMatch = null;

for (const line of allLines) {
  for (const museum of museumCandidates) {
    for (const ocean of oceanCandidates) {
      const museumMatch = nearestIndex(
        line,
        museum.coordinates
      );

      const oceanMatch = nearestIndex(
        line,
        ocean.coordinates
      );

      if (museumMatch.index === oceanMatch.index) {
        continue;
      }

      const score =
        museumMatch.distance + oceanMatch.distance;

      if (!bestMatch || score < bestMatch.score) {
        bestMatch = {
          line,
          museum,
          ocean,
          museumIndex: museumMatch.index,
          oceanIndex: oceanMatch.index,
          score,
        };
      }
    }
  }
}

if (!bestMatch) {
  throw new Error(
    "Could not match both stops to the same route geometry"
  );
}

let sectionCoordinates;

if (bestMatch.museumIndex < bestMatch.oceanIndex) {
  sectionCoordinates = bestMatch.line.slice(
    bestMatch.museumIndex,
    bestMatch.oceanIndex + 1
  );
} else {
  sectionCoordinates = bestMatch.line
    .slice(
      bestMatch.oceanIndex,
      bestMatch.museumIndex + 1
    )
    .reverse();
}

const output = `import type { RouteDefinition } from "@/lib/types";

export const route35MuseumToOceanTerminal: RouteDefinition = {
  id: "route-35-museum-ocean-terminal",
  number: "35",
  name: "Lothian Bus 35",
  mode: "bus",
  canonicalStart: ${JSON.stringify(bestMatch.museum.name)},
  canonicalEnd: ${JSON.stringify(bestMatch.ocean.name)},
  coordinates: ${JSON.stringify(sectionCoordinates, null, 2)},
};
`;

fs.writeFileSync(
  "data/routes/bus35.ts",
  output
);

console.log("\nCreated data/routes/bus35.ts");
console.log(
  `Section contains ${sectionCoordinates.length} geometry points.`
);
console.log(
  `Start: ${bestMatch.museum.name}`
);
console.log(
  `End: ${bestMatch.ocean.name}`
);