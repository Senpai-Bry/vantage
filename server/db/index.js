// server/db/index.js
//
// Opens (and creates, if it doesn't exist yet) the SQLite database file,
// makes sure the schema exists, and seeds the zones table from
// data/landmarks.js. Every other file in the server just does
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
`);

// Seed the zones table from the landmarks list. INSERT OR IGNORE means
// this is safe to run on every startup — a zone that's already there
// (matched by its slug id) is left alone, so existing claims never get
// wiped out just by restarting the server.
const insertZone = db.prepare(
  "INSERT OR IGNORE INTO zones (id, name, lat, lng, description) VALUES (?, ?, ?, ?, ?)"
);
for (const landmark of LANDMARKS) {
  insertZone.run(
    landmark.id,
    landmark.name,
    landmark.coords[0],
    landmark.coords[1],
    landmark.description
  );
}

module.exports = db;
