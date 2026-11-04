// js/feed.js
//
// The explore feed: a scrolling list of zone cards, like the listings on
// Airbnb or DoorDash. Each card shows a photo of the zone, who holds it, its
// current challenge and (once you share your location) how far away it is.
//
// The card photo is the zone's top-voted player photo. If nobody has shot
// the zone yet, it's a Wikimedia photo of the landmark (credited, since
// that's the deal for using them). If there's neither, the card asks you to
// be the first.
//
// It also handles the phone/tablet layout: the List/Map button, and the
// small preview card that pops up when you tap a dot in map view.
//
// The zone data itself comes from app.js (allZones()), which announces
// "vantage:zones-changed" whenever it changes.

const feedList = document.getElementById("feed-list");
const feedChips = document.getElementById("feed-chips");
const chipsPrev = document.getElementById("chips-prev");
const chipsNext = document.getElementById("chips-next");
const feedCount = document.getElementById("feed-count");
const feedStatus = document.getElementById("feed-status");
const mapPreview = document.getElementById("map-preview");
const viewToggle = document.getElementById("view-toggle");
const viewToggleLabel = document.getElementById("view-toggle-label");
const viewToggleMapIcon = document.getElementById("view-toggle-map-icon");
const viewToggleListIcon = document.getElementById("view-toggle-list-icon");

// Only devices with a real mouse get hover effects (a phone "hovers"
// whatever you last tapped, which just looks stuck).
const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");

let feedFilter = "all";
let myPosition = null; // [lat, lng] once you tap "Near me"

// ---------------------------------------------------------------------------
// 1. Filters
// ---------------------------------------------------------------------------
// Each filter: which zones it keeps, and what to say when none are left.
// City filters get added on the fly, one per city in the zone data.

const FEED_FILTERS = {
  all: { label: "All", keep: () => true },
  near: { label: "Near me", keep: () => true, empty: "Couldn't find your location." },
  open: {
    label: "Open turf",
    keep: (zone) => !zone.owner,
    empty: "Every zone is taken. Time to steal one.",
  },
  mine: {
    label: "Your turf",
    keep: (zone) => zone.owner && zone.owner === Auth.getUsername(),
    empty: "You don't hold any turf yet. Pick an open zone and go shoot it.",
    loggedInOnly: true,
  },
  hot: {
    label: "Hot right now",
    keep: (zone) => zone.recentVotes > 0,
    sort: (a, b) => b.recentVotes - a.recentVotes,
    empty: "Nothing's heating up yet. Zones getting votes this week show up here.",
  },
};

function cityFilterKey(city) {
  return `city:${city}`;
}

function filterFor(key) {
  if (key.startsWith("city:")) {
    const city = key.slice(5);
    return { label: city, keep: (zone) => zone.city === city };
  }
  return FEED_FILTERS[key];
}

function renderChips(zoneList) {
  const cities = [...new Set(zoneList.map((zone) => zone.city).filter(Boolean))].sort();
  const keys = Object.keys(FEED_FILTERS)
    .filter((key) => !FEED_FILTERS[key].loggedInOnly || Auth.isLoggedIn())
    .concat(cities.map(cityFilterKey));

  // Logged out while "Your turf" was picked? Go back to All.
  if (!keys.includes(feedFilter)) feedFilter = "all";

  const scrollLeft = feedChips.scrollLeft;
  feedChips.innerHTML = keys
    .map((key) => {
      const active = key === feedFilter;
      const icon = key === "near" ? NEAR_ICON : key === "hot" ? HOT_ICON : "";
      return `<button type="button" class="chip${active ? " chip--active" : ""}" data-filter="${escapeHTML(key)}" aria-pressed="${active}">${icon}${escapeHTML(filterFor(key).label)}</button>`;
    })
    .join("");

  // Re-drawing the chips shouldn't jump the row back to the start — and if
  // the picked chip is half cut off, slide it into view.
  feedChips.scrollLeft = scrollLeft;
  const active = feedChips.querySelector(".chip--active");
  if (active) {
    const left = active.offsetLeft - feedChips.offsetLeft;
    const right = left + active.offsetWidth;
    const pad = 48; // clear of the arrow buttons
    if (left < feedChips.scrollLeft + pad) {
      feedChips.scrollTo({ left: left - pad, behavior: "smooth" });
    } else if (right > feedChips.scrollLeft + feedChips.clientWidth - pad) {
      feedChips.scrollTo({ left: right - feedChips.clientWidth + pad, behavior: "smooth" });
    }
  }
  updateChipArrows();
}

