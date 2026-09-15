// landmarks.js
//
// This is your "turf zone" data. Each landmark becomes a claimable zone on
// the map. Add more objects to this array as you find more real landmarks
// to include — nothing else in the app needs to change.
//
// coords are approximate (pulled from public map data) — nudge them if you
// want a marker sitting exactly on a building.

const LANDMARKS = [
  {
    id: "goose-creek-high",
    name: "Goose Creek High School",
    coords: [33.00366, -79.99772],
    description: "Home of the Gators. A founding turf zone for Vantage.",
  },
  {
    id: "goose-creek-city-hall",
    name: "Goose Creek City Hall",
    coords: [32.9814, -80.0329],
    description: "519 North Goose Creek Blvd — the seat of city government.",
  },
  {
    id: "st-james-church",
    name: "St. James Church",
    coords: [32.97549, -80.032670],
    description:
      "Built in the 1710s — one of South Carolina's oldest surviving buildings and one of a handful of early Georgian chapels left in the country.",
  },
  {
    id: "stratford-high",
    name: "Stratford High School",
    coords: [33.022484, -80.09841],
    description: "951 Crowfield Blvd — home of the Knights, on the west side of the city.",
  },
];

// Roughly the center of Goose Creek, SC — used to point the map here on load.
const MAP_CENTER = [32.9812, -80.0331];
const MAP_DEFAULT_ZOOM = 13;
