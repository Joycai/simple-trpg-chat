import { describe, it, expect } from "vitest";
import {
  AVATAR_MAX_BASE64_BYTES,
  AVATAR_MAX_DIMENSION,
  parseAvatarDataUrl,
} from "../avatars";

/**
 * Build a minimal valid JPEG (SOI + APP0/JFIF + SOF0 with the requested
 * dimensions + a tiny SOS and EOI). Just enough bytes for the SOFn parser to
 * read width/height. Used to exercise the dimension guard without dragging in
 * a real encoder.
 */
function makeJpeg(width: number, height: number): Buffer {
  const sof = Buffer.alloc(2 + 6 + 3); // marker(2) + segLen(2) + precision(1) + h(2) + w(2) + comps(1) + ...
  // Marker FFC0
  sof[0] = 0xff;
  sof[1] = 0xc0;
  // Length = 8 + 3*1 = 11 (precision + h + w + Nf + 1 component spec)
  sof.writeUInt16BE(11, 2);
  sof[4] = 8; // precision
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  sof[9] = 1; // 1 component
  sof[10] = 1;
  sof[11] = 0x11;
  sof[12] = 0;

  return Buffer.concat([
    // SOI
    Buffer.from([0xff, 0xd8]),
    // APP0/JFIF (skipped by parser since not SOF)
    Buffer.from([0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]),
    sof,
    // EOI
    Buffer.from([0xff, 0xd9]),
  ]);
}

function jpegDataUrl(buf: Buffer): string {
  return `data:image/jpeg;base64,${buf.toString("base64")}`;
}

describe("parseAvatarDataUrl", () => {
  it("accepts a valid 512x512 JPEG", () => {
    const res = parseAvatarDataUrl(jpegDataUrl(makeJpeg(512, 512)));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.width).toBe(512);
      expect(res.height).toBe(512);
    }
  });

  it("accepts smaller JPEGs (under the cap)", () => {
    const res = parseAvatarDataUrl(jpegDataUrl(makeJpeg(256, 128)));
    expect(res.ok).toBe(true);
  });

  it("rejects SVG data URLs (XSS guard)", () => {
    const svg = "data:image/svg+xml;base64,PHN2Zy8+";
    const res = parseAvatarDataUrl(svg);
    expect(res).toEqual({ ok: false, error: "wrong_format" });
  });

  it("rejects PNG even though it's a real image type", () => {
    const png = "data:image/png;base64,iVBORw0KGgo=";
    const res = parseAvatarDataUrl(png);
    expect(res).toEqual({ ok: false, error: "wrong_format" });
  });

  it("rejects raw text disguised as JPEG", () => {
    // Base64 of "not a real jpeg" — first bytes are not FF D8 FF.
    const fake = "data:image/jpeg;base64,bm90IGEgcmVhbCBqcGVn";
    const res = parseAvatarDataUrl(fake);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("not_jpeg");
  });

  it("rejects oversize payloads before decoding", () => {
    const oversized = `data:image/jpeg;base64,${"A".repeat(AVATAR_MAX_BASE64_BYTES)}`;
    const res = parseAvatarDataUrl(oversized);
    expect(res).toEqual({ ok: false, error: "too_large" });
  });

  it("rejects JPEGs larger than the dimension cap", () => {
    const res = parseAvatarDataUrl(jpegDataUrl(makeJpeg(AVATAR_MAX_DIMENSION + 1, 256)));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("bad_dimensions");
  });

  it("rejects zero-dimension JPEGs", () => {
    const res = parseAvatarDataUrl(jpegDataUrl(makeJpeg(0, 0)));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("bad_dimensions");
  });

  it("rejects non-string input", () => {
    // @ts-expect-error — explicitly testing the runtime guard.
    const res = parseAvatarDataUrl(null);
    expect(res).toEqual({ ok: false, error: "wrong_format" });
  });
});
