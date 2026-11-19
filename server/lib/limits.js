// server/lib/limits.js
//
// Speed limits on the actions people could abuse. Without these, someone
// could make dozens of accounts in a minute to vote their own photo to the
// top, or keep guessing a player's password forever.
//
//   signupLimit    5 new accounts per hour from one internet connection
//   loginLimit     10 wrong passwords per 15 minutes from one connection
//   uploadLimit    30 photos per hour per player
//   voteLimit      120 votes per 10 minutes per player
//   checkinLimit   30 check-ins per hour per player
//   passwordLimit  5 wrong passwords per 15 minutes when deleting an account
//
// Players never come near these in normal play. Set RATE_LIMITS=off in
// server/.env to turn them off while testing on your own computer.
//
// Counts live in memory, so they reset when the server restarts. That's
// fine for one server; a bigger setup would keep them in a shared store.

const { rateLimit, ipKeyGenerator, MINUTE, HOUR } = require("express-rate-limit");

const enabled = process.env.RATE_LIMITS !== "off";

// Who's asking. On Railway, every request passes through Railway's edge,
// which writes the visitor's real address into X-Real-IP (and overwrites
// anything a visitor tries to put there). Elsewhere, use the connection's
// own address. ipKeyGenerator groups IPv6 addresses by household-sized
// block, so one person can't dodge limits by hopping between addresses.
const onRailway = Boolean(process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_ENVIRONMENT_NAME);

function visitorKey(req) {
  const ip = (onRailway && req.get("x-real-ip")) || req.ip;
  return ipKeyGenerator(ip);
}

// Logged-in actions are counted per player, not per connection.
function playerKey(req) {
  return req.user ? `player:${req.user.id}` : visitorKey(req);
}

function makeLimit({ windowMs, limit, key, message, skipSuccessfulRequests = false }) {
  if (!enabled) return (req, res, next) => next();
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: key,
    skipSuccessfulRequests,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    // We work out the visitor's address ourselves (above), so the library's
    // proxy-header checks don't apply.
    validate: { xForwardedForHeader: false, trustProxy: false, keyGeneratorIpFallback: false },
    handler: (req, res) => res.status(429).json({ error: message }),
  });
}

const signupLimit = makeLimit({
  windowMs: HOUR,
  limit: 5,
  key: visitorKey,
  message: "Too many new accounts from this connection. Try again in an hour.",
});

// Only failed attempts count, so logging in normally never adds up.
const loginLimit = makeLimit({
  windowMs: 15 * MINUTE,
  limit: 10,
  key: visitorKey,
  skipSuccessfulRequests: true,
  message: "Too many wrong passwords. Wait 15 minutes and try again.",
});

const uploadLimit = makeLimit({
  windowMs: HOUR,
  limit: 30,
  key: playerKey,
  message: "That's a lot of photos for one hour. Take a break and try again later.",
});

const voteLimit = makeLimit({
  windowMs: 10 * MINUTE,
  limit: 120,
  key: playerKey,
  message: "You're voting really fast. Wait a few minutes and try again.",
});

const checkinLimit = makeLimit({
  windowMs: HOUR,
  limit: 30,
  key: playerKey,
  message: "Too many check-ins this hour. Try again later.",
});

const passwordLimit = makeLimit({
  windowMs: 15 * MINUTE,
  limit: 5,
  key: playerKey,
  skipSuccessfulRequests: true,
  message: "Too many wrong passwords. Wait 15 minutes and try again.",
});

module.exports = { signupLimit, loginLimit, uploadLimit, voteLimit, checkinLimit, passwordLimit };
