import { MAX_IMAGE_EDGE } from "@/lib/measurement-import/limits";

// Shrink a phone photo before upload. Phone JPEGs run 2 to 9 MB and Vercel caps request bodies
// at 4.5 MB; handwriting is still readable at 2000 px on the long edge. PDFs and anything that
// cannot be decoded are returned untouched.
export async function downscaleImage(file: File, maxEdge: number = MAX_IMAGE_EDGE): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    return file;
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.85));
  if (!blob) return file;
  const base = file.name.replace(/\.[^.]+$/, "") || "form";
  return new File([blob], `${base}.jpg`, { type: "image/jpeg" });
}
