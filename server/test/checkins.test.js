// Check-ins: prove you were at a zone, then upload from anywhere for 48 hours.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer, farFrom } = require("./helpers");

describe("check-ins", () => {
  let app;
  let azalea, riverfront, home;
  before(async () => {
    app = await startServer();
    azalea = (await app.zone("azalea-park")).coords;
    riverfront = (await app.zone("riverfront-park")).coords;
    home = farFrom(azalea);
  });
  after(() => app.stop());

  const checkin = (token, zoneId, [lat, lng] = []) =>
    app.request("POST", `/api/zones/${zoneId}/checkin`, {
      token,
      body: lat === undefined ? {} : { lat, lng },
    });
  const myCheckins = async (token) => (await app.request("GET", "/api/checkins", { token })).json;
  const at = ([lat, lng]) => ({ lat, lng });

  it("uploading while in the zone checks you in automatically, for 48 hours", async () => {
    const token = await app.signup("onsite");
    assert.equal((await app.submit(token, "azalea-park", "plain.jpg", at(azalea))).status, 201);
    const mine = await myCheckins(token);
    assert.equal(mine.windowHours, 48);
    assert.deepEqual(mine.checkins.map((c) => c.zoneId), ["azalea-park"]);
    const { checkedInAt, expiresAt } = mine.checkins[0];
    assert.equal(expiresAt - checkedInAt, 48 * 60 * 60 * 1000);
  });

  it("won't check you in from outside the zone, or without a location", async () => {
    const token = await app.signup("athome1");
    assert.equal((await checkin(token, "azalea-park", home)).status, 403);
    assert.equal((await checkin(token, "azalea-park")).status, 400);
    assert.equal((await checkin(null, "azalea-park", azalea)).status, 401);
    assert.equal((await checkin(token, "nope", azalea)).status, 404);
  });

  it("after checking in, you can upload from home or a laptop with no location", async () => {
    const token = await app.signup("athome2");
    assert.equal((await app.submit(token, "azalea-park", "plain.jpg", at(home))).status, 403);
    assert.equal((await checkin(token, "azalea-park", azalea)).status, 201);
    assert.equal((await app.submit(token, "azalea-park", "plain.jpg", at(home))).status, 201);
    assert.equal((await app.submit(token, "azalea-park")).status, 201);
  });

  it("a check-in only unlocks that one zone", async () => {
    const token = await app.signup("onezone");
    await checkin(token, "azalea-park", azalea);
    assert.equal((await app.submit(token, "riverfront-park", "plain.jpg", at(home))).status, 403);
  });

  it("still rejects a photo tagged far from the zone, but allows a little GPS drift", async () => {
    const token = await app.signup("tagger");
    await checkin(token, "azalea-park", azalea);
    const tagged = ([photoLat, photoLng]) => app.submit(token, "azalea-park", "plain.jpg", { photoLat, photoLng });
    assert.equal((await tagged(riverfront)).status, 403);
    assert.equal((await tagged(azalea)).status, 201);
    assert.equal((await tagged([azalea[0] + 0.0025, azalea[1]])).status, 201); // ~280m off
  });
});

describe("check-in windows run out", () => {
  let app;
  before(async () => (app = await startServer({ CHECKIN_HOURS: "0.0005" }))); // ~2 seconds
  after(() => app.stop());

  it("stops allowing remote uploads once the window ends", async () => {
    const token = await app.signup("expiry");
    const [lat, lng] = (await app.zone("azalea-park")).coords;
    await app.request("POST", "/api/zones/azalea-park/checkin", { token, body: { lat, lng } });
    assert.equal((await app.submit(token, "azalea-park")).status, 201);
    await new Promise((resolve) => setTimeout(resolve, 2500));
    assert.equal((await app.submit(token, "azalea-park")).status, 400);
  });
});
