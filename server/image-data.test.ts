import { describe, expect, it } from "vitest";
import { isValidStoredImageDataUrl, isValidTransientImageDataUrl, sanitizeJpegDataUrl, stripJpegMetadata } from "./image-data";

function segment(marker: number, payload: Buffer) {
  const length = payload.byteLength + 2;
  return Buffer.concat([Buffer.from([0xff, marker, length >> 8, length & 0xff]), payload]);
}

function jpegWithMetadata() {
  return Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe0, Buffer.from("JFIF")),
    segment(0xe1, Buffer.from("Exif\0\0GPSLatitude=35.68;XMP=private")),
    segment(0xed, Buffer.from("IPTC location")),
    segment(0xfe, Buffer.from("private comment")),
    Buffer.from([0xff, 0xdb, 0x00, 0x02, 0xff, 0xc0, 0x00, 0x02, 0xff, 0xda, 0x00, 0x02]),
    Buffer.from([0x11, 0xff, 0x00, 0x22, 0xff, 0xd9]),
  ]);
}

function dataUrl(bytes: Buffer) {
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

describe("server-side JPEG metadata filtering", () => {
  it("removes APP and COM metadata while preserving the scan", () => {
    const sanitized = stripJpegMetadata(jpegWithMetadata());
    expect(sanitized).not.toBeNull();
    const text = sanitized!.toString("latin1");
    expect(text).not.toContain("Exif");
    expect(text).not.toContain("GPSLatitude");
    expect(text).not.toContain("XMP=private");
    expect(text).not.toContain("IPTC location");
    expect(text).not.toContain("private comment");
    expect(sanitized!.includes(Buffer.from([0xff, 0xc0]))).toBe(true);
    expect(sanitized!.includes(Buffer.from([0xff, 0xda]))).toBe(true);
    expect(sanitized!.subarray(-2).equals(Buffer.from([0xff, 0xd9]))).toBe(true);
  });

  it("validates and sanitizes AI images and rejects non-JPEG, malformed, and oversized data", () => {
    const input = dataUrl(jpegWithMetadata());
    expect(isValidTransientImageDataUrl(input)).toBe(true);
    expect(isValidStoredImageDataUrl(input)).toBe(true);
    const safeDataUrl = sanitizeJpegDataUrl(input)!;
    const safeBytes = Buffer.from(safeDataUrl.slice(safeDataUrl.indexOf(",") + 1), "base64");
    expect(safeBytes.toString("latin1")).not.toContain("GPSLatitude");
    expect(isValidTransientImageDataUrl("data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==")).toBe(false);
    expect(isValidTransientImageDataUrl("data:image/gif;base64,R0lGODlh")).toBe(false);
    expect(isValidTransientImageDataUrl("data:image/jpeg;base64,not-base64!")).toBe(false);
    expect(isValidTransientImageDataUrl(dataUrl(Buffer.from([0xff, 0xd8, 0xff, 0xd9])))).toBe(false);
    const oversized = Buffer.alloc(4 * 1024 * 1024 + 1);
    oversized.set([0xff, 0xd8, 0xff]);
    expect(isValidTransientImageDataUrl(dataUrl(oversized))).toBe(false);
  });
});
