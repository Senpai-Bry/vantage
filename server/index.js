// server/index.js
//
// The whole server in one place: it serves the frontend files (index.html,
// css/, js/) AND the API (/api/...) from the same process and port, so
// running Vantage locally is just "npm start" — no separate frontend
// server to remember to also run.

const path = require("path");
const express = require("express");
const cors = require("cors");
const config = require("./config");
const authRouter = require("./routes/auth");
const zonesRouter = require("./routes/zones");
const submissionsRouter = require("./routes/submissions");
const leaderboardRouter = require("./routes/leaderboard");
const usersRouter = require("./routes/users");
const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/zones", zonesRouter);
// Adds POST/GET /api/zones/:id/submissions and POST /api/submissions/:id/vote.
app.use("/api", submissionsRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/users", usersRouter);
// Uploaded photos, served as plain static files at /uploads/<filename>.
app.use("/uploads", express.static(config.uploadDir));

// The frontend is served straight from the project folder (below), so
// keep the server's own folder out of it — otherwise anyone could
// download the server code, or (when running locally) the database file.
app.use("/server", (req, res) => res.status(404).end());

// Everything that isn't an /api/* or /uploads/* route is the frontend —
// index.html, css/style.css, js/app.js, etc, all live one level up from
// server/.
app.use(express.static(path.join(__dirname, "..")));

// Profile pages have their own address (vantageturf.com/u/<username>), so
// links to them can be shared. There's no separate page file for them —
// the same index.html loads, and js/profile.js sees the /u/ address and
// shows that player's profile.
app.get("/u/:username", (req, res) => {
  res.sendFile(path.join(__dirname, "..", "index.html"));
});

app.listen(config.port, () => {
  console.log(`Vantage server running on port ${config.port}`);
});
