// server/lib/checkins.js
//
// Check-ins: proof a player was physically at a zone. Checking in needs
// live GPS from inside the zone's border (the same geofence test photo
// uploads use). After that, the player can upload a photo for that zone
// from anywhere until the window runs out (CHECKIN_HOURS, 48 by default).
//
// Uploading while standing in the zone checks you in automatically, so the
// old "shoot and upload on the spot" flow still works the same way.

const db = require("../db");
const config = require("../config");

const insertCheckin = db.prepare(
  "INSERT INTO checkins (user_id, zone_id, created_at) VALUES (?, ?, ?)"
);

const latestCheckin = db.prepare(`
  SELECT MAX(created_at) AS at FROM checkins
  WHERE user_id = ? AND zone_id = ? AND created_at > ?
`);

const activeForUser = db.prepare(`
  SELECT zone_id, MAX(created_at) AS at FROM checkins
  WHERE user_id = ? AND created_at > ?
  GROUP BY zone_id
`);

function windowStart(now = Date.now()) {
  return now - config.checkinWindowMs;
}

function toCheckinJSON(zoneId, at) {
  return { zoneId, checkedInAt: at, expiresAt: at + config.checkinWindowMs };
}

// Saves a check-in and returns { zoneId, checkedInAt, expiresAt }.
function recordCheckin(userId, zoneId, now = Date.now()) {
  insertCheckin.run(userId, zoneId, now);
  return toCheckinJSON(zoneId, now);
}

// The player's still-open check-in for this zone, or null.
function activeCheckin(userId, zoneId, now = Date.now()) {
  const row = latestCheckin.get(userId, zoneId, windowStart(now));
  return row && row.at ? toCheckinJSON(zoneId, row.at) : null;
}

// Every zone the player currently has an open check-in for.
function activeCheckins(userId, now = Date.now()) {
  return activeForUser.all(userId, windowStart(now)).map((row) => toCheckinJSON(row.zone_id, row.at));
}

module.exports = { recordCheckin, activeCheckin, activeCheckins };
