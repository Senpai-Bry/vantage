// js/app.js
//
// The map logic. (The card feed beside it lives in feed.js — the two talk
// through a few small functions and "vantage:..." events.) Zone data (name/coords/description/current challenge) and
// ownership both come from the backend — GET /api/zones returns everything
// in one call, and ownership is derived from votes, not a manual claim.
// Submitting a photo and voting also live here, talking to the endpoints
// in server/routes/submissions.js.

// ---------------------------------------------------------------------------
// 1. The map
// ---------------------------------------------------------------------------

// zoomControl: false, then re-added bottom-right — the zone panel sits on
// the left, so the default top-left zoom buttons would hide under it.
const map = L.map("map", { zoomControl: false }).setView([32.99, -80.05], 12);
L.control.zoom({ position: "bottomright" }).addTo(map);

// Esri's free "World Light Gray" tiles: real map data, styled light and
// quiet so the turf colors are what stands out. No API key needed. The
// base layer is the land/roads; the reference layer on top adds the
// place names.
const ESRI_ATTRIBUTION =
  "&copy; Esri &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS, " +
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, GIS User Community';

L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  { attribution: ESRI_ATTRIBUTION, maxZoom: 16 }
).addTo(map);

L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}",
  { maxZoom: 16 }
).addTo(map);

// Tapping empty map closes the small preview card (phones/tablets).
map.on("click", () => hideMapPreview());

// ---------------------------------------------------------------------------
// 2. Turf borders + markers
// ---------------------------------------------------------------------------
// Every zone gets two things on the map:
//   - its turf: the street-bounded border made by scripts/build-turf.js,
//     tinted by who holds it (a small circle instead, if a zone has no
//     border yet)
//   - a small dot marker on top (a divIcon — plain HTML styled in CSS)

const TURF_STYLES = {
  open: { color: "#717171", weight: 1.5, opacity: 0.7, dashArray: "4 5", fillColor: "#717171", fillOpacity: 0.02 },
  held: { color: "#222222", weight: 1.5, opacity: 0.4, fillColor: "#222222", fillOpacity: 0.08, dashArray: null },
  mine: { color: "#F2711C", weight: 1.5, opacity: 0.7, fillColor: "#F2711C", fillOpacity: 0.16, dashArray: null },
};

// "open", "held" or "mine" — the one question every bit of styling asks.
function turfState(zone) {
  if (!zone.owner) return "open";
  return zone.owner === Auth.getUsername() ? "mine" : "held";
}

// The selected zone's border gets drawn bolder so you can see its edges.
// So does a highlighted one (its card is hovered in the feed, or it's
// showing in the small preview card on a phone).
function turfStyle(zone, selected, highlighted) {
  const style = TURF_STYLES[turfState(zone)];
  if (selected) return { ...style, weight: 3, opacity: 0.9 };
  if (highlighted) return { ...style, weight: 3, opacity: 0.9, fillOpacity: style.fillOpacity + 0.08 };
  return style;
}

