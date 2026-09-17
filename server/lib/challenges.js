// server/lib/challenges.js
//
// The rotation logic for each zone's photo challenge. There's no
// scheduler/cron job running in the background — instead, every time the
// zone list is requested, rotateDueChallenges() checks each zone and
// advances any that have been sitting on the same prompt longer than
// config.challengeRotationMs. This is called "lazy" rotation: nothing
// happens on a timer while no one's looking, but the result is exactly the
// same as if it had been — the first request after the deadline passes is
// simply the one that notices and flips it over.

const db = require("../db");
const config = require("../config");

const countChallenges = db.prepare(
  "SELECT COUNT(*) AS n FROM zone_challenges WHERE zone_id = ?"
);
const rotateZone = db.prepare(
  "UPDATE zones SET current_challenge_index = ?, challenge_rotated_at = ? WHERE id = ?"
);
const dueZones = db.prepare(
  `SELECT id, current_challenge_index FROM zones
   WHERE challenge_rotated_at IS NULL OR ? - challenge_rotated_at >= ?`
);

function rotateDueChallenges() {
  const now = Date.now();
  for (const zone of dueZones.all(now, config.challengeRotationMs)) {
    const { n } = countChallenges.get(zone.id);
    if (n === 0) continue; // this zone has no challenges seeded yet
    const nextIndex = (zone.current_challenge_index + 1) % n;
    rotateZone.run(nextIndex, now, zone.id);
  }
}

function currentChallengePrompt(zoneId, currentChallengeIndex) {
  const row = db
    .prepare("SELECT prompt FROM zone_challenges WHERE zone_id = ? AND position = ?")
    .get(zoneId, currentChallengeIndex);
  return row ? row.prompt : null;
}

module.exports = { rotateDueChallenges, currentChallengePrompt };
