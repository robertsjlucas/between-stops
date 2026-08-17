import fs from "fs";

const raw = JSON.parse(
  fs.readFileSync("data/t50-route.json", "utf8")
);

const route = raw.routes[0];
const lines = route.geometry.coordinates;

// First line runs Airport → Newhaven in the data we retrieved.
const fullLine = lines[0];

const westEnd = [-3.21209416504, 55.9484223638];

function distanceSquared(a, b) {
  return (
    Math.pow(a[0] - b[0], 2) +
    Math.pow(a[1] - b[1], 2)
  );
}

let westEndIndex = 0;
let bestDistance = Infinity;

fullLine.forEach((point, index) => {
  const d = distanceSquared(point, westEnd);

  if (d < bestDistance) {
    bestDistance = d;
    westEndIndex = index;
  }
});

const airportToWestEnd = fullLine.slice(0, westEndIndex + 1);

const output = `export const tramRouteCoordinates: [number, number][] = ${JSON.stringify(
  airportToWestEnd,
  null,
  2
)};
`;

fs.writeFileSync(
  "data/tram-airport-west-end-geometry.ts",
  output
);

console.log(
  `Created route with ${airportToWestEnd.length} geometry points.`
);