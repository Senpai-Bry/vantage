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
//   city        which town it's in — the explore feed's city filters are
//               made from these, so a new city gets its own chip for free
//   coords      [latitude, longitude]
//   description shown under the title in the info panel
//   challenges  the pool of photo prompts this zone rotates through — add
//               as many as you want; a zone cycles to the next one on a
//               timer (see CHALLENGE_ROTATION_HOURS in .env)
//
// Optional, for scripts/fetch-photos.js (the card photo before anyone has
// shot a zone):
//   wikipedia   the exact Wikipedia article title, if it isn't the same as
//               `name`
//   photo       a specific Wikimedia Commons file to use instead, e.g.
//               "File:Some photo.jpg" — handy if the automatic pick is bad
//
// A note on accuracy: coordinates below come from a few different sources —
// Wikipedia infobox coordinates and the National Register of Historic
// Places listings pages (both very precise, since they're meant to pinpoint
// a real building or site), Apple Maps place data, and — for a handful
// marked "approximate" in a comment — geocoded from a real street address
// on the right road, which can be off by a house or two. Nudge any of them
// if you spot one sitting off. To find an exact coordinate yourself,
// right-click the spot on Google Maps and copy the lat/lng it shows you.

const LANDMARKS = [
  {
    id: "goose-creek-high-school",
    name: "Goose Creek High School",
    city: "Goose Creek",
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
    city: "Goose Creek",
    coords: [33.015392, -80.083189], // geocoded from 951 Crowfield Blvd
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
    city: "Goose Creek",
    wikipedia: "St. James Church, Goose Creek",
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
    name: "The City of Goose Creek",
    city: "Goose Creek",
    coords: [33.02826, -80.03587], // 519 N Goose Creek Blvd, verified on Google Maps
    description:
      "The Marguerite H. Brown Municipal Center on North Goose Creek " +
      "Boulevard — houses City Hall, the Police Department, and " +
      "Municipal Court.",
    challenges: [
      "Frame the building's main entrance.",
      "Capture the city seal or flag out front.",
      "Get a wide shot showing the whole building.",
    ],
  },

  // --- Goose Creek (3 more) -----------------------------------------------
  {
    id: "otranto-indigo-vats",
    name: "Otranto Plantation Indigo Vats",
    city: "Goose Creek",
    coords: [32.983889, -79.9325], // NRHP-listed, coordinates from the National Register
    description:
      "The weathered brick remains of a colonial-era indigo processing " +
      "site, tucked into the woods off Otranto Road — one of the few " +
      "physical traces left of the indigo trade that once built " +
      "Lowcountry fortunes.",
    challenges: [
      "Frame the old vats up close.",
      "Capture the ruins swallowed by the surrounding woods.",
      "Get a wide shot that shows the site's full layout.",
    ],
  },
  {
    id: "naval-weapons-station-charleston",
    name: "Naval Weapons Station Charleston",
    city: "Goose Creek",
    coords: [32.9655, -79.971306],
    description:
      "The main gate of the Navy's weapons station, straddling the line " +
      "between Goose Creek and North Charleston — a reminder of how " +
      "much of this area's identity runs through the military. Shoot " +
      "from outside the fence line only.",
    challenges: [
      "Frame the entrance sign and flag.",
      "Capture the gate from across the road.",
      "Get a shot that shows the perimeter fencing.",
    ],
  },
  {
    id: "crowfield-golf-club",
    name: "Crowfield Golf & Country Club",
    city: "Goose Creek",
    coords: [33.009107, -80.084814], // approximate — geocoded from a Hamlet Cir address; clubhouse is at 300 Hamlet Cir
    description:
      "A public golf course laid out across the old Crowfield " +
      "Plantation grounds, complete with the plantation's original " +
      "moss-draped avenue of oaks.",
    challenges: [
      "Frame the clubhouse entrance.",
      "Capture the oak allée along the drive.",
      "Get a wide shot of a fairway at sunset.",
    ],
  },

  // --- North Charleston (5) ------------------------------------------------
  {
    id: "riverfront-park",
    name: "Riverfront Park",
    city: "North Charleston",
    coords: [32.8697835, -79.9667466], // 1001 Everglades Dr, verified via mapping data
    description:
      "A waterfront park built on the site of the old Charleston Naval " +
      "Base, with sweeping views across the Cooper River — one of " +
      "North Charleston's most-visited green spaces.",
    challenges: [
      "Frame the river view from the pier.",
      "Capture the park's walking paths.",
      "Get a sunset shot over the water.",
    ],
  },
  {
    id: "north-charleston-coliseum-pac",
    name: "North Charleston Coliseum & Performing Arts Center",
    city: "North Charleston",
    coords: [32.8655037, -80.022409], // 5001 Coliseum Dr, verified via mapping data
    description:
      "The city's biggest arena and theater complex, on Coliseum Drive " +
      "— home to concerts, hockey, and conventions alike.",
    challenges: [
      "Frame the main entrance and marquee.",
      "Capture the building's exterior architecture.",
      "Get a wide shot from the parking lot.",
    ],
  },
  {
    id: "park-circle",
    name: "Park Circle",
    city: "North Charleston",
    coords: [32.8812859, -79.9850877], // verified via topographic map data
    description:
      "The literal traffic circle at the heart of North Charleston's " +
      "Park Circle neighborhood, now surrounded by the breweries and " +
      "shops that gave the area its comeback.",
    challenges: [
      "Frame the circle itself from street level.",
      "Capture the neighborhood storefronts around it.",
      "Get a shot that shows the park at its center.",
    ],
  },
  {
    id: "chicora-graded-school",
    name: "Chicora Graded School",
    city: "North Charleston",
    coords: [32.85583, -79.96889], // NRHP-listed, 1912 Success St
    description:
      "A historic schoolhouse on Success Street, listed on the " +
      "National Register — one of the oldest surviving school " +
      "buildings in North Charleston.",
    challenges: [
      "Frame the school's front facade.",
      "Capture a close-up of the building's period details.",
      "Get a wide shot showing the whole structure.",
    ],
  },
  {
    id: "charleston-navy-yard-historic-district",
    name: "Charleston Navy Yard Historic District",
    city: "North Charleston",
    coords: [32.86194, -79.96278], // NRHP-listed
    description:
      "The historic core of the old Charleston Naval Base — the same " +
      "shipyard where the Confederate submarine H.L. Hunley is " +
      "conserved today.",
    challenges: [
      "Frame one of the district's historic brick buildings.",
      "Capture the old shipyard's industrial character.",
      "Get a wide shot of the waterfront here.",
    ],
  },

  // --- Summerville (6) ------------------------------------------------------
  {
    id: "colonial-dorchester-shs",
    name: "Colonial Dorchester State Historic Site",
    city: "Summerville",
    coords: [32.95028, -80.17028], // NRHP-listed ("Old Dorchester"), 300 State Park Rd
    description:
      "The ruins of Fort Dorchester and a colonial bell tower mark the " +
      "site of one of South Carolina's earliest inland settlements, on " +
      "the banks of the Ashley River.",
    challenges: [
      "Frame the tabby fort ruins.",
      "Capture the bell tower against the sky.",
      "Get a wide shot of the riverside setting.",
    ],
  },
  {
    id: "old-white-meeting-house",
    name: "Old White Meeting House Ruins and Cemetery",
    city: "Summerville",
    coords: [32.96556, -80.19472], // NRHP-listed
    description:
      "The brick ruins of a colonial-era church, destroyed in the 1886 " +
      "Charleston earthquake, standing watch over a centuries-old " +
      "cemetery.",
    challenges: [
      "Frame the ruined walls against the trees.",
      "Capture the old headstones in the cemetery.",
      "Get a close-up of the brickwork detail.",
    ],
  },
  {
    id: "summerville-historic-district",
    name: "Downtown Summerville Historic District",
    city: "Summerville",
    wikipedia: "Summerville Historic District",
    coords: [33.01472, -80.18306], // NRHP-listed
    description:
      "The tree-lined heart of old Summerville, built around " +
      "Hutchinson Square and Main Street — the town's original " +
      "'pine belt' resort district.",
    challenges: [
      "Frame Main Street from the sidewalk.",
      "Capture one of the historic homes or storefronts.",
      "Get a shot under the live oaks.",
    ],
  },
  {
    id: "middleton-place",
    name: "Middleton Place",
    city: "Summerville",
    coords: [32.90528, -80.1375], // NRHP-listed
    description:
      "One of America's oldest landscaped gardens, laid out on a bend " +
      "of the Ashley River — still blooming on the grounds of a former " +
      "rice plantation.",
    challenges: [
      "Frame the terraced gardens.",
      "Capture the reflection in the Butterfly Lakes.",
      "Get a wide shot of the river from the bluff.",
    ],
  },
  {
    id: "azalea-park",
    name: "Azalea Park",
    city: "Summerville",
    coords: [33.014508, -80.179958], // 105 W 5th South St, cross-checked against two sources
    description:
      "Home of the Flowertown Festival every spring, when the whole " +
      "park turns pink and white with blooming azaleas.",
    challenges: [
      "Frame the park's sculpture garden.",
      "Capture the azaleas in bloom (or the bare bushes off-season).",
      "Get a wide shot of the walking paths.",
    ],
  },
  {
    id: "ashley-river-road",
    name: "Ashley River Road",
    city: "Summerville",
    coords: [32.88972, -80.12083], // NRHP-listed
    description:
      "A National Historic Landmark corridor lined with centuries-old " +
      "live oaks, connecting Summerville to Charleston's grand " +
      "plantation row.",
    challenges: [
      "Frame the oak canopy over the road.",
      "Capture the Spanish moss up close.",
      "Get a shot looking straight down the road.",
    ],
  },

  // --- Daniel Island (4) -----------------------------------------------------
  {
    id: "credit-one-stadium",
    name: "Credit One Stadium",
    city: "Daniel Island",
    coords: [32.86254, -79.90392], // approximate — geocoded from a neighboring Seven Farms Dr address
    description:
      "The largest stadium built specifically for women's tennis in " +
      "the world, home to the Charleston Open every spring.",
    challenges: [
      "Frame the main entrance plaza.",
      "Capture the stadium bowl from the stands.",
      "Get a wide shot of the grounds.",
    ],
  },
  {
    id: "musc-health-stadium",
    name: "MUSC Health Stadium",
    city: "Daniel Island",
    coords: [32.8702487, -79.919538], // 1990 Daniel Island Dr, verified via Wikipedia
    description:
      "Home pitch of the Charleston Battery, one of the oldest " +
      "professional soccer clubs in the country.",
    challenges: [
      "Frame the pitch from the stands.",
      "Capture the entrance gates.",
      "Get a wide shot of the stadium exterior.",
    ],
  },
  {
    id: "etiwan-park",
    name: "Etiwan Park",
    city: "Daniel Island",
    coords: [32.856, -79.9253], // 453 Seven Farms Dr, verified via Wikipedia
    description:
      "A small waterfront park on Seven Farms Drive with sweeping " +
      "marsh views out toward the Wando River.",
    challenges: [
      "Frame the marsh view at low tide.",
      "Capture the park's walking path.",
      "Get a sunset shot over the water.",
    ],
  },
  {
    id: "pierce-park",
    name: "Pierce Park",
    city: "Daniel Island",
    coords: [32.8468855, -79.9048625], // approximate — geocoded from a nearby Pierce St address
    description:
      "A neighborhood park and pool overlooking the Wando River, " +
      "tucked into one of Daniel Island's oldest residential sections.",
    challenges: [
      "Frame the pavilion.",
      "Capture the river view from the park.",
      "Get a wide shot of the walking trails.",
    ],
  },
];

module.exports = LANDMARKS;
