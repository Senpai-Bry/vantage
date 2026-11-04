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

const storage = multer.diskStorage({
  destination: UPLOAD_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    cb(null, `${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB — plenty for a phone photo
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      return cb(new Error("Only image files are allowed."));
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