// The chip row scrolls sideways when it doesn't fit. Arrows (computers)
// and faded edges (everyone) show there's more, and only appear on the side
// that actually has more chips hidden.
function updateChipArrows() {
  const maxScroll = feedChips.scrollWidth - feedChips.clientWidth;
  const atStart = feedChips.scrollLeft <= 2;
  const atEnd = feedChips.scrollLeft >= maxScroll - 2;
  const scroller = feedChips.parentElement;
  scroller.classList.toggle("chips-scroller--more-left", !atStart);
  scroller.classList.toggle("chips-scroller--more-right", !atEnd);
}

function scrollChips(direction) {
  feedChips.scrollBy({ left: direction * feedChips.clientWidth * 0.7, behavior: "smooth" });
}

chipsPrev.addEventListener("click", () => scrollChips(-1));
chipsNext.addEventListener("click", () => scrollChips(1));
feedChips.addEventListener("scroll", updateChipArrows, { passive: true });
window.addEventListener("resize", updateChipArrows);

// A normal mouse wheel scrolls up/down; over the chips, turn that into
// sideways scrolling so you don't need a trackpad.
feedChips.addEventListener("wheel", (event) => {
  if (Math.abs(event.deltaY) <= Math.abs(event.deltaX)) return;
  if (feedChips.scrollWidth <= feedChips.clientWidth) return;
  event.preventDefault();
  feedChips.scrollLeft += event.deltaY;
}, { passive: false });

feedChips.addEventListener("click", async (event) => {
  const chip = event.target.closest(".chip");
  if (!chip) return;
  feedFilter = chip.dataset.filter;
  if (feedFilter !== "near") feedStatus.textContent = "";
  if (feedFilter === "near" && !myPosition) {
    await findMe();
  } else {
    renderFeed();
  }
});

// "Near me" needs your location. Uses getLocation() from app.js (the same
// one the geofence uses), so the browser asks you once.
async function findMe() {
  feedStatus.textContent = "Finding you…";
  renderFeed();
  try {
    const position = await getLocation();
    myPosition = [position.coords.latitude, position.coords.longitude];
    feedStatus.textContent = "";
  } catch (err) {
    feedStatus.textContent = err.message;
  }
  renderFeed();
}

// ---------------------------------------------------------------------------
// 2. Cards
// ---------------------------------------------------------------------------

const NEAR_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m3 11 19-9-9 19-2-8-8-2z"/></svg>';
const HOT_ICON =
  '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.29 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>';
const LENS_ICON =
  '<svg width="34" height="34" viewBox="0 0 32 32" fill="none" aria-hidden="true"><path d="M3 11V3h8" /><path d="M21 3h8v8" /><path d="M29 21v8h-8" /><path d="M11 29H3v-8" /><circle cx="16" cy="16" r="5" /></svg>';

// Straight-line distance in miles between two [lat, lng] points.
function milesBetween([lat1, lng1], [lat2, lng2]) {
  const toRad = (d) => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(a));
}

function distanceText(zone) {
  if (!myPosition) return "";
  const miles = milesBetween(myPosition, zone.coords);
  if (miles < 0.1) return "You're here";
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi away`;
}

function holderText(zone) {
  const state = turfState(zone);
  if (state === "open") return "Open turf — be the first";
  if (state === "mine") return "Held by you";
  return `Held by ${zone.owner}`;
}

// What goes in the photo spot. Returns { html, caption }:
//   html    - the photo (or the "no shots yet" placeholder), plus the small
//             photo credit on top of it when it's a Wikimedia photo
//   caption - the film-edge line under a player's photo ("#001 · NAME"),
//             or "" for everything else
function cardPhoto(zone, { credit = true } = {}) {
  const leader = zone.leadingSubmission;
  if (leader) {
    return {
      html: `<img class="zone-card-img" src="${escapeHTML(leader.photoUrl)}" alt="Leading photo of ${escapeHTML(zone.name)} by ${escapeHTML(zone.owner)}" loading="lazy" />`,
      caption: `#${String(leader.id).padStart(3, "0")} · ${escapeHTML(zone.owner)}`,
    };
  }
  const stock = zone.landmarkPhoto;
  if (stock) {
    // The credit links to the photo's Wikimedia page (its license terms).
    // The map preview card is one big button, and a link can't go inside a
    // button, so it leaves the credit off (credit: false).
    const creditHTML = credit
      ? `<a class="zone-card-credit" href="${escapeHTML(stock.pageUrl)}" target="_blank" rel="noopener noreferrer"
           title="Photo: ${escapeHTML(stock.credit)} · ${escapeHTML(stock.license)} · Wikimedia Commons">© ${escapeHTML(stock.credit)}</a>`
      : "";
    return {
      html: `<img class="zone-card-img" src="${escapeHTML(stock.url)}" alt="${escapeHTML(zone.name)}" loading="lazy" />${creditHTML}`,
      caption: "",
    };
  }
  return {
    html: `<div class="zone-card-empty">${LENS_ICON}<span>No shots yet</span></div>`,
    caption: "",
  };
}

