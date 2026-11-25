const MAX_TRANSIENT_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_STORED_IMAGE_BYTES = 5 * 1024 * 1024;
const DATA_URL = /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/i;
const EOI = Buffer.from([0xff, 0xd9]);

/** Remove JPEG APP0–APP15 and COM segments, which can carry EXIF/GPS, XMP, IPTC, or comments. */
export function stripJpegMetadata(bytes: Buffer): Buffer | null {
  if (bytes.length < 16 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const segments: Buffer[] = [bytes.subarray(0, 2)];
  let offset = 2;
  let foundScan = false;

  while (offset < bytes.length) {
    const start = offset;
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset++];
    if (marker === 0x00 || marker === 0xd8 || marker === 0xd9) return null;

    if (marker === 0xda) {
      if (offset + 2 > bytes.length) return null;
      const length = bytes.readUInt16BE(offset);
      const scanStart = offset + length;
      if (length < 2 || scanStart > bytes.length) return null;
      const end = bytes.lastIndexOf(EOI);
      if (end < scanStart) return null;
      segments.push(bytes.subarray(start, end + EOI.length));
      foundScan = true;
      break;
    }

    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      segments.push(bytes.subarray(start, offset));
      continue;
    }

    if (offset + 2 > bytes.length) return null;
    const length = bytes.readUInt16BE(offset);
    if (length < 2 || offset + length > bytes.length) return null;
    const end = offset + length;
    const isMetadata = (marker >= 0xe0 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) segments.push(bytes.subarray(start, end));
    offset = end;
  }

  return foundScan ? Buffer.concat(segments) : null;
}

export function sanitizeJpegDataUrl(value: string, maxBytes = MAX_TRANSIENT_IMAGE_BYTES): string | null {
  const match = DATA_URL.exec(value);
  if (!match || value.length > 7_500_000) return null;
  const encoded = match[1];
  const bytes = Buffer.from(encoded, "base64");
  if (bytes.byteLength > maxBytes) return null;
  if (bytes.toString("base64").replace(/=+$/, "") !== encoded.replace(/=+$/, "")) return null;
  const sanitized = stripJpegMetadata(bytes);
  if (!sanitized || sanitized.byteLength > maxBytes) return null;
  return `data:image/jpeg;base64,${sanitized.toString("base64")}`;
}

export function isValidTransientImageDataUrl(value: string): boolean {
  return sanitizeJpegDataUrl(value, MAX_TRANSIENT_IMAGE_BYTES) !== null;
}

export function isValidStoredImageDataUrl(value: string): boolean {
  return sanitizeJpegDataUrl(value, MAX_STORED_IMAGE_BYTES) !== null;
}
