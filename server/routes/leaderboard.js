// server/routes/leaderboard.js
//
// GET /api/leaderboard — players ranked by score.
// Score = zones currently held * POINTS_PER_ZONE
//       + votes received on their photos * POINTS_PER_VOTE
//
// "Zones held" uses the same rule as routes/zones.js: a zone belongs to
// whoever's photo has the most votes there (ties go to whoever submitted
// first). The old `claims` table isn't written to anymore since voting
// replaced the claim button, so it can't be used to count zones.

const express = require("express");
const db = require("../db");
const router = express.Router();

const POINTS_PER_ZONE = 10;
const POINTS_PER_VOTE = 1;

// Prepared once when the server starts, reused on every request.
//
// `leaders` ranks every submission inside its own zone (ROW_NUMBER ...
// PARTITION BY zone_id), most votes first, earliest first on a tie — so
// rn = 1 is the photo holding each zone.
const leaderboardQuery = db.prepare(`
  WITH leaders AS (
    SELECT
      submissions.zone_id,
      submissions.user_id,
      ROW_NUMBER() OVER (
        PARTITION BY submissions.zone_id
        ORDER BY COUNT(votes.user_id) DESC, submissions.created_at ASC
      ) AS rn
    FROM submissions
    LEFT JOIN votes ON votes.submission_id = submissions.id
    GROUP BY submissions.id
  )
  SELECT username, zones_held, votes_received,
         zones_held * ? + votes_received * ? AS score
  FROM (
    SELECT
      users.username,
      (SELECT COUNT(*) FROM leaders
         WHERE leaders.rn = 1 AND leaders.user_id = users.id) AS zones_held,
      (SELECT COUNT(*) FROM votes
         JOIN submissions ON submissions.id = votes.submission_id
         WHERE submissions.user_id = users.id) AS votes_received
    FROM users
  )
  ORDER BY score DESC, username ASC
  LIMIT 20
`);

router.get("/", (req, res) => {
  const rows = leaderboardQuery.all(POINTS_PER_ZONE, POINTS_PER_VOTE);

  const data = rows.map((row, index) => ({
    rank: index + 1,
    ...row,
  }));

  res.json({ success: true, data });
});

module.exports = router;
