// server/scripts/build-turf.js
//
// Draws a street-bounded turf border for every zone in data/landmarks.js
// and saves them all to data/boundaries.json, which the server sends to
// the map. Run it from the server/ folder:
//
//   npm run build-turf
//
// Run it again whenever you add a landmark or move one. It only needs the
// internet while it runs (it asks OpenStreetMap for road data); the game
// itself never calls OpenStreetMap.
//
// How a border is drawn, for each landmark:
//   1. Ask OpenStreetMap for the "big" edges near it: major roads,
//      railroad tracks, and shorelines/water.
//   2. Stand on the landmark and look out in 240 directions (every 1.5°).
//      In each direction, walk outward until the first thing that stops
//      you:
//        - a major road, railroad, or shoreline  -> the turf ends there
//        - the halfway line to a nearby landmark -> two zones share a border
//        - 0.5 miles                             -> the maximum size
//   3. Join up those 240 stopping points into one outline, and tidy it so
//      straight stretches of road become a few points instead of dozens.
//
// Roads that run right past the landmark (closer than IGNORE_NEAR_M) are
// skipped — otherwise a landmark sitting on a road, like Park Circle,
// would get a sliver-thin zone that ends at its own front curb.

const fs = require("fs");
const path = require("path");
const LANDMARKS = require("../data/landmarks");

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const MAX_RADIUS_M = 805; // 0.5 miles
const SEARCH_RADIUS_M = 950; // how far around each landmark to fetch roads
const IGNORE_NEAR_M = 150; // roads closer than this to the landmark don't count
const MIN_RADIUS_M = 120; // never let a direction stop closer than this
const RAY_COUNT = 240;
const SIMPLIFY_M = 6; // straight-line tolerance when tidying the outline

// Which OpenStreetMap roads count as "big roads" that end a turf. These
// are the arterials (highways and main roads). Add "|tertiary" inside the
// brackets if you want smaller zones cut by collector streets too.
const MAJOR_ROADS = "^(motorway|trunk|primary|secondary)$";

// The main server is tried twice as often as the backup mirror, since
// it's usually the faster of the two.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

const OUTPUT_FILE = path.join(__dirname, "..", "data", "boundaries.json");

// ---------------------------------------------------------------------------
// Flat-map math (meters around one landmark)
// ---------------------------------------------------------------------------
// Over a mile or so, the earth is flat enough to treat latitude/longitude
// as x/y in meters. Every landmark gets its own little flat map centered
// on itself: x = meters east, y = meters north.

const M_PER_DEG_LAT = 110540;
const mPerDegLng = (lat) => 111320 * Math.cos((lat * Math.PI) / 180);

function toMeters([lat, lng], [originLat, originLng]) {
  return [(lng - originLng) * mPerDegLng(originLat), (lat - originLat) * M_PER_DEG_LAT];
}

function toLatLng([x, y], [originLat, originLng]) {
  return [originLat + y / M_PER_DEG_LAT, originLng + x / mPerDegLng(originLat)];
}

// Distance from the origin (0,0) to the closest point on segment a-b.
function distanceToSegment([ax, ay], [bx, by]) {
  const dx = bx - ax;
  const dy = by - ay;
  const lengthSq = dx * dx + dy * dy;
  const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSq));
  return Math.hypot(ax + t * dx, ay + t * dy);
}

// Walking from the origin in direction (ux, uy), how far until we cross
// segment a-b? Returns Infinity if we never do.
function rayHitsSegment(ux, uy, [ax, ay], [bx, by]) {
  const ex = bx - ax;
  const ey = by - ay;
  const denom = ux * ey - uy * ex;
  if (Math.abs(denom) < 1e-12) return Infinity; // parallel
  const t = (ax * ey - ay * ex) / denom; // distance along the ray
  const s = (ax * uy - ay * ux) / denom; // position along the segment (0..1)
  return t > 0 && s >= 0 && s <= 1 ? t : Infinity;
}

