// server/scripts/build-turf.js
//
// Draws every zone's turf border out of real city blocks, and saves them
// all to data/boundaries.json (which the server sends to the map).
//
//   npm run fetch-osm     # once: download the street maps (needs internet)
//   npm run build-turf    # draw the borders from those maps (offline, fast)
//
// How a zone's border is made:
//   1. Load the street map around the landmark (from data/osm-cache/).
//   2. Cut the map into blocks: every area fully surrounded by streets,
//      railroad tracks or shoreline becomes one block.
//   3. A block joins a zone if its middle is within 0.5 miles of that
//      zone's landmark AND that landmark is the closest one to it. That
//      "closest landmark wins" rule is what makes nearby zones share a
//      border along a street instead of overlapping.
//   4. Glue the zone's blocks into one shape, cut out any water, and tidy
//      the outline.
// Every edge of the result runs along a real street, track or shoreline.

const fs = require("fs");
const path = require("path");
const LANDMARKS = require("../data/landmarks");

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

const ZONE_RADIUS_M = 805; // 0.5 miles: how far a block's middle may be
const MAX_BLOCK_REACH_M = 1300; // blocks reaching further than this are too big to use whole
const SIMPLIFY_M = 10; // straight-line tolerance when tidying the outline (also calms wiggly creek edges)
// Big roads end turf: a zone stays on its landmark's side of the major
// roads, railroad tracks and water around it. If that leaves a zone too
// small (a landmark squeezed against a highway), it's allowed to cross.
const MAJOR_ROADS = /^(motorway|trunk|primary|secondary)(_link)?$/;
const MIN_ZONE_AREA_M2 = 200000; // about 0.08 square miles
const FENCE_M = 1350; // just inside the 1400 m area fetch-osm downloads
// Slivers thinner than this (the strip between two lanes of a divided
// highway, a long thin tail along a road) get trimmed off a zone.
const MIN_WIDTH_M = 50;
const IGNORE_NEAR_M = 60;
// A block must have at least this much street along its edge. Areas
// bounded only by shoreline (the middle of a river, a marsh) don't count.
const MIN_STREET_EDGE_M = 40;
// When an oversized block gets trimmed to its streets, keep this much
// ground around them.
const STREET_PADDING_M = 100;
const MIN_TRIM_AREA_M2 = 20000; // trimmed pieces smaller than this are dropped // a big road this close to the landmark is "its" road, not a limit

const CACHE_DIR = path.join(__dirname, "..", "data", "osm-cache");
const OUTPUT_FILE = path.join(__dirname, "..", "data", "boundaries.json");

// ---------------------------------------------------------------------------
// The geometry library (JSTS) — it does the heavy lifting: cutting the
// street map into blocks, gluing blocks together, cutting out water.
// Its package file is set up for browsers, so we load its bundle directly.
// ---------------------------------------------------------------------------

function loadJsts() {
  const file = path.join(__dirname, "..", "node_modules", "jsts", "dist", "jsts.min.js");
  if (!fs.existsSync(file)) {
    console.error('Missing the "jsts" package. Run "npm install" in the server folder first.');
    process.exit(1);
  }
  const mod = { exports: {} };
  new Function("exports", "module", fs.readFileSync(file, "utf8"))(mod.exports, mod);
  return mod.exports;
}

const jsts = loadJsts();
const factory = new jsts.geom.GeometryFactory();
const { UnaryUnionOp } = jsts.operation.union;
const { Polygonizer } = jsts.operation.polygonize;
const { TopologyPreservingSimplifier } = jsts.simplify;

// ---------------------------------------------------------------------------
// Flat-map math
// ---------------------------------------------------------------------------
// The geometry library works on flat x/y, so every lat/lng is turned into
// meters east (x) / north (y) of one shared point. All zones use the SAME
// point, so a block looks identical from both sides of a shared border.

const ORIGIN_LAT = LANDMARKS.reduce((sum, l) => sum + l.coords[0], 0) / LANDMARKS.length;
const ORIGIN_LNG = LANDMARKS.reduce((sum, l) => sum + l.coords[1], 0) / LANDMARKS.length;
const M_PER_DEG_LAT = 110540;
const M_PER_DEG_LNG = 111320 * Math.cos((ORIGIN_LAT * Math.PI) / 180);

