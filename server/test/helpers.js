// server/test/helpers.js
//
// Shared tools for the tests. Each test file starts its own real Vantage
// server, on a free port with a brand-new empty database and upload
// folder, then talks to it over HTTP the same way the browser does.
// Nothing touches your real database or photos.

const { spawn } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");

const SERVER_DIR = path.join(__dirname, "..");
const FIXTURES = path.join(__dirname, "fixtures");

// Asks the operating system for a port nothing else is using.
function freePort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.listen(0, () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
    probe.on("error", reject);
  });
}

// Starts a server. `env` adds or overrides settings, for example
// { GEOFENCE: "off" }. Returns helpers bound to that server.
async function startServer(env = {}) {
  const port = await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "vantage-test-"));
  const uploadDir = path.join(dataDir, "uploads");
  fs.mkdirSync(uploadDir);

  const child = spawn(process.execPath, ["index.js"], {
    cwd: SERVER_DIR,
    env: {
      ...process.env,
      PORT: String(port),
      CLIENT_ORIGIN: `http://localhost:${port}`,
      DB_PATH: path.join(dataDir, "vantage.db"),
      UPLOAD_DIR: uploadDir,
      JWT_SECRET: "test-secret",
      RATE_LIMITS: "off",
      GEOFENCE: "on",
      // Settings from your own .env file shouldn't leak into tests.
      CHALLENGE_ROTATION_HOURS: "72",
      CHECKIN_HOURS: "48",
      RAILWAY_ENVIRONMENT: "",
      RAILWAY_ENVIRONMENT_NAME: "",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let output = "";
  child.stdout.on("data", (chunk) => (output += chunk));
  child.stderr.on("data", (chunk) => (output += chunk));

  // Wait until the server says it's listening (or give up after 15s).
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Server didn't start:\n${output}`)), 15000);
    const check = () => {
      if (output.includes("running on port")) {
        clearTimeout(timer);
        resolve();
      }
    };
    child.stdout.on("data", check);
    child.on("exit", (code) => {
      clearTimeout(timer);
      reject(new Error(`Server exited with code ${code}:\n${output}`));
    });
  });
  child.removeAllListeners("exit");

  const base = `http://localhost:${port}`;

  // Sends a request. `body` objects go as JSON; FormData goes as a form.
  async function request(method, urlPath, { token, body, headers = {} } = {}) {
    const init = { method, headers: { ...headers } };
    if (token) init.headers.Authorization = `Bearer ${token}`;
    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      init.headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await fetch(base + urlPath, init);
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      // not JSON (a page, an image, or empty)
    }
    return { status: res.status, headers: res.headers, json, text };
  }

  // Makes an account and returns its login token.
  async function signup(username, password = "testpass123", headers) {
    const res = await request("POST", "/api/auth/signup", { body: { username, password }, headers });
    if (res.status !== 201) throw new Error(`signup ${username} failed: ${res.status} ${res.text}`);
    return res.json.token;
  }

  // A form with a photo from test/fixtures plus any extra fields.
  function photoForm(fieldName, fixture, type, fields = {}) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, String(value));
    const bytes = fs.readFileSync(path.join(FIXTURES, fixture));
    form.append(fieldName, new Blob([bytes], { type }), fixture);
    return form;
  }

  // Uploads a photo to a zone. `fields` can hold lat/lng, photoLat/photoLng.
  function submit(token, zoneId, fixture = "plain.jpg", fields = {}, type = "image/jpeg") {
    return request("POST", `/api/zones/${zoneId}/submissions`, {
      token,
      body: photoForm("photo", fixture, type, fields),
    });
  }

  async function zone(zoneId) {
    return (await request("GET", `/api/zones/${zoneId}`)).json;
  }

  // The stored file behind a /uploads/... address.
  function uploadedFile(url) {
    return path.join(uploadDir, path.basename(url));
  }

  async function stop() {
    child.kill();
    await new Promise((resolve) => setTimeout(resolve, 100));
    fs.rmSync(dataDir, { recursive: true, force: true });
  }

  return {
    base,
    request,
    signup,
    submit,
    zone,
    photoForm,
    uploadedFile,
    uploadDir,
    dataDir,
    isRunning: () => child.exitCode === null,
    output: () => output,
    stop,
  };
}

// A point about 3.3 miles (~5.3 km) north of a zone: clearly outside it.
function farFrom([lat, lng]) {
  return [lat + 0.048, lng];
}

module.exports = { startServer, farFrom, FIXTURES };
