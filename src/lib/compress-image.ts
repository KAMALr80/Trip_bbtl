// Shrinks a photo in the browser before upload: max 1600px on the longest side,
// re-encoded (WebP, JPEG fallback) to roughly 300-400 KB. Redrawing on a canvas
// drops all EXIF metadata, including GPS location.
export async function compressImage(file: File, maxSide = 1600, targetBytes = 400_000): Promise<File> {
  if (!file.type.startsWith("image/")) throw new Error("Please choose a photo.");
  const bitmap = await createImageBitmap(file).catch(() => null);
  const source: CanvasImageSource & { width: number; height: number } = bitmap ?? (await new Promise<HTMLImageElement>((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = () => rej(new Error("That photo couldn't be opened.")); im.src = URL.createObjectURL(file); }));
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const w = Math.max(1, Math.round(source.width * scale)), h = Math.max(1, Math.round(source.height * scale));
  const canvas = document.createElement("canvas"); canvas.width = w; canvas.height = h;
  canvas.getContext("2d")!.drawImage(source, 0, 0, w, h);
  bitmap?.close();
  const webp = canvas.toDataURL("image/webp").startsWith("data:image/webp");
  const type = webp ? "image/webp" : "image/jpeg";
  let quality = 0.82, blob: Blob | null = null;
  for (let i = 0; i < 6; i++) {
    blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, type, quality));
    if (!blob || blob.size <= targetBytes) break;
    quality -= 0.12;
  }
  if (!blob) throw new Error("That photo couldn't be processed.");
  return new File([blob], `photo.${webp ? "webp" : "jpg"}`, { type });
}
