// server/routes/submissions.js
//
// Submitting a photo to a zone's current challenge, listing a zone's
// submissions, and voting on one. Vote counts are what routes/zones.js
// uses to decide who currently holds each zone — there's no separate
// "claim" action anymore, a winning photo IS the claim.

const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const jwt = require("jsonwebtoken");
const db = require("../db");
const config = require("../config");
const requireAuth = require("../middleware/auth");
const { checkPosition, describeDistance } = require("../lib/geofence");

const router = express.Router();

const UPLOAD_DIR = config.uploadDir;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".jpg";
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — plenty for a phone photo
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
    }
    cb(null, true);
  },
});

const SUBMISSIONS_FOR_ZONE = `
  SELECT
    submissions.id, submissions.photo_path, submissions.created_at,
    submissions.challenge_index,
    users.username,
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

    // Geofence: the photo only counts if it was sent from inside the zone.
    // The phone's location arrives as two extra form fields, lat and lng.
    if (config.geofenceEnabled) {
      const lat = Number(req.body.lat);
      const lng = Number(req.body.lng);
      if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        fs.unlink(req.file.path, () => {});
        return res.status(400).json({
          error: "Vantage needs your location to check you're at this zone. Allow location access and try again.",
        });
      }
      const { inside, distanceM } = checkPosition(zone, [lat, lng]);
      if (!inside) {
        fs.unlink(req.file.path, () => {});
        return res.status(403).json({
          error: `You need to be inside ${zone.name}'s turf to submit here. You're ${describeDistance(distanceM)} away.`,
        });
      }
    }

    const photoPath = `/uploads/${req.file.filename}`;
    const result = db
      .prepare(
        `INSERT INTO submissions (zone_id, user_id, challenge_index, photo_path, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(zone.id, req.user.id, zone.current_challenge_index, photoPath, Date.now());

    res.status(201).json({
      id: result.lastInsertRowid,
      photoUrl: photoPath,
      username: req.user.username,
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

module.exports = router;
