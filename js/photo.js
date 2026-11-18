// js/photo.js
//
// Gets a photo ready to upload, right in the browser:
//
//   readPhotoLocation(file)  the location tag saved inside a JPG, if any
//                            (phones, and many cameras paired with a
//                            phone, save where the photo was taken)
//   shrinkPhoto(file)        resizes big photos (like 20MB camera JPGs) so
//                            they upload fast and fit the 5MB limit
//
// The location tag has to be read BEFORE shrinking, because redrawing the
// photo leaves its hidden details (including the tag) behind.

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const MAX_EDGE_PX = 2560; // plenty for any screen
const JPEG_QUALITY = 0.88;

// ---------------------------------------------------------------------------
// Location tag (EXIF GPS)
// ---------------------------------------------------------------------------
// A JPG's hidden details live in an "Exif" block near the start of the file.
// Inside it, a "GPS" section holds latitude and longitude as degrees,
// minutes and seconds, plus N/S and E/W letters. Returns { lat, lng } or
// null when the photo has no tag (or isn't a JPG).
async function readPhotoLocation(file) {
  try {
    const bytes = new DataView(await file.slice(0, 256 * 1024).arrayBuffer());
    if (bytes.getUint16(0) !== 0xffd8) return null; // not a JPG

    // Walk the JPG's sections until we find the Exif one (marker 0xFFE1).
    let offset = 2;
    while (offset + 4 < bytes.byteLength) {
      const marker = bytes.getUint16(offset);
      const size = bytes.getUint16(offset + 2);
      if (marker === 0xffe1 && bytes.getUint32(offset + 4) === 0x45786966) {
        return readExifGps(bytes, offset + 10); // skip marker, size, "Exif\0\0"
      }
      if ((marker & 0xff00) !== 0xff00 || marker === 0xffda) break; // image data starts
      offset += 2 + size;
    }
  } catch (err) {
    console.warn("Couldn't read the photo's location tag:", err);
  }
  return null;
}

function readExifGps(bytes, tiffStart) {
  const little = bytes.getUint16(tiffStart) === 0x4949; // "II" = little-endian
  const u16 = (at) => bytes.getUint16(at, little);
  const u32 = (at) => bytes.getUint32(at, little);

  // Looks through one list of tags; returns the offset of the tag's entry.
  const findTag = (ifdStart, tag) => {
    const count = u16(ifdStart);
    for (let i = 0; i < count; i++) {
      const entry = ifdStart + 2 + i * 12;
      if (u16(entry) === tag) return entry;
    }
    return null;
  };

  const ifd0 = tiffStart + u32(tiffStart + 4);
  const gpsPointer = findTag(ifd0, 0x8825);
  if (gpsPointer === null) return null;
  const gps = tiffStart + u32(gpsPointer + 8);

  // Three fractions: degrees, minutes, seconds.
  const readDegrees = (tag) => {
    const entry = findTag(gps, tag);
    if (entry === null) return null;
    const at = tiffStart + u32(entry + 8);
    const part = (i) => u32(at + i * 8) / (u32(at + i * 8 + 4) || 1);
    return part(0) + part(1) / 60 + part(2) / 3600;
  };
  const readLetter = (tag) => {
    const entry = findTag(gps, tag);
    return entry === null ? null : String.fromCharCode(bytes.getUint8(entry + 8));
  };

  let lat = readDegrees(0x0002);
  let lng = readDegrees(0x0004);
  if (lat === null || lng === null || (lat === 0 && lng === 0)) return null;
  if (readLetter(0x0001) === "S") lat = -lat;
  if (readLetter(0x0003) === "W") lng = -lng;
  return { lat, lng };
}

// ---------------------------------------------------------------------------
// Shrinking
// ---------------------------------------------------------------------------
// Returns a File ready to upload. Small photos pass through untouched.
// Photos the browser can't open (for example HEIC on most non-Apple
// browsers) are sent as they are, as long as they fit the size limit.
async function shrinkPhoto(file) {
  let image;
  try {
    image = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch (err) {
    if (file.size <= MAX_UPLOAD_BYTES) return file;
    throw new Error("This photo is over 5MB and this browser can't shrink it. Export it as a JPG and try again.");
  }

  const longEdge = Math.max(image.width, image.height);
  if (longEdge <= MAX_EDGE_PX && file.size <= MAX_UPLOAD_BYTES) {
    image.close();
    return file;
  }

  const scale = Math.min(1, MAX_EDGE_PX / longEdge);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(image.width * scale);
  canvas.height = Math.round(image.height * scale);
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  image.close();

  const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  if (!blob) throw new Error("Couldn't prepare this photo. Try a different one.");
  const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
  return new File([blob], name, { type: "image/jpeg" });
}
