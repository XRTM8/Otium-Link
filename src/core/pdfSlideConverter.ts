import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';
import { SlideData } from './tauriBridge';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function convertPdfToSlides(
  file: File,
  onProgress?: (current: number, total: number) => void
): Promise<SlideData[]> {
  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
  const pdf = await loadingTask.promise;
  const numPages = pdf.numPages;
  const slides: SlideData[] = [];

  for (let pageNum = 1; pageNum <= numPages; pageNum++) {
    onProgress?.(pageNum, numPages);
    const page = await pdf.getPage(pageNum);

    // Scale for crisp smart board display (target width around 1600-1920px)
    const baseViewport = page.getViewport({ scale: 1.0 });
    const targetScale = Math.min(2.0, Math.max(1.2, 1600 / baseViewport.width));
    const viewport = page.getViewport({ scale: targetScale });

    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');

    if (ctx) {
      // @ts-expect-error pdfjs-dist canvasContext typing
      await page.render({ canvasContext: ctx, viewport }).promise;
      const imageData = canvas.toDataURL('image/jpeg', 0.85);

      // Extract text content for lecture notes & quick search
      let pageText = '';
      try {
        const textContent = await page.getTextContent();
        pageText = textContent.items
          // @ts-expect-error pdfjs-dist TextItem typing
          .map((item) => item.str || '')
          .filter(Boolean)
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim();
      } catch {
        pageText = '';
      }

      const shortTitle = pageText
        ? pageText.slice(0, 45).trim() + (pageText.length > 45 ? '...' : '')
        : `شريحة #${pageNum}`;

      slides.push({
        index: pageNum - 1,
        total: numPages,
        title: shortTitle,
        text: pageText || `محتوى الشريحة رقم ${pageNum} من ملف ${file.name}`,
        image_data: imageData,
      });
    }
  }

  return slides;
}
