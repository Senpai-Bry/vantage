// server/lib/uploads.js
//
// One shared photo uploader, used for both zone submissions and profile
// pictures. Files land in config.uploadDir (server/uploads locally, the
// persistent /data/uploads volume on Railway) and are served back at
// /uploads/<filename> by server/index.js.

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const sharp = require("sharp");
const config = require("../config");

const UPLOAD_DIR = config.uploadDir;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// The only kinds of file we accept, and the extension each one is saved
// with. The server picks the extension (never the uploader's file name), so
// a web page or script disguised as a photo still gets saved as an image
// and is served back as one, where it can't run.
// SVG is left out on purpose: SVG files can carry their own scripts.
// HEIC isn't here because the image library can't read it. iPhones convert
// HEIC photos to JPG on their own when uploading through a website.
const ALLOWED_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = ALLOWED_TYPES[file.mimetype];
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — the browser shrinks big photos first
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES[file.mimetype]) {
      return cb(new Error("Photos must be JPG, PNG or WebP."));
    }
    cb(null, true);
  },
});

// "/uploads/123-abc.jpg" -> its real path on disk (or null if it isn't one
// of ours). Used to delete an old profile picture when it's replaced.
function diskPathFor(publicPath) {
  if (typeof publicPath !== "string" || !publicPath.startsWith("/uploads/")) return null;
  const name = path.basename(publicPath);
  return path.join(UPLOAD_DIR, name);
}

function removeUpload(publicPath) {
  const file = diskPathFor(publicPath);
  if (file) fs.unlink(file, () => {});
}

// Redraws an uploaded photo as a fresh JPG and replaces the original file.
// This is what keeps players private: phone and camera photos carry hidden
// details (exact GPS location, camera serial number, the time it was
// taken) that anyone could read after downloading the photo. Redrawing
// keeps only the picture. It also:
//   - turns the photo the right way up (phones save "rotate me" as a
//     hidden detail, which would otherwise be lost),
//   - caps its size, in case the browser didn't shrink it,
//   - proves it really is an image: a disguised file fails here.
// Updates file.filename and file.path to the new file.
async function cleanPhoto(file, maxEdge) {
  const name = `${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`;
  const cleanPath = path.join(UPLOAD_DIR, name);
  try {
    await sharp(file.path)
      .rotate()
      .resize({ width: maxEdge, height: maxEdge, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 85, mozjpeg: true })
      .toFile(cleanPath);
  } catch (err) {
    fs.unlink(cleanPath, () => {});
    throw new Error("That file couldn't be read as a photo. Try a JPG or PNG.");
  } finally {
    fs.unlink(file.path, () => {});
  }
  file.filename = name;
  file.path = cleanPath;
}

module.exports = { upload, removeUpload, cleanPhoto };
