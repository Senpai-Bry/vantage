// server/routes/leaderboard.js
//
// GET /api/leaderboard — players ranked by score.
// Score = zones currently held * POINTS_PER_ZONE
//       + votes received on their photos * POINTS_PER_VOTE

const express = require("express");
const db = require("../db"); // BLANK 1
const router = express.Router();

const POINTS_PER_ZONE = 10;
const POINTS_PER_VOTE = 1;

// Prepared once when the server starts, reused on every request.
const leaderboardQuery = db.prepare(`
  SELECT username, zones_held, votes_received,
         zones_held * ? + votes_received * ? AS score
  FROM (
    SELECT
      users.username,
      (SELECT COUNT(*) FROM claims
         WHERE claims.user_id = users.id) AS zones_held,
      (SELECT COUNT(*) FROM votes
         JOIN submissions ON submissions.id = votes.submission_id
         WHERE submissions.user_id = users.id) AS votes_received
    FROM users
  )
  ORDER BY score DESC, username ASC
  LIMIT 20
`);

router.get("/", (req, res) => {
  const rows = leaderboardQuery.all(POINTS_PER_ZONE, POINTS_PER_VOTE); // BLANK 3

  const data = rows.map((row, index) => ({
    rank: index + 1, // BLANK 4
    ...row,
  }));

  res.json({ success: true, data });
});

module.exports = router;