// The line at the bottom of a card: who holds the zone, and how many votes
// and photos it has. Open zones just say so, quietly — the badge on the
// photo already says "Open turf".
function cardFooterHTML(zone) {
  const state = turfState(zone);
  const frames = `${zone.submissionCount} ${zone.submissionCount === 1 ? "frame" : "frames"}`;
  if (state === "open") {
    return `
      <p class="zone-card-footer">
        <span class="zone-card-holder"><span class="zone-card-dot"></span>Unclaimed</span>
        <span class="zone-card-stat">${frames}</span>
      </p>`;
  }
  const holder = state === "mine" ? "You" : zone.owner;
  const votes = zone.leadingSubmission ? zone.leadingSubmission.voteCount : 0;
  return `
    <p class="zone-card-footer">
      <span class="zone-card-holder">
        ${avatarHTML(zone.owner, zone.ownerAvatar, { size: "sm", me: state === "mine" })}
        ${profileLinkHTML(zone.owner, holder)}
      </span>
      <span class="zone-card-stat">${HEART_ICON} ${votes}</span>
    </p>`;
}

function cardHTML(zone) {
  const state = turfState(zone);
  const photo = cardPhoto(zone);
  const active = zone.id === activeZoneId;
  const meta = [zone.city, distanceText(zone)].filter(Boolean).join(" · ");
  const badge = { open: "Open turf", held: "Held", mine: "Your turf" }[state];
  const hot = zone.recentVotes > 0
    ? `<span class="zone-card-hot">${HOT_ICON}${zone.recentVotes} this week</span>`
    : "";

  // Order, most to least important: photo → name → where → the challenge
  // (the reason to go) → who holds it.
  return `
    <li>
      <article class="zone-card zone-card--${state}${active ? " zone-card--active" : ""}" data-zone-id="${escapeHTML(zone.id)}">
        <div class="zone-card-media vf${state === "held" ? " vf--held" : ""}">
          ${photo.html}
          <span class="zone-card-badge zone-card-badge--${state}">${badge}</span>
          ${hot}
        </div>
        ${photo.caption ? `<p class="film-caption zone-card-caption">${photo.caption}</p>` : ""}
        <h3 class="zone-card-title">
          <button type="button" class="zone-card-open">${escapeHTML(zone.name)}</button>
        </h3>
        ${meta ? `<p class="zone-card-meta">${escapeHTML(meta)}</p>` : ""}
        ${zone.currentChallenge ? `<p class="zone-card-challenge">${escapeHTML(zone.currentChallenge)}</p>` : ""}
        ${cardFooterHTML(zone)}
      </article>
    </li>
  `;
}

function renderFeed() {
  const zoneList = allZones();
  renderChips(zoneList);

  const filter = filterFor(feedFilter);
  let shown = zoneList.filter(filter.keep);
  if (feedFilter === "near" && myPosition) {
    shown.sort((a, b) => milesBetween(myPosition, a.coords) - milesBetween(myPosition, b.coords));
  } else if (filter.sort) {
    shown.sort(filter.sort);
  }
  if (feedFilter === "near" && !myPosition) shown = [];

  feedCount.textContent = `${shown.length} ${shown.length === 1 ? "zone" : "zones"}`;

  if (shown.length === 0) {
    const waiting = feedFilter === "near" && feedStatus.textContent === "Finding you…";
    feedList.innerHTML = waiting ? "" : `<li class="feed-empty">${escapeHTML(filter.empty || "No zones here yet.")}</li>`;
    return;
  }
  feedList.innerHTML = shown.map(cardHTML).join("");
}

