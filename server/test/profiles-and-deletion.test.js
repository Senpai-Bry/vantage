// Player profiles, editing, profile pictures, and deleting an account.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const sharp = require("sharp");
const { startServer } = require("./helpers");

describe("profiles", () => {
  let app;
  let alice;
  before(async () => {
    app = await startServer({ GEOFENCE: "off" });
    alice = await app.signup("alice");
  });
  after(() => app.stop());

  const edit = (token, fields) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return app.request("PUT", "/api/users/me", { token, body: form });
  };

  it("shows a player's profile, and 404 for someone who doesn't exist", async () => {
    assert.equal((await app.request("GET", "/api/users/alice")).status, 200);
    assert.equal((await app.request("GET", "/api/users/nobody")).status, 404);
  });

  it("saves bio, home city and gear", async () => {
    const res = await edit(alice, { bio: "Golden hour chaser.", homeCity: "Goose Creek", gear: "Sony a6400" });
    assert.equal(res.status, 200);
    const profile = (await app.request("GET", "/api/users/alice")).json;
    assert.equal(profile.bio, "Golden hour chaser.");
    assert.equal(profile.gear, "Sony a6400");
  });

  it("rejects a bio over 160 characters", async () => {
    assert.equal((await edit(alice, { bio: "x".repeat(161) })).status, 400);
  });

  it("stores player text as-is; the page shows it as text, never as HTML", async () => {
    await edit(alice, { bio: "<img src=x onerror=alert(1)>" });
    const profile = (await app.request("GET", "/api/users/alice")).json;
    assert.equal(profile.bio, "<img src=x onerror=alert(1)>");
    const profileScript = fs.readFileSync(require.resolve("../../js/profile.js"), "utf8");
    assert.match(profileScript, /escapeHTML\(/);
  });

  it("cleans profile pictures and shrinks them to 512px", async () => {
    const res = await app.request("PUT", "/api/users/me", {
      token: alice,
      body: app.photoForm("avatar", "phone-at-azalea-park.jpg", "image/jpeg"),
    });
    assert.equal(res.status, 200);
    const meta = await sharp(app.uploadedFile(res.json.avatarUrl)).metadata();
    assert.equal(Math.max(meta.width, meta.height), 512);
    assert.equal(meta.exif, undefined);
  });

  it("rejects a disguised file as a profile picture", async () => {
    const res = await app.request("PUT", "/api/users/me", {
      token: alice,
      body: app.photoForm("avatar", "not-a-photo.html", "image/jpeg"),
    });
    assert.equal(res.status, 400);
  });
});

describe("deleting an account", () => {
  let app;
  let holder, dave, erin;
  before(async () => {
    app = await startServer({ GEOFENCE: "off" });
    [holder, dave, erin] = [await app.signup("holder"), await app.signup("dave"), await app.signup("erin")];
    const holderShot = (await app.submit(holder, "azalea-park")).json.id;
    const daveShot = (await app.submit(dave, "azalea-park")).json.id;
    // holder's photo leads 2-1, so holder holds the zone
    await app.request("POST", `/api/submissions/${holderShot}/vote`, { token: dave });
    await app.request("POST", `/api/submissions/${holderShot}/vote`, { token: erin });
    await app.request("POST", `/api/submissions/${daveShot}/vote`, { token: erin });
    await app.request("POST", `/api/submissions/${daveShot}/vote`, { token: holder });
    await app.request("POST", "/api/zones/azalea-park/checkin", { token: holder, body: {} });
  });
  after(() => app.stop());

  const remove = (token, password) => app.request("DELETE", "/api/users/me", { token, body: { password } });

  it("needs the right password", async () => {
    assert.equal((await remove(holder, "wrong-pass")).status, 401);
    assert.equal((await remove(null, "testpass123")).status, 401);
  });

  it("deletes the account, its photos and votes, and passes its turf on", async () => {
    assert.equal((await app.zone("azalea-park")).owner, "holder");
    const filesBefore = fs.readdirSync(app.uploadDir).length;

    assert.equal((await remove(holder, "testpass123")).status, 200);

    const login = await app.request("POST", "/api/auth/login", { body: { username: "holder", password: "testpass123" } });
    assert.equal(login.status, 401);
    assert.equal((await app.request("GET", "/api/users/holder")).status, 404);
    assert.equal((await app.zone("azalea-park")).owner, "dave");

    const photos = (await app.request("GET", "/api/zones/azalea-park/submissions")).json;
    assert.ok(photos.every((p) => p.username !== "holder"));
    const daveRow = photos.find((p) => p.username === "dave");
    assert.equal(daveRow.voteCount, 1, "holder's vote for dave should be gone");
    assert.equal(fs.readdirSync(app.uploadDir).length, filesBefore - 1);
  });

  it("refuses the deleted account's old login everywhere, without crashing", async () => {
    assert.equal((await app.submit(holder, "azalea-park")).status, 401);
    assert.equal((await app.request("POST", "/api/submissions/1/vote", { token: holder })).status, 401);
    assert.equal((await app.request("PUT", "/api/users/me", { token: holder, body: new FormData() })).status, 401);
    assert.ok(app.isRunning(), "server crashed");
    assert.equal((await app.request("GET", "/api/zones")).status, 200);
  });
});
