// server/lib/photos.js
//
// Each landmark's stock photo from Wikimedia Commons (data/landmark-photos.json,
// made by scripts/fetch-photos.js). The explore feed shows it on a zone's
// card until a player's photo takes the lead there.

let PHOTOS = {};
try {
  PHOTOS = require("../data/landmark-photos.json");
} catch (_) {
  console.log('No data/landmark-photos.json yet — run "npm run fetch-photos" to add landmark photos to the cards.');
}

function landmarkPhotoFor(zoneId) {
  const photo = PHOTOS[zoneId];
  if (!photo) return null;
  return { url: photo.url, pageUrl: photo.pageUrl, credit: photo.credit, license: photo.license };
}

module.exports = { landmarkPhotoFor };
