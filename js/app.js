// app.js
//
// This file sets up the Leaflet map and drops a marker for every entry in
// LANDMARKS (defined in landmarks.js). Read it top to bottom — each step is
// commented so you can see what each Leaflet call is doing.

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

// 3. A custom neon-glow marker icon (a plain colored dot via CSS instead of
//    the default red Leaflet pin — see .turf-marker in style.css).
const turfIcon = L.divIcon({
  className: "turf-marker",
  iconSize: [18, 18],
});

// 4. Drop one marker per landmark, and wire up the info panel.
const turfPanel = document.getElementById("turf-panel");
const turfPanelTitle = document.getElementById("turf-panel-title");
const turfPanelDesc = document.getElementById("turf-panel-desc");
const turfPanelClose = document.getElementById("turf-panel-close");

function showTurfPanel(landmark) {
  turfPanelTitle.textContent = landmark.name;
  turfPanelDesc.textContent = landmark.description;
  turfPanel.classList.remove("hidden");
}

function hideTurfPanel() {
  turfPanel.classList.add("hidden");
}

turfPanelClose.addEventListener("click", hideTurfPanel);

LANDMARKS.forEach((landmark) => {
  const marker = L.marker(landmark.coords, { icon: turfIcon }).addTo(map);
  marker.on("click", () => showTurfPanel(landmark));
});