function makeIcon(zone, selected, highlighted) {
  const state = turfState(zone);
  const classes = ["turf-pin", `turf-pin--${state}`];
  if (selected) classes.push("turf-pin--selected", "vf");
  if (highlighted && !selected) classes.push("turf-pin--highlighted");

  // Only the selected or highlighted zone shows its name above the dot.
  const label = selected || highlighted
    ? `<span class="turf-pin-label">${escapeHTML(zone.name)}</span>`
    : "";

  const size = selected ? 56 : 22;
  return L.divIcon({
    className: "", // prevent Leaflet's default marker styles from leaking in
    html: `<div class="${classes.join(" ")}" title="${escapeHTML(zone.name)}">${label}<span class="turf-pin-dot"></span></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

// Keep a lookup from zone id -> { zone, marker, turf } so click handlers
// and the panel can find each other, and so a vote/submission can update
// just one zone without re-drawing all of them.
const zones = {};

function makeTurf(zone, selected) {
  // bubblingMouseEvents: false — a click on a zone shouldn't also count as
  // a click on the empty map (which closes the preview card on a phone).
  const options = { ...turfStyle(zone, selected), bubblingMouseEvents: false };
  if (zone.boundary && zone.boundary.length >= 3) {
    return L.polygon(zone.boundary, options);
  }
  // No border built for this zone yet: fall back to a small circle.
  return L.circleMarker(zone.coords, { radius: 34, ...options });
}

function renderZone(zone) {
  zones[zone.id] = { ...zones[zone.id], zone };
  const entry = zones[zone.id];
  const selected = zone.id === activeZoneId;
  const highlighted = zone.id === highlightedZoneId;

  if (entry.marker) {
    entry.marker.setIcon(makeIcon(zone, selected, highlighted));
    entry.marker.setZIndexOffset(selected ? 1000 : highlighted ? 900 : 0);
    entry.turf.setStyle(turfStyle(zone, selected, highlighted));
    if (selected || highlighted) entry.turf.bringToFront();
  } else {
    entry.turf = makeTurf(zone, selected).addTo(map);
    entry.marker = L.marker(zone.coords, { icon: makeIcon(zone, selected, highlighted) }).addTo(map);

    for (const layer of [entry.turf, entry.marker]) {
      layer.on("click", () => tapZone(zone.id));
      // Pointing at a zone on the map lights up its card in the feed.
      layer.on("mouseover", () => highlightCard(zone.id));
      layer.on("mouseout", () => highlightCard(null));
    }
  }
}

// On a computer, clicking a zone opens its panel. On a phone or tablet in
// map view, it shows the small preview card first (feed.js).
function tapZone(zoneId) {
  if (isCompact.matches) {
    showMapPreview(zoneId);
  } else {
    openPanel(zoneId);
  }
}

// Lights up one zone on the map (or none, with null) without selecting it.
// feed.js calls this when you hover a card.
let highlightedZoneId = null;

function highlightZone(zoneId) {
  if (zoneId === highlightedZoneId) return;
  const previousId = highlightedZoneId;
  highlightedZoneId = zoneId;
  redrawZone(previousId);
  redrawZone(zoneId);
}

// Every zone we know about, as a plain list — what feed.js draws cards from.
function allZones() {
  return Object.values(zones).map((entry) => entry.zone);
}

// Tells feed.js the zone data changed, so it re-draws the cards.
function announceZonesChanged() {
  document.dispatchEvent(new CustomEvent("vantage:zones-changed"));
}

// Re-draws one zone's marker using the zone data we already have — used
// when only the selection changed, not the zone itself.
function redrawZone(zoneId) {
  if (zoneId && zones[zoneId]) renderZone(zones[zoneId].zone);
}

async function loadZones() {
  const zoneList = await api("/api/zones");
  zoneList.forEach(renderZone);
  announceZonesChanged();
  // Start zoomed out just enough to show every zone.
  if (zoneList.length > 0) {
    map.fitBounds(L.latLngBounds(zoneList.map((zone) => zone.coords)), { padding: [48, 48] });
  }
}

loadZones().catch((err) => {
  console.error("Couldn't load turf zones:", err);
});

// Re-fetches one zone and re-renders its marker + (if it's the open one)
// the panel. Called after anything that could change who holds a
// zone — a new submission, or a vote.
async function refreshZone(zoneId) {
  const zone = await api(`/api/zones/${zoneId}`);
  renderZone(zone);
  announceZonesChanged();
  if (activeZoneId === zoneId) refreshPanel();
}

// ---------------------------------------------------------------------------
// 3. Info panel
// ---------------------------------------------------------------------------

const panel = document.getElementById("turf-panel");
const panelTitle = document.getElementById("turf-panel-title");
const panelDesc = document.getElementById("turf-panel-desc");
const panelChallengeBox = document.getElementById("turf-panel-challenge-box");
const panelChallenge = document.getElementById("turf-panel-challenge");
const panelStatus = document.getElementById("turf-panel-status");
const panelHero = document.getElementById("turf-panel-hero");
const panelMeta = document.getElementById("turf-panel-meta");
const panelCloseBtn = document.getElementById("turf-panel-close");

const submitForm = document.getElementById("turf-submit-form");
const submitInput = document.getElementById("turf-submit-input");
const submitFilename = document.getElementById("turf-submit-filename");
const submitBtn = document.getElementById("turf-submit-btn");
const submitStatus = document.getElementById("turf-submit-status");
const loginPrompt = document.getElementById("turf-login-prompt");
const loginPromptBtn = document.getElementById("turf-login-btn");

const submissionsList = document.getElementById("turf-submissions-list");
const submissionsCount = document.getElementById("turf-submissions-count");

// On a phone the panels are bottom sheets, so only one can be open at once.
const isPhone = window.matchMedia("(max-width: 640px)");
// Phones and tablets show the feed OR the map (feed.js flips between them);
// bigger screens show both side by side. Matches the CSS breakpoint.
const isCompact = window.matchMedia("(max-width: 900px)");

let activeZoneId = null;

function openPanel(id) {
  const previousId = activeZoneId;
  activeZoneId = id;
  redrawZone(previousId);
  redrawZone(id);

  const { zone } = zones[id];
  panelTitle.textContent = zone.name;
  panelDesc.textContent = zone.description;
  resetSubmitForm();
  submitStatus.textContent = "";

  refreshPanel();
  loadSubmissions(id);

  if (isPhone.matches) closeLeaderboard();
  hideMapPreview();
  panel.classList.remove("hidden");
  panel.scrollTop = 0;
  bringIntoView(zone.coords);
  announceSelection();
}

// Tells feed.js which zone is open (or that none is), so its card can be
// marked and scrolled into view.
function announceSelection() {
  document.dispatchEvent(new CustomEvent("vantage:zone-selected", { detail: { id: activeZoneId } }));
}

// Slides the map so the selected zone sits in the middle of the part of
// the map you can actually see — not hidden under the zone panel (left),
// the leaderboard (right), or the bottom sheet on a phone.
function bringIntoView(coords) {
  const size = map.getSize();
  const leaderboardOpen = !document.getElementById("leaderboard-panel").classList.contains("hidden");

  // (On a computer the panel floats over the map's left edge.)
  const left = isPhone.matches ? 0 : panel.offsetWidth + 48;
  const right = !isPhone.matches && leaderboardOpen ? 380 : 0;
  const bottom = isPhone.matches ? Math.min(window.innerHeight * 0.7, size.y - 60) : 0;

  const target = L.point((left + size.x - right) / 2, (size.y - bottom) / 2);
  const current = map.latLngToContainerPoint(coords);
  map.panBy(current.subtract(target));
}

function closePanel() {
  panel.classList.add("hidden");
  const previousId = activeZoneId;
  activeZoneId = null;
  redrawZone(previousId);
  announceSelection();
}

function refreshPanel() {
  if (!activeZoneId) return;
  const { zone } = zones[activeZoneId];
  const state = turfState(zone);

  // The photo across the top can change when the leading photo changes,
  // so it's re-drawn here. cardPhoto() and distanceText() live in feed.js.
  panelHero.innerHTML = cardPhoto(zone).html;
  panelHero.classList.toggle("vf", Boolean(zone.leadingSubmission));
  panelHero.classList.toggle("vf--held", state === "held");
  panelMeta.textContent = [zone.city, distanceText(zone)].filter(Boolean).join(" · ");

  panelChallenge.textContent = zone.currentChallenge || "";
  panelChallengeBox.classList.toggle("hidden", !zone.currentChallenge);

  panelStatus.className = `eyebrow eyebrow--${state}`;
  if (state === "open") {
    panelStatus.textContent = "Open turf — be the first";
  } else if (state === "mine") {
    panelStatus.textContent = "Held by you";
  } else {
    panelStatus.innerHTML = `<span>Held by</span>${profileLinkHTML(zone.owner)}`;
  }

  // Logged out: swap the upload form for a "Log in to submit" prompt.
  const loggedIn = Auth.isLoggedIn();
  submitForm.classList.toggle("hidden", !loggedIn);
  loginPrompt.classList.toggle("hidden", loggedIn);
}

function resetSubmitForm() {
  submitForm.reset();
  submitFilename.textContent = "Choose a photo";
  submitFilename.closest(".upload-drop").classList.remove("upload-drop--chosen");
}

// Show the chosen file's name in the drop area so you know it took.
submitInput.addEventListener("change", () => {
  const file = submitInput.files[0];
  submitFilename.textContent = file ? file.name : "Choose a photo";
  submitFilename.closest(".upload-drop").classList.toggle("upload-drop--chosen", Boolean(file));
});

loginPromptBtn.addEventListener("click", () => openAuthModal("login"));

// Makes text safe to put inside an HTML string: characters that would
// start a tag or break out of an attribute are swapped for harmless
// look-alikes. Use it on anything a player typed (usernames, etc).
function escapeHTML(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const HEART_ICON =
  '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21l7.8-7.5 1-1.1a5.5 5.5 0 0 0 0-7.8z"/></svg>';

// The film-edge caption under each photo, e.g. "#024 · PARK CIRCLE".
// The number is the submission's real id from the database.
function filmCaption(sub, zoneName) {
  return `#${String(sub.id).padStart(3, "0")} · ${zoneName}`;
}

// Builds one <li> for the submissions gallery. `isLeading` (the first item
// in an already vote-sorted list) is the photo that currently holds the
// zone, so it gets viewfinder corners and a HOLDING badge.
function submissionItemHTML(sub, isLeading, zoneName) {
  const mine = sub.username === Auth.getUsername();
  const classes = ["turf-submission"];
  if (mine) classes.push("turf-submission--mine");

  const frameClasses = ["turf-submission-frame"];
  if (isLeading) frameClasses.push("vf");
  if (isLeading && !mine) frameClasses.push("vf--held");

  const loggedIn = Auth.isLoggedIn();
  const voteDisabled = !loggedIn || mine;
  const voteTitle = mine
    ? "You can't vote for your own photo"
    : !loggedIn
    ? "Log in to vote"
    : sub.votedByMe
    ? "Remove your vote"
    : "Vote for this photo";

  return `
    <li class="${classes.join(" ")}">
      <div class="${frameClasses.join(" ")}">
        <img class="turf-submission-photo" src="${escapeHTML(sub.photoUrl)}" alt="Photo by ${escapeHTML(sub.username)}" loading="lazy" />
        ${isLeading ? '<span class="turf-submission-badge">HOLDING</span>' : ""}
      </div>
      <span class="film-caption">${escapeHTML(filmCaption(sub, zoneName))}</span>
      <div class="turf-submission-info">
        <span class="turf-submission-user">
          ${avatarHTML(sub.username, sub.avatarUrl, { size: "sm", me: mine })}
          ${profileLinkHTML(sub.username)}
        </span>
        <button
          type="button"
          class="turf-submission-vote${sub.votedByMe ? " turf-submission-vote--active" : ""}"
          data-submission-id="${sub.id}"
          ${voteDisabled ? "disabled" : ""}
          title="${voteTitle}"
          aria-label="${voteTitle}"
        >${HEART_ICON} ${sub.voteCount}</button>
      </div>
    </li>
  `;
}

async function loadSubmissions(zoneId) {
  submissionsCount.textContent = "";
  submissionsList.innerHTML = '<li class="turf-submissions-empty">Loading…</li>';
  try {
    const subs = await api(`/api/zones/${zoneId}/submissions`, { auth: true });
    if (zoneId !== activeZoneId) return; // you clicked another zone meanwhile

    submissionsCount.textContent = `${subs.length} ${subs.length === 1 ? "frame" : "frames"}`;
    if (subs.length === 0) {
      submissionsList.innerHTML =
        '<li class="turf-submissions-empty">No frames yet. The first good shot takes this turf.</li>';
      return;
    }
    // The backend already sorts by vote count, so index 0 is the leader.
    const zoneName = zones[zoneId].zone.name;
    submissionsList.innerHTML = subs
      .map((sub, index) => submissionItemHTML(sub, index === 0, zoneName))
      .join("");
  } catch (err) {
    submissionsList.innerHTML = `<li class="turf-submissions-empty">${escapeHTML(err.message)}</li>`;
  }
}

// Voting: one click handler on the list itself (event delegation), since
// every row gets replaced wholesale each time loadSubmissions() runs.
submissionsList.addEventListener("click", async (event) => {
  const button = event.target.closest(".turf-submission-vote");
  if (!button || button.disabled || !activeZoneId) return;

  const submissionId = button.dataset.submissionId;
  const zoneId = activeZoneId;
  button.disabled = true;

  try {
    await api(`/api/submissions/${submissionId}/vote`, { method: "POST", auth: true });
    await loadSubmissions(zoneId);
    await refreshZone(zoneId);
  } catch (err) {
    submitStatus.textContent = err.message;
    button.disabled = false;
  }
});

// Asks the browser for the phone's current GPS position. Wrapped in a
// Promise so the submit code can simply "await" it. The browser shows its
// own "Allow location?" prompt the first time.
function getLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("This browser can't share your location, so photos can't be checked against the zone."));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, (err) => {
      const messages = {
        1: "Vantage needs your location to check you're at this zone. Allow location access and try again.",
        2: "Couldn't find your location. Check that location services are on, then try again.",
        3: "Finding your location took too long. Try again — it's quicker outdoors.",
      };
      reject(new Error(messages[err.code] || "Couldn't get your location."));
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 });
  });
}

submitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeZoneId || !Auth.isLoggedIn()) return;

  const file = submitInput.files[0];
  if (!file) {
    submitStatus.textContent = "Choose a photo first.";
    return;
  }

  const zoneId = activeZoneId;
  submitBtn.disabled = true;

  try {
    // Geofence: the server only accepts the photo if you're inside the
    // zone, so send along where your phone says you are.
    submitStatus.textContent = "Checking your location…";
    const position = await getLocation();

    const formData = new FormData();
    formData.append("lat", position.coords.latitude);
    formData.append("lng", position.coords.longitude);
    formData.append("photo", file);

    submitStatus.textContent = "Uploading…";
    await api(`/api/zones/${zoneId}/submissions`, {
      method: "POST",
      body: formData,
      auth: true,
    });
    resetSubmitForm();
    submitStatus.textContent = "Submitted!";
    await loadSubmissions(zoneId);
    await refreshZone(zoneId);
  } catch (err) {
    submitStatus.textContent = err.message;
  } finally {
    submitBtn.disabled = false;
  }
});

panelCloseBtn.addEventListener("click", closePanel);

// Escape closes whichever panel is open.
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeZoneId && !document.querySelector("#auth-modal:not(.hidden)")) {
    closePanel();
  }
});

// Re-check ownership/marker colors whenever login state changes, and
// refresh whatever the panel is currently showing (a vote button that was
// disabled because you weren't logged in needs to become clickable the
// moment you log in, for example).
document.addEventListener("vantage:auth-changed", async () => {
  try {
    const zoneList = await api("/api/zones");
    zoneList.forEach(renderZone);
    announceZonesChanged();
  } catch (err) {
    console.error("Couldn't refresh turf zones:", err);
  }
  if (activeZoneId) {
    refreshPanel();
    loadSubmissions(activeZoneId);
  }
});
