// Zones load correctly, and the site only shares the files it should.

const { describe, it, before, after } = require("node:test");
const assert = require("node:assert/strict");
const { startServer } = require("./helpers");

describe("zones", () => {
  let app;
  let zones;
  before(async () => {
    app = await startServer();
    zones = (await app.request("GET", "/api/zones")).json;
  });
  after(() => app.stop());

  it("loads all 22 zones", () => {
    assert.equal(zones.length, 22);
  });

  it("gives every zone a border and a current challenge", () => {
    for (const zone of zones) {
      assert.ok(zone.boundary && zone.boundary.length, `${zone.id} has no border`);
      assert.ok(zone.currentChallenge, `${zone.id} has no challenge`);
    }
  });

  it("returns 404 for a zone that doesn't exist", async () => {
    assert.equal((await app.request("GET", "/api/zones/nope")).status, 404);
  });
});

describe("what the website shares", () => {
  let app;
  before(async () => (app = await startServer()));
  after(() => app.stop());

  it("serves the page, styles and scripts", async () => {
    for (const urlPath of ["/", "/css/style.css", "/js/app.js", "/js/photo.js", "/u/anyone"]) {
      assert.equal((await app.request("GET", urlPath)).status, 200, urlPath);
    }
  });

  it("keeps server code, the database, settings and .git private", async () => {
    const privatePaths = [
      "/server/index.js",
      "/server/config.js",
      "/server/.env",
      "/server/db/vantage.db",
      "/server/package.json",
      "/.git/config",
      "/.git/HEAD",
      "/README.md",
      "/.gitignore",
      "/uploads/../server/index.js",
    ];
    for (const urlPath of privatePaths) {
      const { status } = await app.request("GET", urlPath);
      assert.ok(status === 403 || status === 404, `${urlPath} answered ${status}`);
    }
  });
});
