import { compressImageFile } from './imageCompression';

export const MAX_LESSON_PAGES = 5;

export interface PreparedLessonPage {
  id: string;
  base64: string;
  dataUrl: string;
  mimeType: 'image/jpeg';
  sourceLabel: string;
}

export interface ConvertLessonFilesResult {
  pages: PreparedLessonPage[];
  hitLimit: boolean;
  truncatedFromCount?: number;
}

const VIDEO_EXT_RE = /\.(mp4|mov|avi|mkv|webm|3gp|m4v|flv|wmv|mpeg|mpg|ogv)$/i;
const IMAGE_EXT_RE = /\.(jpe?g|png|webp|gif|bmp|heic|heif)$/i;

function canvasToCompressedJpeg(
  sourceCanvas: HTMLCanvasElement,
  maxDimension = 1280,
  quality = 0.75
): { dataUrl: string; base64: string } {
  const clampedQuality = Math.min(0.8, Math.max(0.7, quality));
  let targetW = sourceCanvas.width || 1280;
  let targetH = sourceCanvas.height || 720;

  if (targetW > maxDimension || targetH > maxDimension) {
    if (targetW >= targetH) {
      targetH = Math.max(1, Math.round((targetH * maxDimension) / targetW));
      targetW = maxDimension;
    } else {
      targetW = Math.max(1, Math.round((targetW * maxDimension) / targetH));
      targetH = maxDimension;
    }
  }

  const outCanvas = document.createElement('canvas');
  outCanvas.width = targetW;
  outCanvas.height = targetH;
  const ctx = outCanvas.getContext('2d');
  if (!ctx) {
    throw new Error('تعذر تهيئة ضغط الصفحة على هذا المتصفح.');
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(sourceCanvas, 0, 0, targetW, targetH);

  const dataUrl = outCanvas.toDataURL('image/jpeg', clampedQuality);
  const base64 = dataUrl.split(',')[1] || '';
  return { dataUrl, base64 };
}

async function convertPdfToPages(
  file: File,
  maxPagesToTake: number
): Promise<{ pages: PreparedLessonPage[]; totalPages: number }> {
  const pdfjsLib = await import('pdfjs-dist');
  const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;

  const buffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(buffer) });
  const pdf = await loadingTask.promise;
  const totalPages = pdf.numPages || 0;
  const count = Math.min(totalPages, maxPagesToTake);
  const pages: PreparedLessonPage[] = [];

  for (let pageNum = 1; pageNum <= count; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const unscaledViewport = page.getViewport({ scale: 1 });
    const maxUnscaled = Math.max(unscaledViewport.width, unscaledViewport.height) || 1000;
    // Render near 1280px directly for sharp text with low memory footprint
    const renderScale = Math.min(2.2, Math.max(1.2, 1280 / maxUnscaled));
    const viewport = page.getViewport({ scale: renderScale });

    const renderCanvas = document.createElement('canvas');
    renderCanvas.width = Math.max(1, Math.round(viewport.width));
    renderCanvas.height = Math.max(1, Math.round(viewport.height));
    const ctx = renderCanvas.getContext('2d');
    if (!ctx) {
      throw new Error('تعذر تجهيز صفحات ملف PDF.');
    }

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, renderCanvas.width, renderCanvas.height);

    await page.render({
      canvasContext: ctx,
      viewport,
      canvas: renderCanvas,
    } as any).promise;

    const { dataUrl, base64 } = canvasToCompressedJpeg(renderCanvas, 1280, 0.75);
    pages.push({
      id: `pdf-${Date.now()}-${pageNum}-${Math.random().toString(36).slice(2, 6)}`,
      base64,
      dataUrl,
      mimeType: 'image/jpeg',
      sourceLabel: `${file.name} (صفحة ${pageNum})`,
    });
  }

  return { pages, totalPages };
}