// Douglas–Peucker: drop points that sit on (nearly) straight stretches.
function simplify(points, tolerance) {
  if (points.length < 3) return points;
  const keep = new Array(points.length).fill(false);
  keep[0] = keep[points.length - 1] = true;
  const stack = [[0, points.length - 1]];
  while (stack.length) {
    const [first, last] = stack.pop();
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const [px, py] = points[i];
      const d = distanceToSegment(
        [points[first][0] - px, points[first][1] - py],
        [points[last][0] - px, points[last][1] - py]
      );
      if (d > maxDist) {
        maxDist = d;
        index = i;
      }
    }
    if (maxDist > tolerance) {
      keep[index] = true;
      stack.push([first, index], [index, last]);
    }
  }
  return points.filter((_, i) => keep[i]);
}

// ---------------------------------------------------------------------------
// The border for one landmark
// ---------------------------------------------------------------------------

// barriers:  { kind: "road" | "rail" | "water", line: [[lat,lng], ...] }[]
// neighbors: the other landmarks (only nearby ones matter)
// Returns the outline as [[lat, lng], ...].
function buildBoundary(landmark, barriers, neighbors) {
  const origin = landmark.coords;

  // Every barrier becomes a list of flat segments. Roads and railroads
  // that pass right by the landmark are skipped (see IGNORE_NEAR_M above).
  const segments = [];
  for (const barrier of barriers) {
    const pts = barrier.line.map((p) => toMeters(p, origin));
    const segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push([pts[i], pts[i + 1]]);
    if (barrier.kind !== "water") {
      const closest = Math.min(...segs.map(([a, b]) => distanceToSegment(a, b)));
      if (closest < IGNORE_NEAR_M) continue;
    }
    segments.push(...segs);
  }

  // Nearby landmarks: the "halfway line" between two landmarks is where
  // their turf meets, so neither zone overlaps the other.
  const others = neighbors
    .filter((n) => n.id !== landmark.id)
    .map((n) => toMeters(n.coords, origin))
    .filter(([x, y]) => Math.hypot(x, y) < MAX_RADIUS_M * 2);

  const outline = [];
  for (let i = 0; i < RAY_COUNT; i++) {
    const angle = (i / RAY_COUNT) * 2 * Math.PI;
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    let reach = MAX_RADIUS_M;

    for (const [a, b] of segments) {
      reach = Math.min(reach, rayHitsSegment(ux, uy, a, b));
    }

    for (const [nx, ny] of others) {
      const along = ux * nx + uy * ny;
      if (along > 0) reach = Math.min(reach, (nx * nx + ny * ny) / 2 / along);
    }

    reach = Math.max(reach, MIN_RADIUS_M);
    outline.push([ux * reach, uy * reach]);
  }

  // Close the loop for simplifying, then drop the duplicate end point.
  const tidy = simplify([...outline, outline[0]], SIMPLIFY_M).slice(0, -1);
  return tidy.map((p) => toLatLng(p, origin).map((n) => Number(n.toFixed(6))));
}

// ---------------------------------------------------------------------------
// Fetching road data from OpenStreetMap (Overpass API)
// ---------------------------------------------------------------------------

function overpassQuery([lat, lng]) {
  const around = `around:${SEARCH_RADIUS_M},${lat},${lng}`;
  // Only send back the parts of each road/shoreline inside this box.
  // Without it, a zone next to a big river downloads the ENTIRE river's
  // outline, which is huge and can take minutes.
  const dLat = SEARCH_RADIUS_M / M_PER_DEG_LAT;
  const dLng = SEARCH_RADIUS_M / mPerDegLng(lat);
  const box = [lat - dLat, lng - dLng, lat + dLat, lng + dLng].map((n) => n.toFixed(6)).join(",");
  return `
    [out:json][timeout:60];
    (
      way(${around})["highway"~"${MAJOR_ROADS}"];
      way(${around})["railway"="rail"];
      way(${around})["natural"~"^(water|coastline)$"];
      way(${around})["waterway"="riverbank"];
      relation(${around})["natural"="water"];
    );
    out geom(${box});
  `;
}

