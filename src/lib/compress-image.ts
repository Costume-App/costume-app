import { fitWithinMax } from "@/lib/image-fit";

// Resize an image File to <=`max`px on the longest side and re-encode as JPEG.
export async function compressImage(file: File, max = 800, quality = 0.7): Promise<Blob> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error("Couldn't read the image"));
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Couldn't load the image"));
    el.src = dataUrl;
  });
  const { width, height } = fitWithinMax(img.naturalWidth, img.naturalHeight, max);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Image processing isn't supported here");
  ctx.drawImage(img, 0, 0, width, height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("Couldn't process the image");
  return blob;
}
