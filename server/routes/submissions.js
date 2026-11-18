// server/routes/submissions.js
//
// Submitting a photo to a zone's current challenge, listing a zone's
// submissions, and voting on one. Vote counts are what routes/zones.js
// uses to decide who currently holds each zone — there's no separate
// "claim" action anymore, a winning photo IS the claim.

const express = require("express");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const config = require("../config");
const requireAuth = require("../middleware/auth");
const { checkPosition, describeDistance } = require("../lib/geofence");
const { upload } = require("../lib/uploads");
const { recordCheckin, activeCheckin, activeCheckins } = require("../lib/checkins");

// A photo's own location tag (read by the browser before upload) can be a
// little off, because many cameras get their location from the phone over
// Bluetooth. Only a tag clearly far from the zone gets a photo rejected.
const PHOTO_TAG_SLACK_M = 400;

// Reads lat/lng form fields; returns [lat, lng] or null if missing/invalid.
function readPosition(latValue, lngValue) {
  if (latValue === undefined || lngValue === undefined || latValue === "" || lngValue === "") return null;
  const lat = Number(latValue);
  const lng = Number(lngValue);
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return null;
  }
  return [lat, lng];
}

const router = express.Router();

const SUBMISSIONS_FOR_ZONE = `
  SELECT
    submissions.id, submissions.photo_path, submissions.created_at,
    submissions.challenge_index,
    users.username, users.avatar_path,
    COUNT(votes.user_id) AS vote_count
  FROM submissions
  LEFT JOIN votes ON votes.submission_id = submissions.id
  LEFT JOIN users ON users.id = submissions.user_id
  WHERE submissions.zone_id = ?
  GROUP BY submissions.id
  ORDER BY vote_count DESC, submissions.created_at ASC
`;

function toSubmissionJSON(row, myVotes) {
  return {
    id: row.id,
    photoUrl: row.photo_path,
    username: row.username,
    avatarUrl: row.avatar_path || null,
    createdAt: row.created_at,
    challengeIndex: row.challenge_index,
    voteCount: row.vote_count,
    votedByMe: myVotes.has(row.id),
  };
}

// Reads the Authorization header if there is one, without rejecting the
// request when there isn't — this route is fine for logged-out visitors
// to browse, they just won't see which photos they've voted for.
function optionalUserId(req) {
  const header = req.headers.authorization || "";
  if (!header.startsWith("Bearer ")) return null;
  try {
    return jwt.verify(header.slice(7), config.jwtSecret).sub;
  } catch (_) {
    return null;
  }
}

// GET /api/zones/:id/submissions — every photo ever submitted to this
// zone, most-voted first.
router.get("/zones/:id/submissions", (req, res) => {
  const rows = db.prepare(SUBMISSIONS_FOR_ZONE).all(req.params.id);

  let myVotes = new Set();
  const userId = optionalUserId(req);
  if (userId) {
    const voted = db
      .prepare(
        `SELECT votes.submission_id FROM votes
         JOIN submissions ON submissions.id = votes.submission_id
         WHERE votes.user_id = ? AND submissions.zone_id = ?`
      )
      .all(userId, req.params.id);
    myVotes = new Set(voted.map((v) => v.submission_id));
  }

  res.json(rows.map((row) => toSubmissionJSON(row, myVotes)));
});

