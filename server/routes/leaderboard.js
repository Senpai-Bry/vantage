// server/routes/leaderboard.js
//
// GET /api/leaderboard — the top 20 players by score. The scoring rules
// live in lib/scores.js, shared with profile pages.

const express = require("express");
const { rankedPlayers } = require("../lib/scores");

const router = express.Router();
const LEADERBOARD_SIZE = 20;

router.get("/", (req, res) => {
  const data = rankedPlayers()
    .slice(0, LEADERBOARD_SIZE)
    .map(({ avatar_path, ...row }) => ({ ...row, avatarUrl: avatar_path || null }));

  res.json({ success: true, data });
});

module.exports = router;