const toXY = ([lat, lng]) => [(lng - ORIGIN_LNG) * M_PER_DEG_LNG, (lat - ORIGIN_LAT) * M_PER_DEG_LAT];
const toLatLng = (x, y) => [
  Number((ORIGIN_LAT + y / M_PER_DEG_LAT).toFixed(6)),
  Number((ORIGIN_LNG + x / M_PER_DEG_LNG).toFixed(6)),
];
const coord = ([lat, lng]) => {
  const [x, y] = toXY([lat, lng]);
  return new jsts.geom.Coordinate(x, y);
};

// ---------------------------------------------------------------------------
// Reading the downloaded street map
// ---------------------------------------------------------------------------

// Splits an OpenStreetMap geometry list into unbroken stretches (points
// outside the download box come back empty, which breaks a line).
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

// Returns { edges, majorEdges, water } for one zone's map:
//   edges      - every street, track and shoreline (these make the blocks)
//   majorEdges - just the big roads, tracks and shorelines (turf limits)
//   water      - lakes / rivers / harbor as shapes, to cut out of zones
function readMap(osm) {
  const edges = [];
  const majorEdges = [];
  const streetEdges = [];
  const water = [];

  const addEdge = (line, major) => {
    if (line.length < 2) return;
    const ls = factory.createLineString(line.map(coord));
    edges.push(ls);
    if (major) majorEdges.push(ls);
  };
  const addWater = (line) => {
    const closed =
      line.length >= 4 && line[0][0] === line[line.length - 1][0] && line[0][1] === line[line.length - 1][1];
    if (closed) {
      const ring = factory.createLinearRing(line.map(coord));
      const poly = factory.createPolygon(ring);
      if (poly.isValid()) water.push(poly);
    }
  };

  for (const el of osm.elements || []) {
    if (el.type === "way") {
      const tags = el.tags || {};
      const isWater = !tags.highway && !tags.railway;
      const major = isWater || Boolean(tags.railway) || MAJOR_ROADS.test(tags.highway || "");
      for (const line of pieces(el.geometry)) {
        addEdge(line, major); // streets, tracks AND shorelines all split blocks
        if (tags.highway) streetEdges.push(factory.createLineString(line.map(coord)));
        if (isWater) addWater(line);
      }
    } else if (el.type === "relation") {
      for (const member of el.members || []) {
        for (const line of pieces(member.geometry)) {
          addEdge(line, true);
          if (member.role === "outer") addWater(line);
        }
      }
    }
  }
  return { edges, majorEdges, streetEdges, water };
}

// ---------------------------------------------------------------------------
// Building one zone
// ---------------------------------------------------------------------------

// Who owns a block: the landmark standing inside it, if there is one
// (a landmark always keeps the block it sits in), otherwise the landmark
// closest to the block's middle.
function ownerOf(block, center) {
  const inside = LANDMARKS.filter((l) => {
    const [x, y] = toXY(l.coords);
    // Strictly inside: a landmark sitting ON a street touches the blocks
    // on both sides, and shouldn't claim them all.
    return block.contains(factory.createPoint(new jsts.geom.Coordinate(x, y)));
  });
  if (inside.length === 1) return inside[0].id;
  if (inside.length > 1) {
    return inside.sort((a, b) => {
      const [ax, ay] = toXY(a.coords);
      const [bx, by] = toXY(b.coords);
      return Math.hypot(ax - center.x, ay - center.y) - Math.hypot(bx - center.x, by - center.y);
    })[0].id;
  }
  return nearestLandmarkId(center.x, center.y);
}

function nearestLandmarkId(x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const l of LANDMARKS) {
    const [lx, ly] = toXY(l.coords);
    const d = Math.hypot(x - lx, y - ly);
    if (d < bestDist) {
      bestDist = d;
      best = l.id;
    }
  }
  return best;
}

// The farthest any corner of a block sits from the landmark.
function reachOf(block, lx, ly) {
  let max = 0;
  for (const c of block.getExteriorRing().getCoordinates()) {
    max = Math.max(max, Math.hypot(c.x - lx, c.y - ly));
  }
  return max;
}

