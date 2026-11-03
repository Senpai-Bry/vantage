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
  // Where uploaded player photos are saved. Locally that's server/uploads;
  // on Railway it points at the persistent volume (e.g. /data/uploads) so
  // photos survive restarts and redeploys.
  uploadDir: process.env.UPLOAD_DIR || require("path").join(__dirname, "uploads"),

  // How often each zone's photo challenge rotates to the next prompt in its
  // list. 72 (hours, i.e. every 3 days) is the real setting; while testing locally, set this
  // to something tiny in your .env (e.g. 0.02, about a minute) so you don't
  // have to wait a full day to see a rotation happen.
  // Geofence: when on, a photo is only accepted if the player's phone says
  // they're inside the zone. Set GEOFENCE=off in .env to test from home
  // (or keep it on and fake your location with Chrome DevTools — see README).
  geofenceEnabled: (process.env.GEOFENCE || "on").toLowerCase() !== "off",

  challengeRotationMs:
    Number(process.env.CHALLENGE_ROTATION_HOURS || 72) * 60 * 60 * 1000,
};

// No JWT_SECRET set (e.g. on Railway)? Make one automatically and save it
// in a file next to the database, so it stays the same across restarts and
// redeploys (on Railway that file lives on the persistent /data volume).
// The secret never appears in code, git, or the Railway dashboard.
if (!config.jwtSecret) {
  const fs = require("fs");
  const path = require("path");
  const secretFile = path.join(path.dirname(config.dbPath), ".jwt-secret");
  if (fs.existsSync(secretFile)) {
    config.jwtSecret = fs.readFileSync(secretFile, "utf8").trim();
  } else {
    config.jwtSecret = require("crypto").randomBytes(32).toString("hex");
    fs.mkdirSync(path.dirname(secretFile), { recursive: true });
    fs.writeFileSync(secretFile, config.jwtSecret, { mode: 0o600 });
    console.log("No JWT_SECRET set, so generated one and saved it next to the database.");
  }
}

module.exports = config;
