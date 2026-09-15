# Vantage

A GPS-based, turf-control photography game. Players explore a city, claim
"turf" around real landmarks by completing photo challenges there, and hold
that turf against other players — inspired by *The Warriors* more than a
shrinking-zone battle royale.

This is the first step: a working map screen with a basic claim mechanic.
No accounts or backend yet — Leaflet.js renders real OpenStreetMap data in
a dark, fog-of-war style, with four real landmarks in Goose Creek, SC as
turf zones you can click and claim. Claims are saved in your browser
(via `localStorage`), so they stick around between visits, but they're
local to whichever browser you claimed them in — nothing is shared between
devices or players yet.

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
3. For each landmark in `landmarks.js`, we drop a glowing marker
   (`L.marker`) — green if unclaimed, gold if claimed — and listen for a
   click on it. Clicking a marker slides up the info panel at the
   bottom-left with that zone's name, description, and a claim button.
4. Clicking "Claim this turf" saves a `{ claimedAt: <timestamp> }` record
   for that landmark's id into `localStorage` under the key
   `vantage:claims`, turns its marker gold, and swaps the button to
   "Release this turf" so you can undo it. Reloading the page reads that
   same `localStorage` key back out, so claimed turf stays claimed.

## Next steps (not built yet)

- Photo challenge flow (upload/take a photo at a zone to actually earn a
  claim, instead of just clicking a button).
- Accounts + a real backend, so claims are shared across players and
  devices instead of living only in one browser's `localStorage`.
- Skill-based divisions instead of one global leaderboard.
- Step-counter / distance-tracking element.
- Add more landmarks to `landmarks.js` for the full v1 list, and
  double-check any coordinates you're not sure about (see below).

## A note on coordinates

The coordinates in `landmarks.js` are pulled from public sources (school
directory listings, Wikipedia, the city's own contact page). Goose Creek
High School, St. James Church, and Stratford High School are solid; Goose
Creek City Hall is a close estimate off its street address rather than a
verified pin. Nudge any of them if you want a marker sitting exactly on a
building — right-click the spot on Google Maps to copy exact coordinates,
then paste them into that landmark's `coords` array.
