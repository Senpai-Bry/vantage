// server/scripts/fetch-photos.js
//
// Finds a free-to-use photo of every landmark on Wikimedia Commons and saves
// it to data/landmark-photos.json. The explore feed uses these as the card
// photo for any zone nobody has shot yet; once a player's photo leads a
// zone, the card shows that instead.
//
//   npm run fetch-photos                 # every zone that has no photo yet
//   npm run fetch-photos -- park-circle  # just one zone (looks it up again)
//   npm run fetch-photos -- --all        # look every zone up again
//
// How it picks a photo, in order:
//   1. The landmark's `photo` field in data/landmarks.js, if you set one
//      (a Commons file name like "File:St James Goose Creek.jpg"). Use this
//      to swap in a better photo by hand.
//   2. The main photo on the landmark's Wikipedia article — but only if the
//      article's own map pin is near the landmark, so "Park Circle" can't
//      grab a photo of some other Park Circle.
//   3. The closest geotagged photo on Commons within 600 m of the landmark.
//
// Wikimedia photos are free to use as long as the photographer and license
// are credited, so both are saved here and shown on the card.

const fs = require("fs");
const path = require("path");
const LANDMARKS = require("../data/landmarks");

const OUT_FILE = path.join(__dirname, "..", "data", "landmark-photos.json");
const COMMONS_API = "https://commons.wikimedia.org/w/api.php";
const WIKIPEDIA_API = "https://en.wikipedia.org/w/api.php";
const THUMB_WIDTH = 960; // big enough for a card on a sharp phone screen
const ARTICLE_MAX_DISTANCE_M = 3000;
const NEARBY_RADIUS_M = 600;
// File names that are almost never a nice photo of the place itself.
const SKIP_TITLES = /\b(map|logo|seal|flag|diagram|plan|sign(age)?|plaque|marker|chart|coat of arms)\b/i;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function wikiApi(base, params) {
  const url = `${base}?${new URLSearchParams({ format: "json", formatversion: "2", ...params })}`;
  let lastError;
  for (let attempt = 0; attempt < 6; attempt++) {
    let waitMs = 3000 * (attempt + 1);
    try {
      const response = await fetch(url, {
        headers: { "User-Agent": "VantagePhotoFetcher/1.0 (personal portfolio project)" },
        signal: AbortSignal.timeout(30000),
      });
      if (response.ok) return await response.json();
      lastError = new Error(`Wikimedia said ${response.status}`);
      // 429 = "too many requests, slow down". Wikimedia usually says how
      // many seconds to wait in a Retry-After header, so wait at least that.
      if (response.status === 429) {
        const retryAfterS = Number(response.headers.get("retry-after")) || 0;
        waitMs = Math.max(waitMs * 2, retryAfterS * 1000);
      }
    } catch (err) {
      lastError = err;
    }
    console.log(`   ...Wikimedia is busy (${lastError.message}), waiting ${Math.round(waitMs / 1000)}s`);
    await sleep(waitMs);
  }
  throw lastError;
}

// Straight-line distance in meters between two [lat, lng] points.
function distanceM([lat1, lng1], [lat2, lng2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(a));
}