// Clicking anywhere on a card opens that zone. (The photo credit link is
// the one exception — it opens the photo's Wikimedia page instead.)
feedList.addEventListener("click", (event) => {
  if (event.target.closest("a")) return;
  const card = event.target.closest(".zone-card");
  if (card) openPanel(card.dataset.zoneId);
});

// Hovering a card lights its zone up on the map (computers only).
feedList.addEventListener("mouseover", (event) => {
  if (!canHover.matches) return;
  const card = event.target.closest(".zone-card");
  highlightZone(card ? card.dataset.zoneId : null);
});

feedList.addEventListener("mouseleave", () => highlightZone(null));

// app.js calls this when you point at a zone on the map, so its card
// lights up too.
function highlightCard(zoneId) {
  if (!canHover.matches) return;
  for (const card of feedList.querySelectorAll(".zone-card--hover")) {
    card.classList.remove("zone-card--hover");
  }
  if (zoneId) cardFor(zoneId)?.classList.add("zone-card--hover");
}

function cardFor(zoneId) {
  return feedList.querySelector(`.zone-card[data-zone-id="${CSS.escape(zoneId)}"]`);
}

// When a zone opens (from a card or the map), mark its card and scroll it
// into view, so the feed and the map always agree on what's selected.
document.addEventListener("vantage:zone-selected", (event) => {
  for (const card of feedList.querySelectorAll(".zone-card--active")) {
    card.classList.remove("zone-card--active");
  }
  const card = event.detail.id && cardFor(event.detail.id);
  if (!card) return;
  card.classList.add("zone-card--active");
  if (!isCompact.matches) card.scrollIntoView({ block: "nearest", behavior: "smooth" });
});

document.addEventListener("vantage:zones-changed", () => {
  renderFeed();
  refreshMapPreview();
});

// ---------------------------------------------------------------------------
// 3. Phones and tablets: List/Map button and the map preview card
// ---------------------------------------------------------------------------

function setView(view) {
  const showMap = view === "map";
  document.body.classList.toggle("view-map", showMap);
  viewToggleLabel.textContent = showMap ? "List" : "Map";
  viewToggleMapIcon.classList.toggle("hidden", showMap);
  viewToggleListIcon.classList.toggle("hidden", !showMap);
  hideMapPreview();
  // The map was hidden behind the feed; make sure Leaflet knows its size.
  if (showMap) map.invalidateSize();
}

viewToggle.addEventListener("click", () => {
  setView(document.body.classList.contains("view-map") ? "list" : "map");
});

let previewZoneId = null;

// app.js calls this when you tap a zone in map view on a phone/tablet:
// one small card at the bottom instead of the whole panel.
function showMapPreview(zoneId) {
  previewZoneId = zoneId;
  highlightZone(zoneId);
  refreshMapPreview();
  mapPreview.classList.remove("hidden");
}

function hideMapPreview() {
  if (!previewZoneId) return;
  previewZoneId = null;
  highlightZone(null);
  mapPreview.classList.add("hidden");
}

function refreshMapPreview() {
  if (!previewZoneId) return;
  const zone = allZones().find((z) => z.id === previewZoneId);
  if (!zone) return hideMapPreview();

  const state = turfState(zone);
  const photo = cardPhoto(zone, { credit: false });
  const meta = [zone.city, distanceText(zone)].filter(Boolean).join(" · ");
  mapPreview.innerHTML = `
    <button type="button" class="map-preview-open" aria-label="Open ${escapeHTML(zone.name)}">
      <span class="map-preview-media">${photo.html}</span>
      <span class="map-preview-body">
        <span class="eyebrow eyebrow--${state}">${escapeHTML(holderText(zone))}</span>
        <span class="map-preview-title">${escapeHTML(zone.name)}</span>
        ${meta ? `<span class="zone-card-meta">${escapeHTML(meta)}</span>` : ""}
        ${zone.currentChallenge ? `<span class="map-preview-challenge">${escapeHTML(zone.currentChallenge)}</span>` : ""}
      </span>
    </button>
    <button type="button" class="map-preview-close" aria-label="Close preview">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
    </button>
  `;
}

mapPreview.addEventListener("click", (event) => {
  if (event.target.closest(".map-preview-close")) {
    hideMapPreview();
  } else if (event.target.closest(".map-preview-open")) {
    openPanel(previewZoneId);
  }
});
