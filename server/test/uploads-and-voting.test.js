// Photo uploads (geofence, file checks, privacy) and voting.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const sharp = require("sharp");
const { startServer, farFrom } = require("./helpers");

describe("uploading photos", () => {
  let app;
  let alice;
  let here; // [lat, lng] inside riverfront-park
  before(async () => {
    app = await startServer();
    alice = await app.signup("alice");
    here = (await app.zone("riverfront-park")).coords;
  });
  after(() => app.stop());

  const inZone = () => ({ lat: here[0], lng: here[1] });

  it("needs a login", async () => {
    const res = await app.submit(null, "riverfront-park", "plain.jpg", inZone());
    assert.equal(res.status, 401);
  });

  it("rejects an upload with no location from someone who hasn't checked in", async () => {
    const res = await app.submit(alice, "riverfront-park");
    assert.equal(res.status, 400);
  });

  it("rejects an upload from outside the zone, saying how far away you are", async () => {
    const [lat, lng] = farFrom(here);
    const res = await app.submit(alice, "riverfront-park", "plain.jpg", { lat, lng });
    assert.equal(res.status, 403);
    assert.match(res.json.error, /miles/);
  });

  it("accepts an upload from inside the zone", async () => {
    const res = await app.submit(alice, "riverfront-park", "plain.jpg", inZone());
    assert.equal(res.status, 201);
  });

  it("accepts PNG and WebP and stores everything as JPG", async () => {
    for (const [fixture, type] of [["plain.png", "image/png"], ["plain.webp", "image/webp"]]) {
      const res = await app.submit(alice, "riverfront-park", fixture, inZone(), type);
      assert.equal(res.status, 201, fixture);
      assert.match(res.json.photoUrl, /\.jpg$/);
    }
  });

  it("rejects SVG, HEIC, text and other non-photo types", async () => {
    for (const [fixture, type] of [
      ["evil.svg", "image/svg+xml"],
      ["plain.jpg", "image/heic"],
      ["not-a-photo.html", "text/html"],
    ]) {
      const res = await app.submit(alice, "riverfront-park", fixture, inZone(), type);
      assert.equal(res.status, 400, `${fixture} as ${type}`);
    }
  });

  it("rejects a web page disguised as a JPG, and leaves no file behind", async () => {
    const before = fs.readdirSync(app.uploadDir).length;
    const res = await app.submit(alice, "riverfront-park", "not-a-photo.html", inZone(), "image/jpeg");
    assert.equal(res.status, 400);
    assert.equal(fs.readdirSync(app.uploadDir).length, before);
  });

  it("rejects files over 5MB", async () => {
    const form = new FormData();
    form.append("lat", String(here[0]));
    form.append("lng", String(here[1]));
    form.append("photo", new Blob([Buffer.alloc(6 * 1024 * 1024)], { type: "image/jpeg" }), "big.jpg");
    const res = await app.request("POST", "/api/zones/riverfront-park/submissions", { token: alice, body: form });
    assert.equal(res.status, 400);
  });

  it("strips hidden details (GPS, camera, serial number) from stored photos", async () => {
    const res = await app.submit(alice, "riverfront-park", "phone-at-riverfront-park.jpg", inZone());
    assert.equal(res.status, 201);
    const stored = app.uploadedFile(res.json.photoUrl);
    const meta = await sharp(stored).metadata();
    assert.equal(meta.exif, undefined, "stored photo still has EXIF");
    const bytes = fs.readFileSync(stored).toString("latin1");
    assert.ok(!bytes.includes("iPhone") && !bytes.includes("SN123456"));
  });

  it("serves uploads as images with nosniff", async () => {
    const res = await app.submit(alice, "riverfront-park", "plain.jpg", inZone());
    const file = await fetch(app.base + res.json.photoUrl);
    assert.equal(file.headers.get("content-type"), "image/jpeg");
    assert.equal(file.headers.get("x-content-type-options"), "nosniff");
  });

  it("rejects a photo whose location tag is at a different zone", async () => {
    // Standing at Azalea Park, but the photo says it was taken at Riverfront Park.
    const [lat, lng] = (await app.zone("azalea-park")).coords;
    const res = await app.submit(alice, "azalea-park", "phone-at-riverfront-park.jpg", {
      lat,
      lng,
      photoLat: here[0],
      photoLng: here[1],
    });
    assert.equal(res.status, 403);
    assert.match(res.json.error, /location tag/);
  });

  it("returns 404 for a zone that doesn't exist", async () => {
    const res = await app.submit(alice, "nope", "plain.jpg", inZone());
    assert.equal(res.status, 404);
  });
});

describe("turning photos the right way up", () => {
  let app;
  before(async () => (app = await startServer({ GEOFENCE: "off" })));
  after(() => app.stop());

  it("applies the phone's rotation flag, so portrait photos stay portrait", async () => {
    // The fixture is saved landscape (1600x1200) with a "rotate 90°" flag,
    // the way phones save portrait photos.
    const token = await app.signup("rotator");
    const res = await app.submit(token, "azalea-park", "phone-at-azalea-park.jpg");
    assert.equal(res.status, 201);
    const meta = await sharp(app.uploadedFile(res.json.photoUrl)).metadata();
    assert.ok(meta.height > meta.width, `stored as ${meta.width}x${meta.height}`);
  });
});

describe("voting", () => {
  let app;
  let alice, bob, cara;
  let aliceShot, bobShot;
  before(async () => {
    app = await startServer({ GEOFENCE: "off" });
    [alice, bob, cara] = [await app.signup("alice"), await app.signup("bob"), await app.signup("cara")];
    aliceShot = (await app.submit(alice, "riverfront-park")).json.id;
    bobShot = (await app.submit(bob, "riverfront-park")).json.id;
  });
  after(() => app.stop());

  const vote = (token, id) => app.request("POST", `/api/submissions/${id}/vote`, { token });

  it("won't let you vote for your own photo", async () => {
    assert.equal((await vote(alice, aliceShot)).status, 403);
  });

  it("needs a login", async () => {
    assert.equal((await vote(null, aliceShot)).status, 401);
  });

  it("returns 404 for a photo that doesn't exist", async () => {
    assert.equal((await vote(alice, 999999)).status, 404);
  });

  it("gives the zone to the photo with the most votes", async () => {
    await vote(bob, aliceShot);
    assert.equal((await app.zone("riverfront-park")).owner, "alice");

    await vote(alice, bobShot);
    await vote(cara, bobShot);
    assert.equal((await app.zone("riverfront-park")).owner, "bob");
  });

  it("scores 10 points per zone held plus 1 per vote received", async () => {
    const board = (await app.request("GET", "/api/leaderboard")).json.data;
    const bobRow = board.find((row) => row.username === "bob");
    assert.equal(bobRow.score, 10 * 1 + 2);
    assert.equal(board[0].username, "bob");
  });
});
