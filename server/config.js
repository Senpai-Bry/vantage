// server/config.js
//
// All the server's tunable settings in one place, read from environment
// variables (see .env.example — copy it to .env and fill in your own
// values; .env itself is gitignored so secrets never get committed).

require("dotenv").config();

const config = {
  port: process.env.PORT || 5000,
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5000",
  jwtSecret: process.env.JWT_SECRET,
  dbPath: process.env.DB_PATH || require("path").join(__dirname, "db", "vantage.db"),

  // How often each zone's photo challenge rotates to the next prompt in its
  // list. 24 (hours) is the real setting; while testing locally, set this
  // to something tiny in your .env (e.g. 0.02, about a minute) so you don't
  // have to wait a full day to see a rotation happen.
  // Geofence: when on, a photo is only accepted if the player's phone says
  // they're inside the zone. Set GEOFENCE=off in .env to test from home
  // (or keep it on and fake your location with Chrome DevTools — see README).
  geofenceEnabled: (process.env.GEOFENCE || "on").toLowerCase() !== "off",

  challengeRotationMs:
    Number(process.env.CHALLENGE_ROTATION_HOURS || 24) * 60 * 60 * 1000,
};

// Fail loudly at startup rather than silently signing tokens with
// "undefined" — a missing secret is a config mistake you want to know
// about immediately, not discover later as a security hole.
if (!config.jwtSecret) {
  throw new Error(
    "Missing JWT_SECRET. Copy server/.env.example to server/.env and set a value."
  );
}

module.exports = config;
