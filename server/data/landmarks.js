// server/data/landmarks.js
//
// The master list of turf zones. This now lives on the server (not in the
// browser) because zone ownership is shared across every player — the
// server is the one source of truth everyone talks to.
//
// To add a new zone: add an object here, then restart the server. It gets
// seeded into the zones table automatically on startup (see db/index.js).
//
// Fields:
//   id          unique slug — also used as the primary key in the database
//   name        shown as the title in the info panel
//   coords      [latitude, longitude]
//   description shown under the title in the info panel
//   challenges  the pool of photo prompts this zone rotates through — add
//               as many as you want; a zone cycles to the next one on a
//               timer (see CHALLENGE_ROTATION_HOURS in .env)
//
// A note on accuracy: Goose Creek High School, St. James Church, and
// Stratford High School are sourced from public mapping data and should be
// accurate. Goose Creek City Hall is a rough estimate based on its street
// address, not a verified pin — nudge it if you spot it sitting off the
// building. To find an exact coordinate, right-click the spot on Google
// Maps and copy the lat/lng it shows you.

const LANDMARKS = [
  {
    id: "goose-creek-high-school",
    name: "Goose Creek High School",
    coords: [32.97412, -80.01635],
    description:
      "Home of the Gators, on Redbank Road. One of the two big public " +
      "high schools anchoring this side of Goose Creek.",
    challenges: [
      "Get the Gators mascot or a school mural in frame.",
      "Frame the school sign with the marquee visible.",
      "Shoot the front entrance from across the parking lot.",
    ],
  },
  {
    id: "stratford-high-school",
    name: "Stratford High School",
    coords: [33.0127, -80.0859],
    description:
      "Home of the Knights, on Crowfield Boulevard — the other half of " +
      "the district's cross-town rivalry.",
    challenges: [
      "Capture the Knights mascot or a school banner.",
      "Frame the main entrance sign.",
      "Get a wide shot of the whole front facade.",
    ],
  },
  {
    id: "st-james-church",
    name: "St. James Church",
    coords: [32.97549, -80.03267],
    description:
      "A colonial-era Anglican parish church, one of the oldest " +
      "buildings in the area and a genuine historic landmark.",
    challenges: [
      "Frame the steeple against the sky.",
      "Capture the historic churchyard.",
      "Get a close-up of the entrance doors.",
    ],
  },
  {
    id: "goose-creek-city-hall",
    name: "Goose Creek City Hall",
    coords: [32.9807, -80.0247],
    description:
      "Seat of city government on North Goose Creek Boulevard. " +
      "(Coordinate is an estimate — see the note at the top of this file.)",
    challenges: [
      "Frame the building's main entrance.",
      "Capture the city seal or flag out front.",
      "Get a wide shot showing the whole building.",
    ],
  },
];

module.exports = LANDMARKS;
