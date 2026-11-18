// server/routes/users.js
//
// Player profiles.
//   GET /api/users/:username  — anyone can view a profile: picture, bio,
//                               home city, gear, stats, and their photos
//   PUT /api/users/me         — edit your own profile (multipart form, so
//                               a new profile picture can come along)
//
// Everything a player types here is shown back to other players, so it's
// length-checked on the way in, and the frontend always inserts it as
// plain text (never as HTML).

const express = require("express");
const bcrypt = require("bcryptjs");
const db = require("../db");
const requireAuth = require("../middleware/auth");
const { upload, removeUpload } = require("../lib/uploads");
const { rankedPlayers, holdingFor } = require("../lib/scores");

const router = express.Router();

// How long each editable field can be.
const LIMITS = { bio: 160, homeCity: 40, gear: 60 };

const userByName = db.prepare(
  "SELECT id, username, created_at, avatar_path, bio, home_city, gear FROM users WHERE username = ?"
);

const photosByUser = db.prepare(`
  SELECT
    submissions.id, submissions.photo_path, submissions.created_at,
    submissions.zone_id, zones.name AS zone_name,
    COUNT(votes.user_id) AS vote_count
  FROM submissions
  JOIN zones ON zones.id = submissions.zone_id
  LEFT JOIN votes ON votes.submission_id = submissions.id
  WHERE submissions.user_id = ?
  GROUP BY submissions.id
  ORDER BY submissions.created_at DESC
`);

function toProfileJSON(user) {
  const ranked = rankedPlayers();
  const me = ranked.find((row) => row.username === user.username);
  const holding = holdingFor(user.id);
  const holdingIds = new Set(holding.map((row) => row.submission_id));
  const photos = photosByUser.all(user.id);

  return {
    username: user.username,
    joinedAt: user.created_at,
    avatarUrl: user.avatar_path || null,
    bio: user.bio || "",
    homeCity: user.home_city || "",
    gear: user.gear || "",
    stats: {
      rank: me ? me.rank : null,
      players: ranked.length,
      score: me ? me.score : 0,
      zonesHeld: me ? me.zones_held : 0,
      votesReceived: me ? me.votes_received : 0,
      frames: photos.length,
    },
    heldZoneIds: holding.map((row) => row.zone_id),
    photos: photos.map((row) => ({
      id: row.id,
      photoUrl: row.photo_path,
      zoneId: row.zone_id,
      zoneName: row.zone_name,
      voteCount: row.vote_count,
      createdAt: row.created_at,
      holding: holdingIds.has(row.id),
    })),
  };
}

router.get("/:username", (req, res) => {
  const user = userByName.get(req.params.username);
  if (!user) return res.status(404).json({ error: "No player by that name." });
  res.json(toProfileJSON(user));
});

// Trims a form field and checks its length. Returns { value } or { error }.
function cleanField(raw, name, label) {
  if (raw === undefined) return { value: undefined }; // not sent: leave it alone
  const value = String(raw).replace(/\s+/g, " ").trim();
  if (value.length > LIMITS[name]) {
    return { error: `${label} can be at most ${LIMITS[name]} characters.` };
  }
  return { value };
}

router.put("/me", requireAuth, (req, res) => {
  upload.single("avatar")(req, res, (err) => {
    // If anything below fails, don't leave a just-uploaded file behind.
    const discardUpload = () => req.file && removeUpload(`/uploads/${req.file.filename}`);

    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed." });
    }

    const fields = {
      bio: cleanField(req.body.bio, "bio", "Bio"),
      homeCity: cleanField(req.body.homeCity, "homeCity", "Home city"),
      gear: cleanField(req.body.gear, "gear", "Gear"),
    };
    const problem = Object.values(fields).find((field) => field.error);
    if (problem) {
      discardUpload();
      return res.status(400).json({ error: problem.error });
    }

    const current = db
      .prepare("SELECT username, avatar_path, bio, home_city, gear FROM users WHERE id = ?")
      .get(req.user.id);
    if (!current) {
      discardUpload();
      return res.status(404).json({ error: "Your account wasn't found. Log in again." });
    }

    // Profile picture: a new upload replaces the old one; removeAvatar=1
    // clears it. Either way, the old file is deleted from disk.
    let avatarPath = current.avatar_path;
    if (req.file) {
      avatarPath = `/uploads/${req.file.filename}`;
    } else if (req.body.removeAvatar === "1") {
      avatarPath = null;
    }

    // Same as photo submissions: this runs after the upload, so a database
    // error has to be caught here or it would crash the server.
    try {
      db.prepare(
        "UPDATE users SET avatar_path = ?, bio = ?, home_city = ?, gear = ? WHERE id = ?"
      ).run(
        avatarPath,
        fields.bio.value ?? current.bio,
        fields.homeCity.value ?? current.home_city,
        fields.gear.value ?? current.gear,
        req.user.id
      );
    } catch (dbErr) {
      console.error("Saving a profile failed:", dbErr);
      discardUpload();
      return res.status(500).json({ error: "Couldn't save your profile. Try again." });
    }

    // Only delete the old picture once the new one is saved.
    if (avatarPath !== current.avatar_path && current.avatar_path) {
      removeUpload(current.avatar_path);
    }

    res.json(toProfileJSON(userByName.get(current.username)));
  });
});

// DELETE /api/users/me  { password }
// Permanently deletes your account: your photos, the votes you gave and
// got, and your profile picture. Your password is asked again so a stolen
// or forgotten-open login can't wipe an account. Any zone you held goes to
// the next-best photo, because holders are worked out from submissions.
router.delete("/me", requireAuth, (req, res) => {
  const { password } = req.body || {};
  const user = db
    .prepare("SELECT id, password_hash, avatar_path FROM users WHERE id = ?")
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: "Your account wasn't found. Log in again." });
  if (typeof password !== "string" || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "That password isn't right." });
  }

  const photos = db.prepare("SELECT photo_path FROM submissions WHERE user_id = ?").all(user.id);

  db.transaction(() => {
    db.prepare("DELETE FROM votes WHERE user_id = ?").run(user.id);
    db.prepare(
      "DELETE FROM votes WHERE submission_id IN (SELECT id FROM submissions WHERE user_id = ?)"
    ).run(user.id);
    db.prepare("DELETE FROM submissions WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM claims WHERE user_id = ?").run(user.id);
    db.prepare("DELETE FROM users WHERE id = ?").run(user.id);
  })();

  // Files go last, once the database part has worked.
  photos.forEach((row) => removeUpload(row.photo_path));
  if (user.avatar_path) removeUpload(user.avatar_path);

  res.json({ deleted: true });
});

module.exports = router;
