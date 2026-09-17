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

const app = express();

app.use(cors({ origin: config.clientOrigin }));
app.use(express.json());

app.use("/api/auth", authRouter);
app.use("/api/zones", zonesRouter);

// Everything that isn't an /api/* route is the frontend — index.html,
// css/style.css, js/app.js, etc, all live one level up from server/.
app.use(express.static(path.join(__dirname, "..")));

app.listen(config.port, () => {
  console.log(`Vantage server running at http://localhost:${config.port}`);
});
