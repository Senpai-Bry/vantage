// server/lib/scores.js
//
// Every player's score, ranked. Used by the leaderboard (top 20) and by
// profile pages (one player's rank and stats).
//
// Score = zones currently held * POINTS_PER_ZONE
//       + votes received on their photos * POINTS_PER_VOTE
//
// "Zones held" uses the same rule as routes/zones.js: a zone belongs to
// whoever's photo has the most votes there (ties go to whoever submitted
// first).

const db = require("../db");

const POINTS_PER_ZONE = 10;
const POINTS_PER_VOTE = 1;

// `leaders` ranks every submission inside its own zone (ROW_NUMBER ...
// PARTITION BY zone_id), most votes first, earliest first on a tie — so
// rn = 1 is the photo holding each zone.
const LEADERS = `
  leaders AS (
    SELECT
      submissions.zone_id,
      submissions.user_id,
      submissions.id AS submission_id,
      ROW_NUMBER() OVER (
        PARTITION BY submissions.zone_id
        ORDER BY COUNT(votes.user_id) DESC, submissions.created_at ASC
      ) AS rn
    FROM submissions
    LEFT JOIN votes ON votes.submission_id = submissions.id
    GROUP BY submissions.id
  )
`;

const rankedQuery = db.prepare(`
  WITH ${LEADERS}
  SELECT username, avatar_path, zones_held, votes_received,
         zones_held * ? + votes_received * ? AS score
  FROM (
    SELECT
      users.username,
      users.avatar_path,
      (SELECT COUNT(*) FROM leaders
         WHERE leaders.rn = 1 AND leaders.user_id = users.id) AS zones_held,
      (SELECT COUNT(*) FROM votes
         JOIN submissions ON submissions.id = votes.submission_id
         WHERE submissions.user_id = users.id) AS votes_received
    FROM users
  )
  ORDER BY score DESC, username ASC
`);

// Which submissions are currently holding their zone (for the HOLDING
// badge on a profile's photos).
const holdingQuery = db.prepare(`
  WITH ${LEADERS}
  SELECT submission_id, zone_id FROM leaders WHERE rn = 1 AND user_id = ?
`);

function rankedPlayers() {
  return rankedQuery
    .all(POINTS_PER_ZONE, POINTS_PER_VOTE)
    .map((row, index) => ({ rank: index + 1, ...row }));
}

function holdingFor(userId) {
  return holdingQuery.all(userId);
}

module.exports = { rankedPlayers, holdingFor, POINTS_PER_ZONE, POINTS_PER_VOTE };
