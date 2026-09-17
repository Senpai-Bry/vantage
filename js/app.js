// js/app.js
//
// The map logic. Zone data (name/coords/description) and ownership both
// come from the backend now — GET /api/zones returns everything in one
// call. To add a new turf zone, edit server/data/landmarks.js and restart
// the server; this file never needs to change for that.

// ---------------------------------------------------------------------------
// 1. The map
// ---------------------------------------------------------------------------

// Center roughly over the middle of the landmarks, zoomed out enough to see
// all of them at once.
const map = L.map("map").setView([32.99, -80.05], 12);

// Esri's free "World Dark Gray Base" tiles: real map data, styled dark, no
// API key or account required. (CartoDB's old free "Dark Matter" tiles —
// what this used to point at — now require a CARTO account/API key and
// show a watermark without one, which is the "API key required" text you
// were seeing.)
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
    // data-zone-id makes each marker's zone identifiable in the DOM (handy
    // for automated testing, and harmless otherwise).
    html: `<div class="${classes.join(" ")}" data-zone-id="${zone.id}" title="${zone.name}"></div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  });
}

// Keep a lookup from zone id -> { zone, marker } so click handlers and the
// panel can find each other, and so a claim/release can update just one
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

// ---------------------------------------------------------------------------
// 3. Info panel
// ---------------------------------------------------------------------------

const panel = document.getElementById("turf-panel");
const panelTitle = document.getElementById("turf-panel-title");
const panelDesc = document.getElementById("turf-panel-desc");
const panelClaimBtn = document.getElementById("turf-panel-claim");
const panelStatus = document.getElementById("turf-panel-status");
const panelCloseBtn = document.getElementById("turf-panel-close");

let activeZoneId = null;

function openPanel(id) {
  activeZoneId = id;
  const { zone } = zones[id];

  panelTitle.textContent = zone.name;
  panelDesc.textContent = zone.description;
  refreshPanel();

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

  panelClaimBtn.disabled = false;

  if (!Auth.isLoggedIn()) {
    panelClaimBtn.textContent = "Log in to claim";
    panelClaimBtn.disabled = true;
    panelStatus.textContent = zone.owner ? `Held by ${zone.owner}` : "Unclaimed";
  } else if (!zone.owner) {
    panelClaimBtn.textContent = "Claim this turf";
    panelStatus.textContent = "Unclaimed";
  } else if (zone.owner === me) {
    panelClaimBtn.textContent = "Release this turf";
    panelStatus.textContent =
      "Held by you since " + new Date(zone.claimedAt).toLocaleString();
  } else {
    panelClaimBtn.textContent = "Already claimed";
    panelClaimBtn.disabled = true;
    panelStatus.textContent = `Held by ${zone.owner}`;
  }
}

panelCloseBtn.addEventListener("click", closePanel);

panelClaimBtn.addEventListener("click", async () => {
  if (!activeZoneId || !Auth.isLoggedIn()) return;
  const { zone } = zones[activeZoneId];

  panelClaimBtn.disabled = true;
  panelStatus.textContent = "Working…";

  try {
    const updated =
      zone.owner === Auth.getUsername()
        ? await api(`/api/zones/${zone.id}/claim`, { method: "DELETE", auth: true })
        : await api(`/api/zones/${zone.id}/claim`, { method: "POST", auth: true });

    renderZone(updated);
    refreshPanel();
  } catch (err) {
    // Someone may have claimed it a moment before us — the error's zone
    // data (if included) tells us who, so the panel shows the truth
    // instead of a stale "Claim this turf" button.
    panelStatus.textContent = err.message;
    try {
      const fresh = await api("/api/zones");
      const freshZone = fresh.find((z) => z.id === zone.id);
      if (freshZone) renderZone(freshZone);
    } catch (_) {
      /* best-effort refresh; the error message above is still shown */
    }
    refreshPanel();
  }
});

// Re-check ownership/marker colors whenever login state changes, and
// refresh whatever the panel is currently showing.
document.addEventListener("vantage:auth-changed", async () => {
  try {
    const zoneList = await api("/api/zones");
    zoneList.forEach(renderZone);
  } catch (err) {
    console.error("Couldn't refresh turf zones:", err);
  }
  if (activeZoneId) refreshPanel();
});
