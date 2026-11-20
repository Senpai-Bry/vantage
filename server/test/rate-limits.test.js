// Speed limits, run the way they run on Railway.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./helpers");

describe("speed limits on Railway", () => {
  let app;
  before(async () => (app = await startServer({ RATE_LIMITS: "on", RAILWAY_ENVIRONMENT: "production", GEOFENCE: "off" })));
  after(() => app.stop());

  const from = (ip) => ({ "X-Real-IP": ip });
  const signupStatus = async (username, ip) =>
    (await app.request("POST", "/api/auth/signup", {
      body: { username, password: "testpass123" },
      headers: from(ip),
    })).status;
  const loginStatus = async (username, password, ip) =>
    (await app.request("POST", "/api/auth/login", { body: { username, password }, headers: from(ip) })).status;

  it("allows 5 new accounts an hour per connection, then blocks", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) statuses.push(await signupStatus(`user${i}`, "203.0.113.5"));
    assert.deepEqual(statuses, [201, 201, 201, 201, 201, 429]);
    assert.equal(await signupStatus("other1", "198.51.100.7"), 201, "a different connection is unaffected");
  });

  it("counts a whole IPv6 household block together", async () => {
    for (let i = 0; i < 5; i++) await signupStatus(`six${i}`, `2001:db8:1:2::${i + 10}`);
    assert.equal(await signupStatus("six9", "2001:db8:1:2:ffff::9"), 429);
  });

  it("never counts successful logins", async () => {
    for (let i = 0; i < 15; i++) assert.equal(await loginStatus("user0", "testpass123", "203.0.113.20"), 200);
  });

  it("blocks after 10 wrong passwords, even the right one, for that connection only", async () => {
    const statuses = [];
    for (let i = 0; i < 11; i++) statuses.push(await loginStatus("user0", "wrong-pass-1", "203.0.113.30"));
    assert.deepEqual(statuses, [...Array(10).fill(401), 429]);
    assert.equal(await loginStatus("user0", "testpass123", "203.0.113.30"), 429);
    assert.equal(await loginStatus("user0", "testpass123", "203.0.113.31"), 200);
  });

  it("allows 30 uploads an hour per player, not per connection", async () => {
    const login = async (name) =>
      (await app.request("POST", "/api/auth/login", {
        body: { username: name, password: "testpass123" },
        headers: from("203.0.113.40"),
      })).json.token;
    const first = await login("user1");
    const statuses = [];
    for (let i = 0; i < 31; i++) statuses.push((await app.submit(first, "riverfront-park")).status);
    assert.deepEqual(statuses.slice(-2), [201, 429]);
    const second = await login("user2");
    assert.equal((await app.submit(second, "riverfront-park")).status, 201);
  });

  it("explains the block in plain words", async () => {
    const res = await app.request("POST", "/api/auth/signup", {
      body: { username: "user9", password: "testpass123" },
      headers: from("203.0.113.5"),
    });
    assert.match(res.json.error, /Try again/);
  });
});

describe("speed limits off Railway", () => {
  let app;
  before(async () => (app = await startServer({ RATE_LIMITS: "on" })));
  after(() => app.stop());

  it("ignores a faked X-Real-IP header", async () => {
    const statuses = [];
    for (let i = 0; i < 6; i++) {
      const res = await app.request("POST", "/api/auth/signup", {
        body: { username: `spoof${i}`, password: "testpass123" },
        headers: { "X-Real-IP": `10.0.0.${i}` },
      });
      statuses.push(res.status);
    }
    assert.equal(statuses[5], 429);
  });
});
