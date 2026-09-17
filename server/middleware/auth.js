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

function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const [scheme, token] = header.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ error: "Log in to do that." });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = { id: payload.sub, username: payload.username };
    next();
  } catch (err) {
    return res.status(401).json({ error: "Your session expired — log in again." });
  }
}

module.exports = requireAuth;
