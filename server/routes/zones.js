// server/routes/zones.js
//
// The turf zones themselves: listing them (with whoever currently holds
// each one), claiming an unclaimed one, and releasing one you hold.

const express = require("express");
const db = require("../db");
const requireAuth = require("../middleware/auth");

const router = express.Router();

// Turns a raw database row (flat columns, snake_case) into the shape the
// frontend actually wants (nested coords, camelCase, owner as one field).
function toZoneJSON(row) {
  return {
    id: row.id,
    name: row.name,
    coords: [row.lat, row.lng],
    description: row.description,
    owner: row.owner_username || null,
    claimedAt: row.claimed_at || null,
  };
}

const SELECT_ZONES = `
  SELECT
    zones.id, zones.name, zones.lat, zones.lng, zones.description,
    claims.claimed_at,
    users.username AS owner_username
  FROM zones
  LEFT JOIN claims ON claims.zone_id = zones.id
  LEFT JOIN users ON users.id = claims.user_id
`;

router.get("/", (req, res) => {
  const rows = db.prepare(SELECT_ZONES + " ORDER BY zones.name").all();
  res.json(rows.map(toZoneJSON));
});

router.post("/:id/claim", requireAuth, (req, res) => {
  const zoneId = req.params.id;

  const zone = db.prepare("SELECT id FROM zones WHERE id = ?").get(zoneId);
  if (!zone) {
    return res.status(404).json({ error: "No such zone." });
  }

  try {
    db.prepare(
      "INSERT INTO claims (zone_id, user_id, claimed_at) VALUES (?, ?, ?)"
    ).run(zoneId, req.user.id, Date.now());
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_PRIMARYKEY" || err.code === "SQLITE_CONSTRAINT") {
      // Someone already holds this zone — claims.zone_id is the primary
      // key, so a second INSERT for the same zone fails here rather than
      // silently overwriting the first claim. That collision is exactly
      // what this route needs to report as a 409, not a bug.
      const current = db.prepare(SELECT_ZONES + " WHERE zones.id = ?").get(zoneId);
      return res.status(409).json({
        error: "Someone already holds that turf.",
        zone: toZoneJSON(current),
      });
    }
    console.error("Claim failed:", err);
    return res.status(500).json({ error: "Something went wrong claiming that turf." });
  }

  const updated = db.prepare(SELECT_ZONES + " WHERE zones.id = ?").get(zoneId);
  res.status(201).json(toZoneJSON(updated));
});

router.delete("/:id/claim", requireAuth, (req, res) => {
  const zoneId = req.params.id;

  const claim = db.prepare("SELECT user_id FROM claims WHERE zone_id = ?").get(zoneId);
  if (!claim) {
    return res.status(404).json({ error: "That turf isn't claimed." });
  }
  if (claim.user_id !== req.user.id) {
    return res.status(403).json({ error: "You don't hold that turf." });
  }

  db.prepare("DELETE FROM claims WHERE zone_id = ?").run(zoneId);

  const updated = db.prepare(SELECT_ZONES + " WHERE zones.id = ?").get(zoneId);
  res.json(toZoneJSON(updated));
});

module.exports = router;