function kindOf(tags = {}) {
  if (tags.highway) return "road";
  if (tags.railway) return "rail";
  return "water";
}

// Splits a geometry list into unbroken pieces. Because we ask for only the
// part inside a box, points outside it can come back empty (null), which
// breaks a line into separate stretches.
function pieces(geometry) {
  const result = [];
  let current = [];
  for (const g of geometry || []) {
    if (g && typeof g.lat === "number") {
      current.push([g.lat, g.lon]);
    } else {
      if (current.length >= 2) result.push(current);
      current = [];
    }
  }
  if (current.length >= 2) result.push(current);
  return result;
}

// Turns Overpass's JSON into the simple barrier list buildBoundary wants.
function toBarriers(osm) {
  const barriers = [];
  for (const el of osm.elements || []) {
    if (el.type === "way") {
      for (const line of pieces(el.geometry)) barriers.push({ kind: kindOf(el.tags), line });
    } else if (el.type === "relation" && el.members) {
      for (const member of el.members) {
        for (const line of pieces(member.geometry)) barriers.push({ kind: "water", line });
      }
    }
  }
  return barriers;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Asks Overpass, retrying politely: it's a free shared service and will
// say "too busy" (429/504) sometimes.
async function fetchBarriers(coords) {
  const body = "data=" + encodeURIComponent(overpassQuery(coords));
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    const url = OVERPASS_URLS[attempt % OVERPASS_URLS.length];
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Vantage turf builder (personal portfolio project)",
        },
        body,
        signal: AbortSignal.timeout(75000), // give up on a stuck request
      });
      if (response.ok) return toBarriers(await response.json());
      lastError = new Error(`Overpass said ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    console.log(`   ...busy or slow (${lastError.message}), retrying in ${3 * (attempt + 1)}s`);
    await sleep(3000 * (attempt + 1));
  }
  throw lastError;
}

// ---------------------------------------------------------------------------
// Run it
// ---------------------------------------------------------------------------

async function main() {
  // Keep any borders already built, so one failed fetch doesn't wipe the rest.
  let boundaries = {};
  if (fs.existsSync(OUTPUT_FILE)) {
    boundaries = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
  }

  const only = process.argv[2]; // optional: build just one zone by id
  const targets = only ? LANDMARKS.filter((l) => l.id === only) : LANDMARKS;
  if (only && targets.length === 0) {
    console.error(`No landmark with id "${only}" in data/landmarks.js`);
    process.exit(1);
  }

  let failed = 0;
  for (const [i, landmark] of targets.entries()) {
    const label = `[${i + 1}/${targets.length}] ${landmark.name}`;
    console.log(`${label} — fetching roads...`);
    try {
      const barriers = await fetchBarriers(landmark.coords);
      boundaries[landmark.id] = buildBoundary(landmark, barriers, LANDMARKS);
      console.log(`${label} — ${barriers.length} roads/edges, ${boundaries[landmark.id].length} points`);
    } catch (err) {
      failed++;
      console.log(`${label} — FAILED (${err.message}), keeping its old border if it had one`);
    }
    // Save after every zone, so stopping halfway still keeps progress.
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(boundaries, null, 0) + "\n");
    if (i < targets.length - 1) await sleep(1500); // be polite to the free API
  }

  console.log(
    failed
      ? `\nDone with ${failed} failure(s). Run it again later to retry those.`
      : `\nDone. Saved ${Object.keys(boundaries).length} borders to data/boundaries.json.`
  );
  console.log("Restart the server (Ctrl + C, then npm start) to see them on the map.");
}

// Only run when called from the command line, so the test can borrow
// buildBoundary without hitting the internet.
if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = { buildBoundary, toBarriers };
