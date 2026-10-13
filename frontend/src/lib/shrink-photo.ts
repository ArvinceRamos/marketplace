// Shrink big phone photos in the browser before upload (audit C1): less mobile data,
// and the server never has to decode a huge picture. The server still checks and
// re-encodes every photo; this is only a saving, never a security step.

/** Long edge we send. The server keeps 1600 px, so this leaves room for its resize. */
export const UPLOAD_MAX_EDGE = 2000;
/** Small enough already: send as is. */
const SMALL_BYTES = 1_500_000;

/** Width and height scaled down to fit `maxEdge` (never scaled up). */
export function fitWithin(width: number, height: number, maxEdge = UPLOAD_MAX_EDGE) {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * A JPEG at most UPLOAD_MAX_EDGE on its long edge, or the original file when it is
 * already small or the browser can't do it. Rotation from EXIF is applied by
 * createImageBitmap; the canvas drops all metadata (including GPS).
 */
export async function shrinkPhoto(file: File): Promise<File> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file; // let the server give the proper error
  }
  try {
    const size = fitWithin(bitmap.width, bitmap.height);
    if (size.width === bitmap.width && file.size <= SMALL_BYTES) return file;
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#fff"; // transparent PNGs: white, like the server does
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.88),
    );
    if (!blob || blob.size >= file.size) return file;
    const name = file.name.replace(/\.[^.]*$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  } finally {
    bitmap.close();
  }
}
