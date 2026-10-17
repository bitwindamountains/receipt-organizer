/** Shortest-edge size of grid thumbnails: sharp at ~220 CSS px on 2x screens. */
export const THUMB_EDGE = 480;

/** Storage key of the thumbnail for an image key, e.g. images/a.png -> thumbs/a.jpg. */
export function thumbKeyFor(imageKey: string): string {
  return `${imageKey.replace(/^images\//, 'thumbs/').replace(/\.[^./]+$/, '')}.jpg`;
}

/** Scales so the shorter edge is at most `edge`, keeping the aspect ratio. Never upscales. */
export function thumbnailSize(width: number, height: number, edge = THUMB_EDGE): { width: number; height: number } {
  const scale = Math.min(1, edge / Math.min(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Encodes a downscaled JPEG copy of an image, or returns null where decoding isn't supported. */
export async function createThumbnail(source: Blob): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function') return null;
  const bitmap = await createImageBitmap(source);
  try {
    const { width, height } = thumbnailSize(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    // JPEG has no alpha; give transparent screenshots a white page.
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    return await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.82));
  } finally {
    bitmap.close();
  }
}