// Commons stores the photographer's name as HTML (often a link). Keep just
// the words.
function plainText(html) {
  return String(html || "")
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Looks up size, thumbnail URL and credit info for a list of Commons file
// titles. Returns them in the same order they were asked for.
async function fileInfo(titles) {
  if (titles.length === 0) return [];
  const data = await wikiApi(COMMONS_API, {
    action: "query",
    titles: titles.join("|"),
    prop: "imageinfo",
    iiprop: "url|size|mime|extmetadata",
    iiurlwidth: String(THUMB_WIDTH),
  });
  const byTitle = new Map((data.query?.pages || []).map((page) => [page.title, page]));
  // The API may tidy up a title (underscores to spaces, etc.) — follow that.
  for (const { from, to } of data.query?.normalized || []) {
    if (byTitle.has(to)) byTitle.set(from, byTitle.get(to));
  }

  return titles
    .map((title) => {
      const info = byTitle.get(title)?.imageinfo?.[0];
      if (!info) return null;
      const meta = info.extmetadata || {};
      return {
        title: byTitle.get(title).title,
        mime: info.mime,
        width: info.width,
        height: info.height,
        url: info.thumburl || info.url,
        pageUrl: info.descriptionurl,
        credit: plainText(meta.Artist?.value) || "Unknown photographer",
        license: plainText(meta.LicenseShortName?.value) || "See source",
      };
    })
    .filter(Boolean);
}

// Good enough for a card: a real photo (not a drawing), reasonably large,
// and wider than it is tall-ish so it fills the card without heavy cropping.
function usable(file) {
  return (
    /^image\/(jpeg|png|webp)$/.test(file.mime) &&
    file.width >= 640 &&
    file.width >= file.height * 0.8 &&
    !SKIP_TITLES.test(file.title)
  );
}

async function fromArticle(landmark) {
  const title = landmark.wikipedia || landmark.name;
  const data = await wikiApi(WIKIPEDIA_API, {
    action: "query",
    titles: title,
    redirects: "1",
    prop: "pageimages|coordinates",
    piprop: "name",
  });
  const page = data.query?.pages?.[0];
  if (!page || page.missing || !page.pageimage) return null;

  // The article has to be about this place: if it has a map pin, the pin
  // must be near the landmark. An article with no pin only counts if you
  // named it on purpose with the `wikipedia` field.
  const pin = page.coordinates?.[0];
  if (pin && distanceM(landmark.coords, [pin.lat, pin.lon]) > ARTICLE_MAX_DISTANCE_M) return null;
  if (!pin && !landmark.wikipedia) return null;

  const [file] = await fileInfo([`File:${page.pageimage}`]);
  return file && usable(file) ? { ...file, source: "wikipedia" } : null;
}

async function fromNearby(landmark) {
  const [lat, lng] = landmark.coords;
  const data = await wikiApi(COMMONS_API, {
    action: "query",
    list: "geosearch",
    gscoord: `${lat}|${lng}`,
    gsradius: String(NEARBY_RADIUS_M),
    gsnamespace: "6", // files only
    gslimit: "30",
  });
  // geosearch returns the closest first, so the first usable one wins.
  const titles = (data.query?.geosearch || []).map((hit) => hit.title).filter((t) => !SKIP_TITLES.test(t));
  for (let i = 0; i < titles.length; i += 10) {
    const files = await fileInfo(titles.slice(i, i + 10));
    const pick = files.find(usable);
    if (pick) return { ...pick, source: "nearby" };
  }
  return null;
}

async function findPhoto(landmark) {
  if (landmark.photo) {
    const [file] = await fileInfo([landmark.photo]);
    if (!file) throw new Error(`Commons has no file called "${landmark.photo}"`);
    return { ...file, source: "chosen" };
  }
  return (await fromArticle(landmark)) || (await fromNearby(landmark));
}

async function main() {
  const arg = process.argv[2];
  const refreshAll = arg === "--all";
  const only = arg && !refreshAll ? arg : null;
  const targets = only ? LANDMARKS.filter((l) => l.id === only) : LANDMARKS;
  if (only && targets.length === 0) {
    console.error(`No landmark with id "${only}" in data/landmarks.js`);
    process.exit(1);
  }

  let photos = {};
  if (fs.existsSync(OUT_FILE)) photos = JSON.parse(fs.readFileSync(OUT_FILE, "utf8"));

  let found = 0;
  let missing = 0;
  let failed = 0;
  for (const [i, landmark] of targets.entries()) {
    const label = `[${i + 1}/${targets.length}] ${landmark.name}`;
    if (!only && !refreshAll && photos[landmark.id]) {
      console.log(`${label} — already has a photo, skipping`);
      continue;
    }
    try {
      const photo = await findPhoto(landmark);
      if (photo) {
        photos[landmark.id] = {
          url: photo.url,
          pageUrl: photo.pageUrl,
          credit: photo.credit,
          license: photo.license,
          source: photo.source,
        };
        found++;
        console.log(`${label} — ${photo.title} (${photo.source})`);
      } else {
        delete photos[landmark.id];
        missing++;
        console.log(`${label} — no good photo found; the card will say "be the first"`);
      }
    } catch (err) {
      failed++;
      console.log(`${label} — FAILED (${err.message})`);
    }
    // Save after every zone, so stopping halfway keeps what was found.
    fs.writeFileSync(OUT_FILE, JSON.stringify(photos, null, 2) + "\n");
    await sleep(2000); // be polite to the free service
  }

  console.log(`\nDone: ${found} found, ${missing} without a photo, ${failed} failed.`);
  if (failed) console.log('Run "npm run fetch-photos" again to retry the failed ones.');
  console.log("Restart the server to see them on the cards.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
