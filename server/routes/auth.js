// server/routes/auth.js
//
// Account creation and login. Passwords are never stored directly — only
// a bcrypt hash of them — so even if the database file leaked, no one
// could read anyone's actual password back out of it.

const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const db = require("../db");
const config = require("../config");

const router = express.Router();

const MIN_USERNAME_LENGTH = 3;
const MIN_PASSWORD_LENGTH = 8;

function signToken(user) {
  return jwt.sign({ sub: user.id, username: user.username }, config.jwtSecret, {
    expiresIn: "7d",
  });
}

router.post("/signup", (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== "string" || username.trim().length < MIN_USERNAME_LENGTH) {
    return res.status(400).json({
      error: `Username must be at least ${MIN_USERNAME_LENGTH} characters.`,
    });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({
      error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`,
    });
  }

  const cleanUsername = username.trim();
  const passwordHash = bcrypt.hashSync(password, 10);

  try {
    const insert = db.prepare(
      "INSERT INTO users (username, password_hash, created_at) VALUES (?, ?, ?)"
    );
    const result = insert.run(cleanUsername, passwordHash, Date.now());

    const user = { id: result.lastInsertRowid, username: cleanUsername };
    return res.status(201).json({ token: signToken(user), username: user.username });
  } catch (err) {
    if (err.code === "SQLITE_CONSTRAINT_UNIQUE" || err.code === "SQLITE_CONSTRAINT") {
      return res.status(409).json({ error: "That username is already taken." });
    }
    console.error("Signup failed:", err);
    return res.status(500).json({ error: "Something went wrong creating your account." });
  }
});

router.post("/login", (req, res) => {
  const { username, password } = req.body || {};

  if (typeof username !== "string" || typeof password !== "string") {
    return res.status(400).json({ error: "Username and password are required." });
  }

  const user = db
    .prepare("SELECT id, username, password_hash FROM users WHERE username = ?")
    .get(username.trim());

  // Same error for "no such user" and "wrong password" — don't give an
  // attacker a way to discover which usernames exist.
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: "Incorrect username or password." });
  }

  return res.json({ token: signToken(user), username: user.username });
});

module.exports = router;