// POST /api/zones/:id/submissions — submit a photo to this zone's current
// challenge. "photo" is the field name the frontend's FormData uses.
router.post("/zones/:id/submissions", requireAuth, (req, res) => {
  upload.single("photo")(req, res, (err) => {
    if (err) {
      return res.status(400).json({ error: err.message || "Upload failed." });
    }
    if (!req.file) {
      return res.status(400).json({ error: "A photo is required." });
    }

    const zone = db
      .prepare("SELECT id, name, lat, lng, current_challenge_index FROM zones WHERE id = ?")
      .get(req.params.id);
    if (!zone) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ error: "No such zone." });
    }

    const reject = (status, error) => {
      fs.unlink(req.file.path, () => {});
      return res.status(status).json({ error });
    };

    // The photo's own location tag, if it had one. Catches picking the
    // wrong photo (or one from somewhere else entirely).
    const photoTag = readPosition(req.body.photoLat, req.body.photoLng);
    if (photoTag && config.geofenceEnabled) {
      const { distanceM } = checkPosition(zone, photoTag);
      if (distanceM > PHOTO_TAG_SLACK_M) {
        return reject(
          403,
          `This photo's location tag says it was taken ${describeDistance(distanceM)} from ${zone.name}'s turf. Pick a photo you took there.`
        );
      }
    }

    // Geofence: you need to be inside the zone right now, OR have checked
    // in there within the upload window.
    if (config.geofenceEnabled) {
      const here = readPosition(req.body.lat, req.body.lng);
      const hereCheck = here ? checkPosition(zone, here) : null;

      if (hereCheck && hereCheck.inside) {
        // Standing in the zone: this upload checks you in too.
        recordCheckin(req.user.id, zone.id);
      } else if (!activeCheckin(req.user.id, zone.id)) {
        const hours = Math.round(config.checkinWindowMs / 3600000);
        if (hereCheck) {
          return reject(
            403,
            `You're ${describeDistance(hereCheck.distanceM)} from ${zone.name}'s turf. Check in when you're there, then you'll have ${hours} hours to upload from anywhere.`
          );
        }
        return reject(
          400,
          `Check in at ${zone.name} first. Once you have, you can upload from anywhere for ${hours} hours. Or allow location access while you're there.`
        );
      }
    }

    const photoPath = `/uploads/${req.file.filename}`;
    // This runs after the upload finishes, outside Express's own error
    // catching, so a database error here must be caught by hand — otherwise
    // it would crash the whole server.
    let result;
    try {
      result = db
        .prepare(
          `INSERT INTO submissions (zone_id, user_id, challenge_index, photo_path, created_at)
           VALUES (?, ?, ?, ?, ?)`
        )
        .run(zone.id, req.user.id, zone.current_challenge_index, photoPath, Date.now());
    } catch (dbErr) {
      console.error("Saving a submission failed:", dbErr);
      fs.unlink(req.file.path, () => {});
      return res.status(500).json({ error: "Couldn't save your photo. Try again." });
    }

    res.status(201).json({
      id: result.lastInsertRowid,
      photoUrl: photoPath,
      username: req.user.username,
      avatarUrl:
        db.prepare("SELECT avatar_path FROM users WHERE id = ?").get(req.user.id)?.avatar_path || null,
      createdAt: Date.now(),
      challengeIndex: zone.current_challenge_index,
      voteCount: 0,
      votedByMe: false,
    });
  });
});

// POST /api/submissions/:id/vote — toggle your vote on a submission.
// Voting for your own photo isn't allowed; that's not community judging,
// that's just clicking a button for yourself.
router.post("/submissions/:id/vote", requireAuth, (req, res) => {
  const submissionId = req.params.id;
  const submission = db
    .prepare("SELECT user_id FROM submissions WHERE id = ?")
    .get(submissionId);

  if (!submission) {
    return res.status(404).json({ error: "No such submission." });
  }
  if (submission.user_id === req.user.id) {
    return res.status(403).json({ error: "You can't vote for your own photo." });
  }

  const existing = db
    .prepare("SELECT 1 FROM votes WHERE submission_id = ? AND user_id = ?")
    .get(submissionId, req.user.id);

  if (existing) {
    db.prepare("DELETE FROM votes WHERE submission_id = ? AND user_id = ?").run(
      submissionId,
      req.user.id
    );
  } else {
    db.prepare(
      "INSERT INTO votes (submission_id, user_id, created_at) VALUES (?, ?, ?)"
    ).run(submissionId, req.user.id, Date.now());
  }

  const { n } = db
    .prepare("SELECT COUNT(*) AS n FROM votes WHERE submission_id = ?")
    .get(submissionId);

  res.json({ voteCount: n, votedByMe: !existing });
});

// POST /api/zones/:id/checkin  { lat, lng }
// Checks you in at a zone. Needs your live location, inside the border.
router.post("/zones/:id/checkin", requireAuth, (req, res) => {
  const zone = db
    .prepare("SELECT id, name, lat, lng FROM zones WHERE id = ?")
    .get(req.params.id);
  if (!zone) return res.status(404).json({ error: "No such zone." });

  if (config.geofenceEnabled) {
    const here = readPosition((req.body || {}).lat, (req.body || {}).lng);
    if (!here) {
      return res.status(400).json({
        error: "Vantage needs your location to check you in. Allow location access and try again.",
      });
    }
    const { inside, distanceM } = checkPosition(zone, here);
    if (!inside) {
      return res.status(403).json({
        error: `You need to be inside ${zone.name}'s turf to check in. You're ${describeDistance(distanceM)} away.`,
      });
    }
  }

  res.status(201).json(recordCheckin(req.user.id, zone.id));
});

// GET /api/checkins — your open check-ins, so the app can show which zones
// you can upload to and how long you have left.
router.get("/checkins", requireAuth, (req, res) => {
  res.json({
    windowHours: config.checkinWindowMs / 3600000,
    checkins: activeCheckins(req.user.id),
  });
});

module.exports = router;
