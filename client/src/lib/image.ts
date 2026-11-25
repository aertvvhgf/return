export async function imageToSanitizedJpegDataUrl(file: File, maxDimension: number, quality: number): Promise<string> {
  const bitmap = await createImageBitmap(file);
  try {
    const bound = Math.max(64, Math.min(4096, Math.floor(maxDimension)));
    const scale = Math.min(1, bound / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) throw new Error("画像を処理できませんでした。");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // Canvas re-encoding removes original EXIF, including embedded camera GPS metadata.
    return canvas.toDataURL("image/jpeg", Math.max(0.1, Math.min(0.95, quality)));
  } finally {
    bitmap.close();
  }
}
