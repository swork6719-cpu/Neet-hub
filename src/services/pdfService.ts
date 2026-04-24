import * as pdfjs from 'pdfjs-dist';
// @ts-ignore - Vite specific import
import pdfWorker from 'pdfjs-dist/build/pdf.worker.mjs?url';

pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;

export async function extractTextFromPdf(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  let fullText = '';

  for (let i = 1; i <= pdf.numPages; i++) {
    try {
      const page = await pdf.getPage(i);
      const content = await page.getTextContent();
      const strings = content.items
        .map((item: any) => item.str || '')
        .filter(str => str.trim().length > 0);
      
      if (strings.length > 0) {
        fullText += strings.join(' ') + '\n';
      }
    } catch (pageErr) {
      console.warn(`Could not read page ${i}:`, pageErr);
    }
  }

  return fullText.trim();
}

export async function pdfToImages(file: File, maxPages: number = 5): Promise<{ data: string, mimeType: string }[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise;
  const images: { data: string, mimeType: string }[] = [];

  const pagesToProcess = Math.min(pdf.numPages, maxPages);

  for (let i = 1; i <= pagesToProcess; i++) {
    const page = await pdf.getPage(i);
    const viewport = page.getViewport({ scale: 2.0 }); // Higher scale for better OCR
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    
    if (context) {
      canvas.height = viewport.height;
      canvas.width = viewport.width;

      await page.render({
        canvasContext: context,
        viewport: viewport,
        // @ts-ignore
        canvas: canvas
      }).promise;

      const base64 = canvas.toDataURL('image/jpeg', 0.8).split(',')[1];
      images.push({ data: base64, mimeType: 'image/jpeg' });
    }
  }

  return images;
}
