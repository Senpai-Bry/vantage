// Accounts: signing up, logging in, and the username rules.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./helpers");

describe("accounts", () => {
  let app;
  before(async () => (app = await startServer()));
  after(() => app.stop());

  const signupStatus = async (username, password = "testpass123") =>
    (await app.request("POST", "/api/auth/signup", { body: { username, password } })).status;

  it("signs up a new player and returns a login token", async () => {
    const res = await app.request("POST", "/api/auth/signup", {
      body: { username: "alice", password: "testpass123" },
    });
    assert.equal(res.status, 201);
    assert.ok(res.json.token);
  });

  it("rejects a username that's already taken, even with different capitals", async () => {
    assert.equal(await signupStatus("alice"), 409);
    assert.equal(await signupStatus("ALICE"), 409);
  });

  it("only allows 3-20 letters, numbers, _ or -", async () => {
    assert.equal(await signupStatus("ab"), 400);
    assert.equal(await signupStatus("a".repeat(21)), 400);
    assert.equal(await signupStatus("<b>x</b>"), 400);
    assert.equal(await signupStatus("has space"), 400);
    assert.equal(await signupStatus("me@example.com"), 400);
    assert.equal(await signupStatus(""), 400);
    assert.equal(await signupStatus("good_name-1"), 201);
  });

  it("rejects passwords shorter than 8 characters", async () => {
    assert.equal(await signupStatus("shortpw", "abc"), 400);
  });

  it("logs in, ignoring capitals in the username", async () => {
    for (const username of ["alice", "Alice"]) {
      const res = await app.request("POST", "/api/auth/login", {
        body: { username, password: "testpass123" },
      });
      assert.equal(res.status, 200);
      assert.ok(res.json.token);
    }
  });

  it("rejects a wrong password", async () => {
    const res = await app.request("POST", "/api/auth/login", {
      body: { username: "alice", password: "wrong-pass" },
    });
    assert.equal(res.status, 401);
  });

  it("rejects a made-up login token", async () => {
    const res = await app.request("GET", "/api/checkins", { token: "not-a-real-token" });
    assert.equal(res.status, 401);
  });
});
