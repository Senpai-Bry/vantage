// js/app.js
//
// The map logic. Zone data (name/coords/description/current challenge) and
// ownership both come from the backend — GET /api/zones returns everything
// in one call, and ownership is derived from votes, not a manual claim.
// Submitting a photo and voting also live here, talking to the endpoints
// in server/routes/submissions.js.

// ---------------------------------------------------------------------------
// 1. The map
// ---------------------------------------------------------------------------

const map = L.map("map").setView([32.99, -80.05], 12);

// Esri's free "World Dark Gray Base" tiles: real map data, styled dark, no
// API key or account required.
L.tileLayer(
  "https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}",
  {
    attribution:
      "&copy; Esri &mdash; Esri, HERE, Garmin, FAO, NOAA, USGS, " +
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, GIS User Community',
    maxZoom: 16,
  }
).addTo(map);

// ---------------------------------------------------------------------------
// 2. Markers
// ---------------------------------------------------------------------------
// Each marker is a plain divIcon (a small styled <div>, not an image) so we
// can glow it with pure CSS and just swap classes to re-color it.
// See css/style.css for .turf-marker / .turf-marker--claimed / .turf-marker--mine.

function makeIcon(zone) {
  const classes = ["turf-marker"];
  if (zone.owner) classes.push("turf-marker--claimed");
  if (zone.owner && zone.owner === Auth.getUsername()) classes.push("turf-marker--mine");

  return L.divIcon({
    className: "", // prevent Leaflet's default marker styles from leaking in
    html: `<div class="${classes.join(" ")}" data-zone-id="${zone.id}" title="${zone.name}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Keep a lookup from zone id -> { zone, marker } so click handlers and the
// panel can find each other, and so a vote/submission can update just one
// marker without re-drawing all of them.
const zones = {};

function renderZone(zone) {
  zones[zone.id] = { ...zones[zone.id], zone };

  if (zones[zone.id].marker) {
    zones[zone.id].marker.setIcon(makeIcon(zone));
  } else {
    const marker = L.marker(zone.coords, { icon: makeIcon(zone) }).addTo(map);
    marker.on("click", () => openPanel(zone.id));
    zones[zone.id].marker = marker;
  }
}

async function loadZones() {
  const zoneList = await api("/api/zones");
  zoneList.forEach(renderZone);
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
  if (activeZoneId === zoneId) refreshPanel();
}

// ---------------------------------------------------------------------------
// 3. Info panel
// ---------------------------------------------------------------------------

const panel = document.getElementById("turf-panel");
const panelTitle = document.getElementById("turf-panel-title");
const panelDesc = document.getElementById("turf-panel-desc");
const panelChallenge = document.getElementById("turf-panel-challenge");
const panelStatus = document.getElementById("turf-panel-status");
const panelCloseBtn = document.getElementById("turf-panel-close");

const submitForm = document.getElementById("turf-submit-form");
const submitInput = document.getElementById("turf-submit-input");
const submitBtn = document.getElementById("turf-submit-btn");
const submitStatus = document.getElementById("turf-submit-status");

const submissionsList = document.getElementById("turf-submissions-list");

let activeZoneId = null;

function openPanel(id) {
  activeZoneId = id;
  const { zone } = zones[id];

  panelTitle.textContent = zone.name;
  panelDesc.textContent = zone.description;
  submitForm.reset();

  refreshPanel();
  loadSubmissions(id);

  panel.classList.remove("hidden");
}

function closePanel() {
  panel.classList.add("hidden");
  activeZoneId = null;
}

function refreshPanel() {
  if (!activeZoneId) return;
  const { zone } = zones[activeZoneId];
  const me = Auth.getUsername();

  panelChallenge.textContent = zone.currentChallenge
    ? `Challenge: ${zone.currentChallenge}`
    : "";

  if (!zone.owner) {
    panelStatus.textContent = "Unclaimed — be the first to submit a photo.";
  } else if (zone.owner === me) {
    panelStatus.textContent = "Held by you.";
  } else {
    panelStatus.textContent = `Held by ${zone.owner}.`;
  }

  const loggedIn = Auth.isLoggedIn();
  submitInput.disabled = !loggedIn;
  submitBtn.disabled = !loggedIn;
  submitStatus.textContent = loggedIn ? "" : "Log in to submit a photo.";
}

// Builds one <li> for the submissions gallery. `isLeading` (the first item
// in an already vote-sorted list) gets a highlighted style so it's obvious
// at a glance which photo currently holds the zone.
function submissionItemHTML(sub, isLeading) {
  const classes = ["turf-submission"];
  if (isLeading) classes.push("turf-submission--leading");

  const mine = sub.username === Auth.getUsername();
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
      <img class="turf-submission-photo" src="${sub.photoUrl}" alt="Photo by ${sub.username}" />
      <div class="turf-submission-info">
        <span class="turf-submission-user">${sub.username}</span>
        <button
          class="turf-submission-vote${sub.votedByMe ? " turf-submission-vote--active" : ""}"
          data-submission-id="${sub.id}"
          ${voteDisabled ? "disabled" : ""}
          title="${voteTitle}"
        >${sub.votedByMe ? "♥" : "♡"} ${sub.voteCount}</button>
      </div>
    </li>
  `;
}

async function loadSubmissions(zoneId) {
  submissionsList.innerHTML = '<li class="turf-submissions-empty">Loading…</li>';
  try {
    const subs = await api(`/api/zones/${zoneId}/submissions`, { auth: true });
    if (subs.length === 0) {
      submissionsList.innerHTML =
        '<li class="turf-submissions-empty">No photos yet — be the first!</li>';
      return;
    }
    // The backend already sorts by vote count, so index 0 is the leader.
    submissionsList.innerHTML = subs
      .map((sub, index) => submissionItemHTML(sub, index === 0))
      .join("");
  } catch (err) {
    submissionsList.innerHTML = `<li class="turf-submissions-empty">${err.message}</li>`;
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

submitForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!activeZoneId || !Auth.isLoggedIn()) return;

  const file = submitInput.files[0];
  if (!file) {
    submitStatus.textContent = "Choose a photo first.";
    return;
  }

  const zoneId = activeZoneId;
  const formData = new FormData();
  formData.append("photo", file);

  submitBtn.disabled = true;
  submitStatus.textContent = "Uploading…";

  try {
    await api(`/api/zones/${zoneId}/submissions`, {
      method: "POST",
      body: formData,
      auth: true,
    });
    submitForm.reset();
    submitStatus.textContent = "Submitted!";
    await loadSubmissions(zoneId);
    await refreshZone(zoneId);
  } catch (err) {
    submitStatus.textContent = err.message;
  } finally {
    submitBtn.disabled = !Auth.isLoggedIn();
  }
});

panelCloseBtn.addEventListener("click", closePanel);

// Re-check ownership/marker colors whenever login state changes, and
// refresh whatever the panel is currently showing (a vote button that was
// disabled because you weren't logged in needs to become clickable the
// moment you log in, for example).
document.addEventListener("vantage:auth-changed", async () => {
  try {
    const zoneList = await api("/api/zones");
    zoneList.forEach(renderZone);
  } catch (err) {
    console.error("Couldn't refresh turf zones:", err);
  }
  if (activeZoneId) {
    refreshPanel();
    loadSubmissions(activeZoneId);
  }
});
