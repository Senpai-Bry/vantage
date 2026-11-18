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
// "nosniff" tells browsers to treat each file only as the image type it's
// labeled as, never to guess it's a page or script.
app.use(
  "/uploads",
  express.static(config.uploadDir, {
    setHeaders: (res) => res.setHeader("X-Content-Type-Options", "nosniff"),
  })
);

// The frontend: only the folders and page the browser actually needs.
// Everything else in the project (server code, the database when running
// locally, .git, README, etc.) stays private.
const ROOT = path.join(__dirname, "..");
app.use("/css", express.static(path.join(ROOT, "css")));
app.use("/js", express.static(path.join(ROOT, "js")));
app.use("/assets", express.static(path.join(ROOT, "assets")));
app.get("/", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

// Profile pages have their own address (vantageturf.com/u/<username>), so
// links to them can be shared. There's no separate page file for them —
// the same index.html loads, and js/profile.js sees the /u/ address and
// shows that player's profile.
app.get("/u/:username", (req, res) => {
  res.sendFile(path.join(ROOT, "index.html"));
});

app.listen(config.port, () => {
  console.log(`Vantage server running on port ${config.port}`);
});
