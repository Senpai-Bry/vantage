// server/routes/zones.js
//
// The turf zones themselves: listing them (with each one's current
// challenge and whoever's photo currently leads it). Submitting a photo
// and voting live in routes/submissions.js — this file is just "what does
// the map look like right now."

const express = require("express");
const db = require("../db");
const { rotateDueChallenges, currentChallengePrompt } = require("../lib/challenges");

const router = express.Router();

// Whoever's photo has the most votes for a zone IS that zone's owner now —
// there's no separate "claim" step anymore. Ties go to whoever submitted
// first, so a brand new photo with zero votes doesn't tie its way into
// first place against an existing one that also has zero votes yet.
const LEADING_SUBMISSION = `
  SELECT
    submissions.id, submissions.photo_path, submissions.created_at,
    users.username,
    COUNT(votes.user_id) AS vote_count
  FROM submissions
  LEFT JOIN votes ON votes.submission_id = submissions.id
  LEFT JOIN users ON users.id = submissions.user_id
  WHERE submissions.zone_id = ?
  GROUP BY submissions.id
  ORDER BY vote_count DESC, submissions.created_at ASC
  LIMIT 1
`;

function leadingSubmissionFor(zoneId) {
  return db.prepare(LEADING_SUBMISSION).get(zoneId) || null;
}

// Turns a raw zone row + its leading submission (if any) into the shape
// the frontend wants (nested coords, camelCase, owner derived from votes
// instead of a separate claims table).
function toZoneJSON(row) {
  const leader = leadingSubmissionFor(row.id);

  return {
    id: row.id,
    name: row.name,
    coords: [row.lat, row.lng],
    description: row.description,
    currentChallenge: currentChallengePrompt(row.id, row.current_challenge_index),
    owner: leader ? leader.username : null,
    claimedAt: leader ? leader.created_at : null,
    leadingSubmission: leader
      ? { id: leader.id, photoUrl: leader.photo_path, voteCount: leader.vote_count }
      : null,
  };
}

router.get("/", (req, res) => {
  rotateDueChallenges();
  const rows = db.prepare("SELECT * FROM zones ORDER BY name").all();
  res.json(rows.map(toZoneJSON));
});

router.get("/:id", (req, res) => {
  rotateDueChallenges();
  const row = db.prepare("SELECT * FROM zones WHERE id = ?").get(req.params.id);
  if (!row) return res.status(404).json({ error: "No such zone." });
  res.json(toZoneJSON(row));
});

module.exports = router;
