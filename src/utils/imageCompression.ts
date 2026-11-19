/**
 * Shared Client-Side Image Validation & Compression Helper
 * - Strictly blocks ALL video files ("ممنوع رفع أي فيديو في التطبيق نهائياً، صور فقط")
 * - Compresses every uploaded/captured image to max 1280px dimension as JPG (quality 70%–80%)
 */

export interface CompressedImageResult {
  dataUrl: string;
  base64: string;
  mimeType: 'image/jpeg';
  width: number;
  height: number;
}

const VIDEO_EXT_RE = /\.(mp4|mov|avi|mkv|webm|3gp|m4v|flv|wmv|mpeg|mpg|ogv)$/i;

export function assertImageOnlyFile(file: File): void {
  const mime = (file.type || '').toLowerCase();
  const name = (file.name || '').toLowerCase();

  if (mime.startsWith('video/') || VIDEO_EXT_RE.test(name)) {
    throw new Error('ممنوع رفع الفيديو في التطبيق نهائياً — يُسمح برفع الصور فقط.');
  }

  if (mime && !mime.startsWith('image/')) {
    throw new Error('يُسمح برفع ملفات الصور فقط (JPG / PNG).');
  }
}

export function compressImageFile(
  file: File,
  options?: { maxDimension?: number; quality?: number }
): Promise<CompressedImageResult> {
  assertImageOnlyFile(file);

  const maxDimension = Math.min(1280, Math.max(320, options?.maxDimension ?? 1280));
  const rawQuality = options?.quality ?? 0.75;
  const quality = Math.min(0.8, Math.max(0.7, rawQuality));

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width || 1280;
        let height = img.height || 720;

        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxDimension) / width));
            width = maxDimension;
          } else {
            width = Math.max(1, Math.round((width * maxDimension) / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('تعذر تهيئة ضغط الصورة على هذا المتصفح.'));
          return;
        }

        // Fill white background before drawing in case source PNG/WebP has transparency
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        const base64 = dataUrl.split(',')[1] || '';
        resolve({
          dataUrl,
          base64,
          mimeType: 'image/jpeg',
          width,
          height,
        });
      };
      img.onerror = () => reject(new Error('تعذر قراءة ملف الصورة، يرجى اختيار صورة صالحة.'));
      img.src = String(event.target?.result || '');
    };
    reader.onerror = () => reject(new Error('تعذر فتح ملف الصورة.'));
    reader.readAsDataURL(file);
  });
}

export async function recompressDataUrl(
  dataUrl: string,
  maxDimension = 1024,
  quality = 0.7
): Promise<string> {
  const clampedQuality = Math.min(0.8, Math.max(0.7, quality));
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      let width = img.width;
      let height = img.height;
      if (width > maxDimension || height > maxDimension) {
        if (width >= height) {
          height = Math.max(1, Math.round((height * maxDimension) / width));
          width = maxDimension;
        } else {
          width = Math.max(1, Math.round((width * maxDimension) / height));
          height = maxDimension;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', clampedQuality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}
