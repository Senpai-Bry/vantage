// server/db/index.js
//
// Opens (and creates, if it doesn't exist yet) the SQLite database file,
// makes sure the schema exists, and seeds the zones + zone_challenges
// tables from data/landmarks.js. Every other file in the server just does
// `const db = require("../db")` and gets back a ready-to-query
// better-sqlite3 database.

const Database = require("better-sqlite3");
const config = require("../config");
const LANDMARKS = require("../data/landmarks");

const db = new Database(config.dbPath);
db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS zones (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    description TEXT
  );

  CREATE TABLE IF NOT EXISTS claims (
    zone_id TEXT PRIMARY KEY REFERENCES zones(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    claimed_at INTEGER NOT NULL
  );

  -- The pool of photo prompts each zone rotates through. "position" is the
  -- prompt's place in that zone's list in landmarks.js (0, 1, 2, ...).
  CREATE TABLE IF NOT EXISTS zone_challenges (
    zone_id TEXT NOT NULL REFERENCES zones(id),
    position INTEGER NOT NULL,
    prompt TEXT NOT NULL,
    PRIMARY KEY (zone_id, position)
  );

  -- A photo someone submitted to a zone, answering whichever challenge was
  -- current at the moment they submitted it.
  CREATE TABLE IF NOT EXISTS submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    zone_id TEXT NOT NULL REFERENCES zones(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    challenge_index INTEGER NOT NULL,
    photo_path TEXT NOT NULL,
    created_at INTEGER NOT NULL
  );

  -- One vote = one row. The primary key being (submission_id, user_id)
  -- is what makes "one vote per person per photo" a database guarantee
  -- instead of something the application code has to remember to check.
  CREATE TABLE IF NOT EXISTS votes (
    submission_id INTEGER NOT NULL REFERENCES submissions(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (submission_id, user_id)
  );
`);

// --- Migration: add the two rotation columns to `zones` if this database
// was created before they existed. CREATE TABLE IF NOT EXISTS above won't
// touch a table that already exists, so a zones table from before this
// feature existed needs these columns added by hand, once, safely.
const zoneColumns = db.prepare("PRAGMA table_info(zones)").all().map((c) => c.name);
if (!zoneColumns.includes("current_challenge_index")) {
  db.exec("ALTER TABLE zones ADD COLUMN current_challenge_index INTEGER NOT NULL DEFAULT 0");
}
if (!zoneColumns.includes("challenge_rotated_at")) {
  db.exec("ALTER TABLE zones ADD COLUMN challenge_rotated_at INTEGER");
}

// Seed zones from the landmarks list. INSERT OR IGNORE means this is safe
// to run on every startup — a zone that's already there (matched by its
// slug id) is left alone, so existing claims/submissions never get wiped
// out just by restarting the server.
const insertZone = db.prepare(
  "INSERT OR IGNORE INTO zones (id, name, lat, lng, description) VALUES (?, ?, ?, ?, ?)"
);
// Keeps name/coords/description in sync with landmarks.js on every
// startup — e.g. if you nudge a coordinate, this is what actually applies
// that fix to a zone that was already seeded. It never touches claims,
// submissions, or votes, so this is always safe to run.
const updateZone = db.prepare(
  "UPDATE zones SET name = ?, lat = ?, lng = ?, description = ? WHERE id = ?"
);
const insertChallenge = db.prepare(
  "INSERT OR IGNORE INTO zone_challenges (zone_id, position, prompt) VALUES (?, ?, ?)"
);
for (const landmark of LANDMARKS) {
  insertZone.run(
    landmark.id,
    landmark.name,
    landmark.coords[0],
    landmark.coords[1],
    landmark.description
  );
  updateZone.run(
    landmark.name,
    landmark.coords[0],
    landmark.coords[1],
    landmark.description,
    landmark.id
  );
  (landmark.challenges || []).forEach((prompt, position) => {
    insertChallenge.run(landmark.id, position, prompt);
  });
}

// Give every zone a starting point for its rotation timer, so the "has it
// been long enough to rotate?" math in lib/challenges.js always has a real
// timestamp to compare against.
db.prepare(
  "UPDATE zones SET challenge_rotated_at = ? WHERE challenge_rotated_at IS NULL"
).run(Date.now());

module.exports = db;