// Keeps only the outer edge of a shape (fills in any holes), and if it's in
// several pieces, keeps the piece the landmark is in (or else the biggest).
function mainOutline(geometry, landmarkPoint) {
  const parts = [];
  for (let i = 0; i < geometry.getNumGeometries(); i++) {
    const part = geometry.getGeometryN(i);
    if (part.getGeometryType() === "Polygon" && !part.isEmpty()) {
      parts.push(factory.createPolygon(part.getExteriorRing().getCoordinates()));
    }
  }
  if (parts.length === 0) return null;
  const containing = parts.find((p) => p.distance(landmarkPoint) < 1);
  return containing || parts.sort((a, b) => b.getArea() - a.getArea())[0];
}

// Cuts a set of lines into the closed areas between them.
function toFaces(lines) {
  if (lines.length === 0) return [];
  const noded = UnaryUnionOp.union(factory.createMultiLineString(lines));
  const polygonizer = new Polygonizer();
  polygonizer.add(noded);
  return polygonizer.getPolygons().toArray();
}

function buildZone(landmark, osm) {
  const [lx, ly] = toXY(landmark.coords);
  const landmarkPoint = factory.createPoint(new jsts.geom.Coordinate(lx, ly));
  const { edges, majorEdges, streetEdges, water } = readMap(osm);
  const streets = factory.createMultiLineString(streetEdges);
  // How many meters of a block's edge run along a street.
  const streetFrontage = (block) => {
    const edge = block.getExteriorRing();
    if (!edge.getEnvelopeInternal().intersects(streets.getEnvelopeInternal())) return 0;
    return edge.intersection(streets.buffer(2, 2)).getLength();
  };
  if (edges.length === 0) throw new Error("no streets in the downloaded map");

  // Draw a square fence just inside the edge of the downloaded map, so
  // areas that open out into the countryside still become closed shapes.
  const f = FENCE_M;
  const fence = factory.createLineString(
    [[-f, -f], [f, -f], [f, f], [-f, f], [-f, -f]].map(([dx, dy]) => new jsts.geom.Coordinate(lx + dx, ly + dy))
  );
  edges.push(fence);
  majorEdges.push(fence);

  // 1. Cut the map into blocks. Merging all the lines first makes every
  //    crossing a proper corner, so the block-finder sees closed shapes.
  const blocks = toFaces(edges);

  // The landmark's "home turf": the area enclosed by the big roads,
  // tracks and water around it. (If it sits right on a big road, both
  // sides count.) If the big roads don't fully enclose it, no limit.
  const homeAreas = toFaces(majorEdges).filter((face) => face.distance(landmarkPoint) < 1);
  const homeTurf = homeAreas.length ? UnaryUnionOp.union(factory.createGeometryCollection(homeAreas)) : null;

  // When the big roads don't fully enclose the landmark, use a simpler
  // test: a block is across a big road if the straight line from the
  // landmark to it crosses one (ignoring a road the landmark sits on).
  const bigRoads = factory.createMultiLineString(majorEdges);
  const acrossBigRoad = (center) => {
    const sightLine = factory.createLineString([new jsts.geom.Coordinate(lx, ly), center]);
    if (!sightLine.getEnvelopeInternal().intersects(bigRoads.getEnvelopeInternal())) return false;
    const hits = sightLine.intersection(bigRoads);
    for (const c of hits.getCoordinates()) {
      if (Math.hypot(c.x - lx, c.y - ly) > IGNORE_NEAR_M) return true;
    }
    return false;
  };

  // 2. Pick this zone's blocks.
  const pick = (stayInsideBigRoads) => {
    const mine = [];
    const bigNeighbors = [];
    let homeBlock = null; // the block the landmark itself sits in
    for (const block of blocks) {
      if (!block.isValid() || block.getArea() < 1) continue;
      const centerPoint = block.getInteriorPoint();
      const center = centerPoint.getCoordinate();
      const closeEnough = Math.hypot(center.x - lx, center.y - ly) <= ZONE_RADIUS_M;
      const ours = ownerOf(block, center) === landmark.id;
      const notHuge = reachOf(block, lx, ly) <= MAX_BLOCK_REACH_M;
      const sameSide =
        !stayInsideBigRoads || ((!homeTurf || homeTurf.contains(centerPoint)) && !acrossBigRoad(center));

      if (block.distance(landmarkPoint) < 1 && (!homeBlock || block.getArea() < homeBlock.getArea())) {
        homeBlock = block;
      }
      if (closeEnough && ours && notHuge && sameSide && streetFrontage(block) >= MIN_STREET_EDGE_M) {
        mine.push(block);
      } else if (!notHuge && block !== homeBlock && block.distance(landmarkPoint) <= ZONE_RADIUS_M) {
        // An oversized block next door (e.g. a neighborhood of dead-end
        // streets, which never closes into small blocks): use the part of
        // it around its streets, if that part is ours and on our side.
        bigNeighbors.push(block);
      }
    }

    for (const block of bigNeighbors) {
      if (block === homeBlock) continue;
      const part = trimBigBlock(block, false);
      if (!part || part.isEmpty()) continue;
      const centerPoint = part.getInteriorPoint();
      const center = centerPoint.getCoordinate();
      const sameSide =
        !stayInsideBigRoads || ((!homeTurf || homeTurf.contains(centerPoint)) && !acrossBigRoad(center));
      if (Math.hypot(center.x - lx, center.y - ly) <= ZONE_RADIUS_M && sameSide) mine.push(part);
    }

    // A landmark out in the country can sit in one enormous "block" (a
    // plantation, a military base). Always include its own block; if it's
    // too big to use whole, keep just the part around the streets inside
    // it (the developed part), rather than an arbitrary circle.
    if (homeBlock && !mine.includes(homeBlock)) {
      mine.push(reachOf(homeBlock, lx, ly) > MAX_BLOCK_REACH_M ? trimBigBlock(homeBlock, true) : homeBlock);
    }
    return mine;
  };

  // The ground closer to this landmark than to any other one. Used to
  // split oversized blocks fairly between neighboring zones.
  let myGround = landmarkPoint.buffer(FENCE_M * 2, 4);
  for (const other of LANDMARKS) {
    if (other.id === landmark.id) continue;
    const [ox, oy] = toXY(other.coords);
    const d = Math.hypot(ox - lx, oy - ly);
    if (d > ZONE_RADIUS_M * 3) continue;
    // A big square on our side of the halfway line between the two.
    const ux = (ox - lx) / d;
    const uy = (oy - ly) / d;
    const mx = (lx + ox) / 2;
    const my = (ly + oy) / 2;
    const big = FENCE_M * 4;
    const corners = [
      [mx + -uy * big, my + ux * big],
      [mx - -uy * big, my - ux * big],
      [mx - -uy * big - ux * big, my - ux * big - uy * big],
      [mx + -uy * big - ux * big, my + ux * big - uy * big],
    ];
    const half = factory.createPolygon(
      [...corners, corners[0]].map(([x, y]) => new jsts.geom.Coordinate(x, y))
    );
    myGround = myGround.intersection(half);
  }

  // Shrinks an oversized block (a plantation, a base, a marsh-edge
  // subdivision) to the part its own streets cover: the outline wrapped
  // around the streets inside it near this landmark, plus a little room.
  function trimBigBlock(block, isHome) {
    const reach = landmarkPoint.buffer(ZONE_RADIUS_M, 24).intersection(myGround);
    let inner = streets.intersection(block.buffer(-1)).intersection(reach);
    // The landmark's own block always wraps around the landmark too.
    if (isHome) inner = inner.isEmpty() ? landmarkPoint : inner.union(landmarkPoint);
    if (inner.isEmpty()) return null;

    const hull = inner.convexHull();
    // Grow the padding until the piece is a sensible size (the landmark's
    // own block must make a real zone; a neighbor's piece just needs to
    // be more than a sliver).
    const minArea = isHome ? MIN_ZONE_AREA_M2 : MIN_TRIM_AREA_M2;
    for (const padding of [STREET_PADDING_M, STREET_PADDING_M * 2, STREET_PADDING_M * 3.5]) {
      const trimmed = block.intersection(hull.buffer(padding, 2)).intersection(myGround);
      if (trimmed.getArea() >= minArea) return trimmed;
    }
    return isHome ? block.intersection(reach) : null;
  }

  let mine = pick(true);
  const area = mine.reduce((sum, b) => sum + b.getArea(), 0);
  if (area < MIN_ZONE_AREA_M2) mine = pick(false); // too squeezed: let it cross
  if (mine.length === 0) throw new Error("no blocks found around the landmark");

  // 3. Glue the blocks into one zone, cut out water, tidy.
  let zone = UnaryUnionOp.union(factory.createGeometryCollection(mine)).buffer(0);
  for (const lake of water) {
    if (zone.intersects(lake)) zone = zone.difference(lake);
  }
  zone = mainOutline(zone, landmarkPoint);
  if (!zone) throw new Error("the zone came out empty");
  // Shrink then re-grow by half the minimum width: anything thinner than
  // that disappears, everything else comes back to its original edges.
  const opened = mainOutline(zone.buffer(-MIN_WIDTH_M / 2, 4).buffer(MIN_WIDTH_M / 2, 4), landmarkPoint);
  if (opened && opened.getArea() > zone.getArea() * 0.5) zone = opened;
  zone = TopologyPreservingSimplifier.simplify(zone, SIMPLIFY_M);

  const ring = zone.getExteriorRing().getCoordinates();
  // Leaflet closes the shape itself, so drop the repeated last point.
  return ring.slice(0, -1).map((c) => toLatLng(c.x, c.y));
}

