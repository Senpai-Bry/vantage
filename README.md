# Vantage

A GPS-based, turf-control photography game. Players explore a city, claim
"turf" around real landmarks by completing photo challenges there, and hold
that turf against other players — inspired by *The Warriors* more than a
shrinking-zone battle royale.

This is the very first step: a working map screen. No backend, no accounts,
no challenges yet — just Leaflet.js rendering real OpenStreetMap data with
a dark, fog-of-war style and a couple of real landmarks in Goose Creek, SC
as placeholder turf zones.

## Running it

No build step, no install. Just open `index.html` in a browser.

- **Easiest:** double-click `index.html` in File Explorer.
- **Or**, if you have VS Code, install the "Live Server" extension, right
  click `index.html`, and choose "Open with Live Server" — this is nicer
  because the page auto-reloads whenever you save a change.

## Project structure

```
vantage/
├── index.html        the page itself — loads Leaflet, then our scripts
├── css/
│   └── style.css      dark theme, header, turf marker glow, info panel
├── js/
│   ├── landmarks.js    the data — one object per turf zone (name, coords, description)
│   └── app.js          the logic — creates the map, drops markers, wires up clicks
└── assets/             (empty for now — icons/images go here later)
```

`landmarks.js` is deliberately separate from `app.js`: to add a new turf
zone, you only ever touch the `LANDMARKS` array — you never need to touch
the map logic itself.

## How the map works, in plain terms

1. `L.map("map")` creates a Leaflet map inside the `<div id="map">` in
   `index.html`, centered on Goose Creek.
2. `L.tileLayer(...)` tells Leaflet where to download the actual map
   images ("tiles") from. We're using CartoDB's free "Dark Matter" tiles —
   real OpenStreetMap data, styled dark — no API key required.
3. For each landmark in `landmarks.js`, we drop a glowing green marker
   (`L.marker`) and listen for a click on it. Clicking a marker slides up
   the info panel at the bottom-left with that zone's name and description.

## Next steps (not built yet)

- Real "claiming" mechanic — right now clicking a marker just shows info,
  it doesn't claim anything.
- Photo challenge flow (upload/take a photo at a zone to claim it).
- Accounts + a real backend to persist who owns which turf.
- Skill-based divisions instead of one global leaderboard.
- Step-counter / distance-tracking element.
- Swap the two placeholder landmarks for the full landmark list you want
  in v1, and fix up their coordinates if they're not pinned precisely
  enough (the ones here came from public map listings, not hand-verified
  GPS).

## A note on coordinates

The coordinates in `landmarks.js` are approximate, pulled from public
sources (school directory listings, the city's own contact page). They're
close enough to prototype with, but nudge them if you want a marker sitting
exactly on a building — right-click the spot on Google Maps to copy exact
coordinates, then paste them into the `coords` array for that landmark.