async function convertDocxToPages(
  file: File,
  maxPagesToTake: number
): Promise<{ pages: PreparedLessonPage[]; totalPages: number }> {
  const mammoth = await import('mammoth/mammoth.browser');
  const html2canvasModule = await import('html2canvas');
  const html2canvas = html2canvasModule.default;

  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  const html = (result?.value || '').trim();
  if (!html) {
    throw new Error('ملف Word فارغ أو لا يحتوي على نص مقروء.');
  }

  const container = document.createElement('div');
  container.setAttribute('dir', 'auto');
  container.style.position = 'fixed';
  container.style.left = '-99999px';
  container.style.top = '0';
  container.style.width = '794px';
  container.style.backgroundColor = '#ffffff';
  container.style.color = '#111827';
  container.style.padding = '36px 40px';
  container.style.fontFamily = 'Tahoma, Arial, "Segoe UI", sans-serif';
  container.style.fontSize = '17px';
  container.style.lineHeight = '1.75';
  container.style.boxSizing = 'border-box';

  const styleEl = document.createElement('style');
  styleEl.textContent = `
    h1, h2, h3, h4 { color: #0f172a; font-weight: 700; margin: 14px 0 8px; }
    p { margin: 0 0 10px; }
    ul, ol { margin: 8px 0 12px; padding-inline-start: 24px; }
    li { margin-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 12px 0; }
    td, th { border: 1px solid #cbd5e1; padding: 6px 10px; text-align: start; }
    img { max-width: 100%; height: auto; }
  `;
  container.appendChild(styleEl);

  const bodyEl = document.createElement('div');
  bodyEl.innerHTML = html;
  container.appendChild(bodyEl);
  document.body.appendChild(container);

  try {
    const fullCanvas = await html2canvas(container, {
      scale: 1.5,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    });

    // Slice into A4-proportioned pages
    const pagePixelHeight = Math.max(400, Math.round(fullCanvas.width * 1.414));
    const totalPages = Math.max(1, Math.ceil(fullCanvas.height / pagePixelHeight));
    const pagesToRender = Math.min(totalPages, maxPagesToTake);
    const pages: PreparedLessonPage[] = [];

    for (let i = 0; i < pagesToRender; i++) {
      const sy = i * pagePixelHeight;
      const sh = Math.min(pagePixelHeight, fullCanvas.height - sy);
      if (sh <= 0) break;

      const sliceCanvas = document.createElement('canvas');
      sliceCanvas.width = fullCanvas.width;
      sliceCanvas.height = sh;
      const sCtx = sliceCanvas.getContext('2d');
      if (!sCtx) continue;

      sCtx.fillStyle = '#FFFFFF';
      sCtx.fillRect(0, 0, sliceCanvas.width, sliceCanvas.height);
      sCtx.drawImage(fullCanvas, 0, sy, fullCanvas.width, sh, 0, 0, fullCanvas.width, sh);

      const { dataUrl, base64 } = canvasToCompressedJpeg(sliceCanvas, 1280, 0.75);
      pages.push({
        id: `docx-${Date.now()}-${i + 1}-${Math.random().toString(36).slice(2, 6)}`,
        base64,
        dataUrl,
        mimeType: 'image/jpeg',
        sourceLabel: totalPages > 1 ? `${file.name} (صفحة ${i + 1})` : file.name,
      });
    }

    if (pages.length === 0) {
      throw new Error('تعذر تحويل محتوى ملف Word إلى صفحات مقروءة.');
    }

    return { pages, totalPages };
  } finally {
    if (container.parentNode) {
      container.parentNode.removeChild(container);
    }
  }
}

export async function convertFilesToLessonPages(
  files: File[],
  existingCount: number
): Promise<ConvertLessonFilesResult> {
  let remainingSlots = Math.max(0, MAX_LESSON_PAGES - existingCount);
  if (remainingSlots <= 0) {
    return { pages: [], hitLimit: true };
  }

  const collected: PreparedLessonPage[] = [];
  let hitLimit = false;

  for (const file of files) {
    if (remainingSlots <= 0) {
      hitLimit = true;
      break;
    }

    const mime = (file.type || '').toLowerCase();
    const name = (file.name || '').toLowerCase();

    if (mime.startsWith('video/') || VIDEO_EXT_RE.test(name)) {
      throw new Error('ممنوع رفع الفيديو، يُسمح بالصور أو ملفات PDF و Word فقط.');
    }

    if (mime.startsWith('image/') || IMAGE_EXT_RE.test(name)) {
      const compressed = await compressImageFile(file, {
        maxDimension: 1280,
        quality: 0.75,
      });
      collected.push({
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        base64: compressed.base64,
        dataUrl: compressed.dataUrl,
        mimeType: 'image/jpeg',
        sourceLabel: file.name || 'صورة درس',
      });
      remainingSlots -= 1;
    } else if (mime === 'application/pdf' || name.endsWith('.pdf')) {
      const { pages, totalPages } = await convertPdfToPages(file, remainingSlots);
      collected.push(...pages);
      if (totalPages > remainingSlots) {
        hitLimit = true;
      }
      remainingSlots = Math.max(0, remainingSlots - pages.length);
    } else if (
      mime === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      name.endsWith('.docx')
    ) {
      const { pages, totalPages } = await convertDocxToPages(file, remainingSlots);
      collected.push(...pages);
      if (totalPages > remainingSlots) {
        hitLimit = true;
      }
      remainingSlots = Math.max(0, remainingSlots - pages.length);
    } else if (mime === 'application/msword' || name.endsWith('.doc')) {
      throw new Error('يرجى حفظ ملف Word بصيغة (.docx) أو PDF، أو تصوير صفحات الدرس مباشرة.');
    } else {
      throw new Error('نوع الملف غير مدعوم. يرجى اختيار صورة أو ملف PDF أو Word (.docx).');
    }
  }

  if (existingCount + collected.length >= MAX_LESSON_PAGES) {
    hitLimit = true;
  }

  return {
    pages: collected,
    hitLimit,
  };
}
