// app.js
//
// This file sets up the Leaflet map, drops a marker for every entry in
// LANDMARKS (defined in landmarks.js), and handles claiming turf. Read it
// top to bottom — each step is commented so you can see what each part
// does.

// 1. Create the map, centered on Goose Creek and zoomed to city level.
//    zoomControl is turned off here and re-added at top-right below, so it
//    doesn't sit underneath the "Vantage" title in the top-left corner.
const map = L.map("map", { zoomControl: false }).setView(
  MAP_CENTER,
  MAP_DEFAULT_ZOOM
);
L.control.zoom({ position: "topright" }).addTo(map);

// 2. Add the dark "fog of war" style basemap tiles.
//    CartoDB's free Dark Matter tiles give us the dark, neon-friendly look
//    without needing an API key. Swap this URL for a different tile
//    provider later if you want a different look.
L.tileLayer(
  "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
  {
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors ' +
      '&copy; <a href="https://carto.com/attributions">CARTO</a>',
    subdomains: "abcd",
    maxZoom: 20,
  }
).addTo(map);

// 3. Claimed turf, persisted in this browser via localStorage.
//    There's no backend yet, so "claiming" only means "claimed on this
//    computer, in this browser" — that's enough to prototype the mechanic.
//    Shape: { [landmarkId]: { claimedAt: "<ISO timestamp>" } }
const CLAIMS_KEY = "vantage:claims";

function loadClaims() {
  try {
    const raw = localStorage.getItem(CLAIMS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (err) {
    // Private browsing, browser settings, etc. can block localStorage —
    // fail quietly and just treat everything as unclaimed.
    console.warn("Couldn't read saved turf claims:", err);
    return {};
  }
}

function saveClaims(claims) {
  try {
    localStorage.setItem(CLAIMS_KEY, JSON.stringify(claims));
  } catch (err) {
    console.warn("Couldn't save turf claims:", err);
  }
}

let claims = loadClaims();

// 4. A custom marker icon — a plain colored dot via CSS instead of the
//    default red Leaflet pin (see .turf-marker in style.css). Claimed
//    turf gets a gold dot instead of a green one.
function makeTurfIcon(isClaimed) {
  return L.divIcon({
    className: `turf-marker ${isClaimed ? "turf-marker--claimed" : ""}`,
    iconSize: [18, 18],
  });
}

// 5. Drop one marker per landmark, and keep a lookup so we can update a
//    marker's icon later when it's claimed or released.
const markersById = {};

LANDMARKS.forEach((landmark) => {
  const isClaimed = Boolean(claims[landmark.id]);
  const marker = L.marker(landmark.coords, {
    icon: makeTurfIcon(isClaimed),
  }).addTo(map);
  marker.on("click", () => showTurfPanel(landmark));
  markersById[landmark.id] = marker;
});

// 6. Wire up the info panel and the claim button.
const turfPanel = document.getElementById("turf-panel");
const turfPanelTitle = document.getElementById("turf-panel-title");
const turfPanelDesc = document.getElementById("turf-panel-desc");
const turfPanelClose = document.getElementById("turf-panel-close");
const turfPanelClaim = document.getElementById("turf-panel-claim");
const turfPanelStatus = document.getElementById("turf-panel-status");

let selectedLandmarkId = null;

function refreshClaimUI(landmark) {
  const claim = claims[landmark.id];
  if (claim) {
    turfPanelClaim.textContent = "Release this turf";
    turfPanelClaim.classList.add("claimed");
    const claimedDate = new Date(claim.claimedAt).toLocaleDateString();
    turfPanelStatus.textContent = `Claimed on ${claimedDate}`;
  } else {
    turfPanelClaim.textContent = "Claim this turf";
    turfPanelClaim.classList.remove("claimed");
    turfPanelStatus.textContent = "Unclaimed";
  }
}

function showTurfPanel(landmark) {
  selectedLandmarkId = landmark.id;
  turfPanelTitle.textContent = landmark.name;
  turfPanelDesc.textContent = landmark.description;
  refreshClaimUI(landmark);
  turfPanel.classList.remove("hidden");
}

function hideTurfPanel() {
  turfPanel.classList.add("hidden");
  selectedLandmarkId = null;
}

turfPanelClose.addEventListener("click", hideTurfPanel);

turfPanelClaim.addEventListener("click", () => {
  if (!selectedLandmarkId) return;
  const landmark = LANDMARKS.find((l) => l.id === selectedLandmarkId);
  const alreadyClaimed = Boolean(claims[selectedLandmarkId]);

  if (alreadyClaimed) {
    delete claims[selectedLandmarkId];
  } else {
    claims[selectedLandmarkId] = { claimedAt: new Date().toISOString() };
  }

  saveClaims(claims);
  markersById[selectedLandmarkId].setIcon(
    makeTurfIcon(!alreadyClaimed)
  );
  refreshClaimUI(landmark);
});
