/**
 * Avatar upload validation.
 *
 * Avatars are produced exclusively by the shared ImageCropper (client-side),
 * which outputs a square JPEG capped at 512x512 via canvas.toDataURL("image/jpeg").
 * We pin the server-side contract to that shape:
 *
 *  - Only `data:image/jpeg;base64,` is accepted (rejects SVG, GIF, PNG, etc).
 *  - Base64 length is capped well under the cropper's ~80 KB typical output.
 *  - Magic bytes are checked (SOI marker `FF D8 FF`) so a client can't smuggle
 *    other formats through the JPEG label.
 *  - JPEG dimensions are parsed from the SOF marker and rejected when larger
 *    than 512x512.
 *
 * The values land in roomMembers.avatar and are re-served inline in <img>, so
 * defense-in-depth here is cheap.
 */

/** Strict cap on the data-URL payload (header + base64). ~300 KB binary. */
export const AVATAR_MAX_BASE64_BYTES = 400_000;

/** Hard upper bound for both width and height (the cropper always emits 512). */
export const AVATAR_MAX_DIMENSION = 512;

const DATA_URL_PREFIX = "data:image/jpeg;base64,";

export type AvatarParseError =
  | "wrong_format"
  | "too_large"
  | "decode_failed"
  | "not_jpeg"
  | "bad_dimensions";

export interface AvatarParseSuccess {
  ok: true;
  /** Raw image bytes (after base64 decode). */
  bytes: Buffer;
  width: number;
  height: number;
}

export interface AvatarParseFailure {
  ok: false;
  error: AvatarParseError;
}

export type AvatarParseResult = AvatarParseSuccess | AvatarParseFailure;

/**
 * Validate an avatar data URL end-to-end. Returns either the decoded bytes +
 * parsed dimensions, or a discriminated error code the caller can map to a
 * user-facing message.
 */
export function parseAvatarDataUrl(dataUrl: string): AvatarParseResult {
  if (typeof dataUrl !== "string" || !dataUrl.startsWith(DATA_URL_PREFIX)) {
    return { ok: false, error: "wrong_format" };
  }
  if (dataUrl.length > AVATAR_MAX_BASE64_BYTES) {
    return { ok: false, error: "too_large" };
  }

  let bytes: Buffer;
  try {
    bytes = Buffer.from(dataUrl.slice(DATA_URL_PREFIX.length), "base64");
  } catch {
    return { ok: false, error: "decode_failed" };
  }
  if (bytes.length < 4) return { ok: false, error: "decode_failed" };

  // JPEG SOI marker: FF D8 FF.
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8 || bytes[2] !== 0xff) {
    return { ok: false, error: "not_jpeg" };
  }

  const dims = parseJpegDimensions(bytes);
  if (!dims) return { ok: false, error: "not_jpeg" };
  if (dims.width > AVATAR_MAX_DIMENSION || dims.height > AVATAR_MAX_DIMENSION) {
    return { ok: false, error: "bad_dimensions" };
  }
  if (dims.width <= 0 || dims.height <= 0) {
    return { ok: false, error: "bad_dimensions" };
  }

  return { ok: true, bytes, width: dims.width, height: dims.height };
}

/**
 * Parse width/height from a JPEG SOFn (Start Of Frame) marker. Walks segments
 * until it hits the first SOF, ignoring DHT/DAC/JPG which sit inside the same
 * 0xC0..0xCF range but don't carry frame dimensions.
 *
 * Returns null on any malformed structure rather than throwing — callers treat
 * that as "not a JPEG we recognize" and reject the upload.
 */
function parseJpegDimensions(buf: Buffer): { width: number; height: number } | null {
  // Already validated SOI (FF D8) by caller; start scanning at byte 2.
  let i = 2;
  while (i + 8 < buf.length) {
    // Marker prefix: one or more 0xFF bytes followed by the marker code.
    if (buf[i] !== 0xff) return null;
    while (i < buf.length && buf[i] === 0xff) i++;
    if (i >= buf.length) return null;
    const marker = buf[i++];

    // Standalone markers with no length payload.
    if (marker === 0xd8 /* SOI */ || (marker >= 0xd0 && marker <= 0xd7) /* RSTn */) continue;
    if (marker === 0xd9 /* EOI */ || marker === 0xda /* SOS — start of scan, dims already passed */) return null;

    if (i + 2 > buf.length) return null;
    const segLen = buf.readUInt16BE(i);
    if (segLen < 2 || i + segLen > buf.length) return null;

    // SOF0..SOF15 carry the frame header, except 0xC4 (DHT), 0xC8 (JPG), 0xCC (DAC).
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      // segLen | precision(1) | height(2) | width(2) | ...
      if (segLen < 7) return null;
      const height = buf.readUInt16BE(i + 3);
      const width = buf.readUInt16BE(i + 5);
      return { width, height };
    }
    i += segLen;
  }
  return null;
}