// Tidying each zone's outline can nudge a shared border by a few meters,
// leaving tiny slivers where two neighbors overlap. Give each sliver to
// whichever of the two landmarks is closer to it.
function removeOverlaps(boundaries) {
  const toPolygon = (outline) => {
    const ring = outline.map((p) => coord(p));
    ring.push(ring[0]);
    return factory.createPolygon(ring).buffer(0);
  };
  const ids = Object.keys(boundaries);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      const a = toPolygon(boundaries[ids[i]]);
      const b = toPolygon(boundaries[ids[j]]);
      if (!a.getEnvelopeInternal().intersects(b.getEnvelopeInternal())) continue;
      const overlap = a.intersection(b);
      if (overlap.getArea() < 1) continue;

      const c = overlap.getCentroid().getCoordinate();
      const dist = (id) => {
        const [x, y] = toXY(LANDMARKS.find((l) => l.id === id).coords);
        return Math.hypot(x - c.x, y - c.y);
      };
      const loser = dist(ids[i]) <= dist(ids[j]) ? ids[j] : ids[i];
      const loserLandmark = LANDMARKS.find((l) => l.id === loser);
      const [lx, ly] = toXY(loserLandmark.coords);
      const trimmed = mainOutline(
        (loser === ids[i] ? a : b).difference(overlap.buffer(0.5)),
        factory.createPoint(new jsts.geom.Coordinate(lx, ly))
      );
      if (trimmed) {
        boundaries[loser] = trimmed.getExteriorRing().getCoordinates().slice(0, -1).map((k) => toLatLng(k.x, k.y));
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Run it
// ---------------------------------------------------------------------------

function main() {
  const only = process.argv[2]; // optional: build just one zone by id
  const targets = only ? LANDMARKS.filter((l) => l.id === only) : LANDMARKS;
  if (only && targets.length === 0) {
    console.error(`No landmark with id "${only}" in data/landmarks.js`);
    process.exit(1);
  }

  let boundaries = {};
  if (only && fs.existsSync(OUTPUT_FILE)) {
    boundaries = JSON.parse(fs.readFileSync(OUTPUT_FILE, "utf8"));
  }

  let failed = 0;
  for (const [i, landmark] of targets.entries()) {
    const label = `[${i + 1}/${targets.length}] ${landmark.name}`;
    const file = path.join(CACHE_DIR, `${landmark.id}.json`);
    if (!fs.existsSync(file)) {
      failed++;
      console.log(`${label} — no street map yet. Run "npm run fetch-osm" first.`);
      continue;
    }
    try {
      const osm = JSON.parse(fs.readFileSync(file, "utf8"));
      boundaries[landmark.id] = buildZone(landmark, osm);
      console.log(`${label} — ${boundaries[landmark.id].length} points`);
    } catch (err) {
      failed++;
      console.log(`${label} — FAILED (${err.message})`);
    }
  }

  removeOverlaps(boundaries);
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(boundaries) + "\n");
  console.log(
    failed
      ? `\nSaved ${Object.keys(boundaries).length} borders, ${failed} zone(s) failed (see above).`
      : `\nDone. Saved ${Object.keys(boundaries).length} borders to data/boundaries.json.`
  );
  console.log("Restart the server (Ctrl + C, then npm start) to see them on the map.");
}

if (require.main === module) main();

module.exports = { buildZone };
