// server/middleware/auth.js
//
// Protects routes that require a logged-in user. The frontend sends the
// JWT it got from /api/auth/login or /api/auth/signup as:
//   Authorization: Bearer <token>
// This checks that header, verifies the token, and — if it's valid —
// attaches { id, username } to req.user so the route handler knows who's
// making the request. If anything is wrong, it responds with 401 and the
// route handler never runs.

const jwt = require("jsonwebtoken");
const config = require("../config");
const db = require("../db");

const userExists = db.prepare("SELECT username FROM users WHERE id = ?");

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Log in to do that." });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch (err) {
    return res.status(401).json({ error: "Your session expired — log in again." });
  }

  // A valid token isn't enough on its own: the account has to still exist
  // (it may have been deleted since the token was handed out).
  const user = userExists.get(payload.sub);
  if (!user) {
    return res.status(401).json({ error: "That account no longer exists. Log in again." });
  }

  req.user = { id: payload.sub, username: user.username };
  next();
}

module.exports = requireAuth;
