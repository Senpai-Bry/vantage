// server/lib/uploads.js
//
// One shared photo uploader, used for both zone submissions and profile
// pictures. Files land in config.uploadDir (server/uploads locally, the
// persistent /data/uploads volume on Railway) and are served back at
// /uploads/<filename> by server/index.js.

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const config = require("../config");

const UPLOAD_DIR = config.uploadDir;
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

// The only kinds of file we accept, and the extension each one is saved
// with. The server picks the extension (never the uploader's file name), so
// a web page or script disguised as a photo still gets saved as an image
// and is served back as one, where it can't run.
// SVG is left out on purpose: SVG files can carry their own scripts.
const ALLOWED_TYPES = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/heic": ".heic",
  "image/heif": ".heif",
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
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — plenty for a phone photo
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES[file.mimetype]) {
      return cb(new Error("Photos must be JPG, PNG, WebP or HEIC."));
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

module.exports = { upload, removeUpload };
