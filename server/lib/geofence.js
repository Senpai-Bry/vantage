// server/lib/geofence.js
//
// "Is this player standing inside this zone?" — the check that makes turf
// borders real game rules. A photo only counts if it was submitted from
// inside the zone's border (data/boundaries.json, made by
// scripts/build-turf.js). Zones without a border yet fall back to "within
// half a mile of the landmark".
//
// Honest caveat: the location comes from the player's phone, so a
// determined cheater can fake it (just like in any location-based game).
// This keeps honest players honest; it isn't bulletproof anti-cheat.

let BOUNDARIES = {};
try {
  BOUNDARIES = require("../data/boundaries.json");
} catch (_) {
  console.log('No data/boundaries.json yet — run "npm run build-turf" to draw turf borders.');
}

const FALLBACK_RADIUS_M = 805; // 0.5 miles, for zones without a border
// Phone GPS is only accurate to within a few meters to a few dozen meters,
// so someone standing right on the border still counts.
const GRACE_M = 30;

function boundaryFor(zoneId) {
  return BOUNDARIES[zoneId] || null;
}

// Over a few miles the earth is flat enough to treat lat/lng as x/y in
// meters around one reference point.
function toMeters([lat, lng], [refLat, refLng]) {
  return [
    (lng - refLng) * 111320 * Math.cos((refLat * Math.PI) / 180),
    (lat - refLat) * 110540,
  ];
}

// Classic "ray casting" test: walk right from the point and count how many
// border edges you cross. Odd = inside, even = outside.
function pointInPolygon([x, y], polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    const crosses = yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

// Shortest distance (meters) from the point to the border line.
function distanceToEdge([x, y], polygon) {
  let best = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [ax, ay] = polygon[j];
    const [bx, by] = polygon[i];
    const dx = bx - ax;
    const dy = by - ay;
    const lengthSq = dx * dx + dy * dy;
    const t = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / lengthSq));
    best = Math.min(best, Math.hypot(x - (ax + t * dx), y - (ay + t * dy)));
  }
  return best;
}

// Returns { inside: boolean, distanceM: number }. distanceM is how far
// outside the zone the player is (0 when inside).
//   zone     - a zone row from the database ({ id, lat, lng, ... })
//   position - [lat, lng] the player's phone reported
function checkPosition(zone, position) {
  const landmark = [zone.lat, zone.lng];
  const point = toMeters(position, landmark);
  const boundary = boundaryFor(zone.id);

  if (!boundary) {
    const away = Math.max(0, Math.hypot(point[0], point[1]) - FALLBACK_RADIUS_M);
    return { inside: away <= GRACE_M, distanceM: away };
  }

  const polygon = boundary.map((p) => toMeters(p, landmark));
  if (pointInPolygon(point, polygon)) return { inside: true, distanceM: 0 };
  const away = distanceToEdge(point, polygon);
  return { inside: away <= GRACE_M, distanceM: away };
}

// "about 1.2 miles" / "about 300 feet" for error messages.
function describeDistance(meters) {
  const feet = meters * 3.28084;
  if (feet < 1000) return `about ${Math.round(feet / 50) * 50 || 50} feet`;
  return `about ${(meters / 1609.34).toFixed(1)} miles`;
}

module.exports = { boundaryFor, checkPosition, describeDistance };
