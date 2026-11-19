# Vantage

**Street photography as a turf war.** Vantage splits a city into zones around
real landmarks. Each zone has a photo challenge. Players go there, shoot it, and
the community votes. The top-voted photo holds the zone, and the map is colored
by who holds what. There's no countdown: you keep your turf until someone takes
a better shot.

**Play it live: [vantageturf.com](https://vantageturf.com)**

Built by Bryan Hurst ([Senpai-Bry](https://github.com/Senpai-Bry)) as a
full-stack portfolio project. The first version covers 22 landmarks across
Goose Creek, North Charleston, Summerville and Daniel Island, South Carolina.

## Features

- **Real map, real borders.** Zone borders are generated from OpenStreetMap
  road data, so each zone is bounded by major roads (about half a mile across
  at most), neighboring zones share an edge, and none overlap.
- **Rotating photo challenges.** Every zone has a prompt (for example, "Frame
  the oak canopy over the road") that changes every 72 hours.
- **Geofence with check-ins.** To submit, you have to prove you were there.
  Either upload while your phone shows you inside the zone's border (with 30
  meters of slack for GPS drift), or **check in** there and then upload from
  anywhere within 48 hours. That way photographers can shoot on a camera,
  edit at home, and post from a laptop.
- **Photo location check.** If a photo has a location tag saved in it and
  that tag is far from the zone, it's rejected.
- **Big camera photos just work.** The browser shrinks photos to 2560 pixels
  before uploading, so 20 MB camera JPGs upload fast.
- **Photos keep players private.** Every photo is redrawn in the browser and
  again on the server, which removes hidden details like the exact GPS
  location and camera serial number, and turns sideways phone photos the
  right way up.
- **Community voting.** One vote per photo, no voting for your own. When a
  rival's photo gets more votes, the zone changes hands.
- **Leaderboard.** 10 points per zone held, plus 1 point per vote received.
- **Explore feed.** Scrollable zone cards next to the map, with filters (Near
  me, Open turf, Your turf, Hot right now, by city) and a List/Map switch on
  phones.
- **Player profiles** at `/u/<username>`: picture, bio, home city, camera gear,
  stats, turf held and every photo submitted.
- **Rules enforced on the server.** Logins, the geofence, voting and uploads are
  all checked by the server, so going around the app's buttons doesn't work.

## Tech stack

| Part | Tools |
| --- | --- |
| Frontend | HTML, CSS, plain JavaScript (no framework), Leaflet.js |
| Backend | Node.js, Express |
| Database | SQLite (better-sqlite3) |
| Accounts | bcryptjs password hashing, JSON Web Tokens |
| Uploads | Multer (JPG, PNG or WebP), resized in the browser with Canvas, cleaned on the server with sharp |
| Abuse protection | express-rate-limit |
| Map data | OpenStreetMap (via the Overpass API), JSTS for border geometry, Esri map tiles |
| Hosting | Railway (with a persistent disk for the database and photos), Porkbun DNS |

## Running it locally

You need [Node.js](https://nodejs.org/) (any LTS version).

```
cd server
npm install
npm start
```

Then open **http://localhost:5000**. The server serves both the website and
the API, so that's the only address you need. Press `Ctrl+C` in the terminal
to stop it.

Settings are optional. To change them, copy `server/.env.example` to
`server/.env`. Useful ones while testing:

- `GEOFENCE=off` lets you submit photos without being at the zone.
- `CHALLENGE_ROTATION_HOURS=0.02` rotates challenges about once a minute.
- `CHECKIN_HOURS=0.02` makes check-ins expire after about a minute (48 is
  the real setting).
- `RATE_LIMITS=off` turns off the speed limits (below) while you test.
- `JWT_SECRET` signs login sessions. If you leave it out, the server generates
  one and saves it next to the database.

`.env`, the database and uploaded photos are kept out of Git on purpose.

## Project structure

```
vantage/
├── index.html              the single page the app runs in
├── css/style.css           all styling
├── js/
│   ├── api.js              fetch helper, login token storage, shared helpers
│   ├── auth.js             sign up / log in / log out and the account menu
│   ├── photo.js            reads a photo's location tag, shrinks big photos
│   ├── app.js              the map, turf borders, the zone panel (check in, submit, vote)
│   ├── feed.js             explore feed: zone cards, filters, List/Map switch
│   ├── leaderboard.js      leaderboard panel
│   └── profile.js          profile pages and the Edit profile window
└── server/
    ├── index.js            starts the server: API routes + the website's files
    ├── config.js           reads settings from .env
    ├── db/index.js         creates the SQLite tables and loads the zones
    ├── data/
    │   ├── landmarks.js    the 22 zones and their challenge prompts
    │   ├── boundaries.json generated turf borders
    │   └── landmark-photos.json  credited Wikimedia cover photos
    ├── lib/                challenges, check-ins, geofence, scores, uploads, photos
    ├── middleware/auth.js  checks the login token on protected routes
    ├── routes/             auth, zones, submissions + votes, leaderboard, users
    └── scripts/            fetch-osm, build-turf, fetch-photos (data builders)
```

**Adding a zone:** add an entry to `server/data/landmarks.js`, then rebuild the
borders with `npm run fetch-osm` and `npm run build-turf` (inside `server/`)
and restart the server.

## Security notes

- Passwords are stored only as bcrypt hashes.
- Usernames are 3-20 letters, numbers, `_` or `-`, and capitals don't count as
  a different name, so nobody can pose as another player.
- Uploads must be real photos: every file is opened and redrawn as a fresh
  JPG, so a disguised file is rejected and can never run as a web page.
  Uploads are also served with `nosniff`.
- Hidden photo details (GPS location, camera serial number, time taken) are
  removed before photos are stored.
- Speed limits stop fake-account voting and password guessing: 5 new
  accounts per hour per connection, 10 wrong passwords per 15 minutes,
  30 photos per hour per player, and limits on votes and check-ins. On
  Railway, visitors are told apart by the `X-Real-IP` header, which
  Railway's edge sets and visitors can't fake.
- Only the website's own files (`index.html`, `css/`, `js/`, `assets/`) are
  served. The server code, database and `.git` folder stay private.
- Everything players type is shown as plain text, never as HTML.
- A deleted account's old login stops working right away.

## What's next

- A countdown on each zone showing when the next challenge starts
- An in-app camera that records location at the moment of the shot
- Crews (team play)
- Skill-based divisions instead of one leaderboard
- Step and distance tracking
- Sponsored zones for local businesses

## Credits

Map data © OpenStreetMap contributors. Map tiles © Esri. Landmark cover
photos are from Wikimedia Commons and credited in the app.
