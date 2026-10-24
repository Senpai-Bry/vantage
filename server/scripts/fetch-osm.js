// server/scripts/fetch-osm.js
//
// Downloads the street map around every landmark from OpenStreetMap and
// saves it to data/osm-cache/<zone-id>.json. scripts/build-turf.js then
// draws the turf borders from those files — so the borders can be rebuilt
// and tweaked as often as you like without hitting the internet again.
//
//   npm run fetch-osm                 # every zone that isn't cached yet
//   npm run fetch-osm -- park-circle  # just one zone (re-downloads it)
//   npm run fetch-osm -- --all        # re-download everything
//
// What it downloads, within about 0.9 miles of each landmark:
//   - every drivable street (highways down to neighborhood streets)
//   - railroad tracks
//   - water: lakes, rivers, the harbor, shorelines

const fs = require("fs");
const path = require("path");
const LANDMARKS = require("../data/landmarks");

const SEARCH_RADIUS_M = 1400;
const CACHE_DIR = path.join(__dirname, "..", "data", "osm-cache");

const STREETS =
  "^(motorway|trunk|primary|secondary|tertiary|unclassified|residential|living_street|" +
  "motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$";

// The main server is tried twice as often as the backup mirror.
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass-api.de/api/interpreter",
  "https://overpass.kumi.systems/api/interpreter",
];

function query([lat, lng]) {
  const around = `around:${SEARCH_RADIUS_M},${lat},${lng}`;
  // Only return the part of each street/shoreline inside this box, so a
  // zone by the river doesn't download the entire river.
  const dLat = SEARCH_RADIUS_M / 110540;
  const dLng = SEARCH_RADIUS_M / (111320 * Math.cos((lat * Math.PI) / 180));
  const box = [lat - dLat, lng - dLng, lat + dLat, lng + dLng].map((n) => n.toFixed(6)).join(",");
  return `
    [out:json][timeout:90];
    (
      way(${around})["highway"~"${STREETS}"];
      way(${around})["railway"="rail"];
      way(${around})["natural"~"^(water|coastline)$"];
      way(${around})["waterway"="riverbank"];
    );
    out geom(${box});
    // Big rivers and the harbor are stored as one giant shape. Asking for
    // the whole thing is very slow, so instead ask for just its pieces
    // that fall inside this zone's box.
    relation(${around})["natural"="water"]->.rivers;
    way(r.rivers)(${box});
    out geom(${box});
  `;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function download(coords) {
  const body = "data=" + encodeURIComponent(query(coords));
  let lastError;
  for (let attempt = 0; attempt < 8; attempt++) {
    const url = OVERPASS_URLS[attempt % OVERPASS_URLS.length];
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": "Vantage turf builder (personal portfolio project)",
        },
        body,
        signal: AbortSignal.timeout(120000),
      });
      if (response.ok) return await response.text();
      lastError = new Error(`Overpass said ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    console.log(`   ...busy or slow (${lastError.message}), retrying in ${3 * (attempt + 1)}s`);
    await sleep(3000 * (attempt + 1));
  }
  throw lastError;
}

async function main() {
  fs.mkdirSync(CACHE_DIR, { recursive: true });

  const arg = process.argv[2];
  const refreshAll = arg === "--all";
  const only = arg && !refreshAll ? arg : null;
  const targets = only ? LANDMARKS.filter((l) => l.id === only) : LANDMARKS;
  if (only && targets.length === 0) {
    console.error(`No landmark with id "${only}" in data/landmarks.js`);
    process.exit(1);
  }

  let failed = 0;
  for (const [i, landmark] of targets.entries()) {
    const label = `[${i + 1}/${targets.length}] ${landmark.name}`;
    const file = path.join(CACHE_DIR, `${landmark.id}.json`);
    if (!only && !refreshAll && fs.existsSync(file)) {
      console.log(`${label} — already downloaded, skipping`);
      continue;
    }
    console.log(`${label} — downloading streets...`);
    try {
      const text = await download(landmark.coords);
      fs.writeFileSync(file, text);
      console.log(`${label} — saved (${Math.round(text.length / 1024)} KB)`);
    } catch (err) {
      failed++;
      console.log(`${label} — FAILED (${err.message})`);
    }
    await sleep(1500); // be polite to the free service
  }

  console.log(
    failed
      ? `\nDone with ${failed} failure(s). Run "npm run fetch-osm" again to retry just those.`
      : "\nDone. Street maps saved to data/osm-cache/."
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
