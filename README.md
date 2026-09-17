# Vantage

A GPS-based, turf-control photography game. Players explore a city, claim
"turf" around real landmarks by completing photo challenges there, and hold
that turf against other players — inspired by *The Warriors* more than a
shrinking-zone battle royale.

This step adds accounts and a real backend: claims now live in a shared
database instead of one browser's `localStorage`, so everyone sees the same
map. Leaflet.js still renders real OpenStreetMap data in a dark, fog-of-war
style, with four real landmarks in Goose Creek, SC as turf zones you can
click and claim — but now you sign up, log in, and your claims are visible
to anyone else who opens the app.

Still not built: the actual photo-challenge flow (see "Next steps" below).
Claiming and releasing turf is still just a button for now.

## Running it

Unlike the first prototype, this now needs Node.js (which includes npm)
installed, because there's a real server. If you don't have it, install it
from [nodejs.org](https://nodejs.org/) first — any LTS version works.

1. **Install the server's dependencies** (one-time, or whenever
   `server/package.json` changes):
   ```
   cd server
   npm install
   ```
2. **Create your local config.** Copy `server/.env.example` to `server/.env`
   and fill in a `JWT_SECRET` (a random string used to sign login sessions —
   the example file has a command that generates one for you). `.env` is
   gitignored on purpose; it's your local secret, never commit it.
3. **Start the server:**
   ```
   npm start
   ```
   (still inside the `server/` folder). You should see
   `Vantage server running at http://localhost:5000`.
4. **Open the app:** go to `http://localhost:5000` in your browser. The
   server serves the frontend files itself, so that's the only URL you
   need — you don't open `index.html` directly anymore, and you don't need
   Live Server for this step.

To stop the server, go back to that terminal and press `Ctrl+C`.

## Project structure

```
vantage/
├── index.html            the page itself — loads Leaflet, then our scripts
├── css/
│   └── style.css          dark theme, header, account panel, turf marker glow, info panel
├── js/
│   ├── api.js              tiny fetch() wrapper + localStorage token helpers
│   ├── auth.js              wires up the sign up / log in / log out panel
│   └── app.js               creates the map, loads zones from the API, handles claim/release
├── assets/                 (empty for now — icons/images go here later)
└── server/
    ├── index.js             starts the server — API routes + serves the frontend
    ├── config.js             reads .env (PORT, JWT_SECRET, CLIENT_ORIGIN)
    ├── db.js                 sets up SQLite, creates tables, seeds zones from data/landmarks.js
    ├── data/
    │   └── landmarks.js       the turf zone list — edit this to add/change a zone
    ├── middleware/
    │   └── auth.js            checks the login token on protected routes
    ├── routes/
    │   ├── auth.js             POST /api/auth/signup, POST /api/auth/login
    │   └── zones.js             GET /api/zones, POST/DELETE /api/zones/:id/claim
    ├── .env.example           template for your local server/.env
    └── db/                    the SQLite database file lives here (gitignored)
```

The zone data moved from a frontend file into `server/data/landmarks.js`,
since ownership is now shared — the server has to be the one source of
truth everyone's browser talks to. To add a new turf zone: add an entry to
that file and restart the server. Nothing else needs to change.

## How it works, in plain terms

**Accounts.** The header has a small sign-up/log-in form. Passwords are
never stored as-is — `server/routes/auth.js` hashes them with `bcryptjs`
before saving, and a successful login gets you back a JWT (a signed token)
that proves who you are without sending your password again. The frontend
keeps that token in `localStorage` and attaches it as an
`Authorization: Bearer <token>` header on any request that needs to know
who you are.

**Zones and claims.** `GET /api/zones` returns every turf zone along with
whoever currently holds it (if anyone). Clicking a marker opens the same
info panel as before, but the claim button now reflects reality for
*everyone*: if someone else holds a zone, you'll see "Already claimed" and
who holds it, and the button is disabled — clicking wouldn't work anyway,
because the server checks ownership on every claim/release request too,
not just the button's disabled state.

**Claiming.** Clicking "Claim this turf" sends `POST /api/zones/:id/claim`
with your login token. The server only allows one claim per zone at a time
(enforced by the database itself, not just application logic), so if two
people click at nearly the same moment, exactly one of them wins and the
other gets a clear "someone already holds that turf" response.

**Releasing.** "Release this turf" sends a `DELETE` to that same URL. Only
the zone's current owner can release it — the server checks this and
returns a 403 for anyone else, even if they somehow bypassed the disabled
button.

## A note on coordinates

The coordinates in `server/data/landmarks.js` are pulled from public
sources (school directory listings, Wikipedia, OpenStreetMap-derived map
data, the city's own contact page). Goose Creek High School, St. James
Church, and Stratford High School are sourced from public mapping data and
should be accurate; Goose Creek City Hall is a close estimate off its
street address rather than a verified pin. Nudge any of them if you want a
marker sitting exactly on a building — right-click the spot on Google Maps
to copy exact coordinates, then paste them into that landmark's `coords`
array.

## Next steps (not built yet)

- Photo challenge flow (upload/take a photo at a zone to actually earn a
  claim, instead of just clicking a button).
- Skill-based divisions instead of one global leaderboard.
- Step-counter / distance-tracking element.
- Add more landmarks to `server/data/landmarks.js` for the full v1 list.
- Deploying the server somewhere real (right now it's local-only —
  `localhost`), so it's not just you and people on your own machine who
  can play.
