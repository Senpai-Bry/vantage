// server/config.js
//
// All the server's tunable settings in one place, read from environment
// variables (see .env.example — copy it to .env and fill in your own
// values; .env itself is gitignored so secrets never get committed).

require("dotenv").config();

const config = {
  port: process.env.PORT || 5000,
  clientOrigin: process.env.CLIENT_ORIGIN || "http://localhost:5000",
  jwtSecret: process.env.JWT_SECRET,
  dbPath: process.env.DB_PATH || require("path").join(__dirname, "db", "vantage.db"),
};

// Fail loudly at startup rather than silently signing tokens with
// "undefined" — a missing secret is a config mistake you want to know
// about immediately, not discover later as a security hole.
if (!config.jwtSecret) {
  throw new Error(
    "Missing JWT_SECRET. Copy server/.env.example to server/.env and set a value."
  );
}

module.exports = config;
