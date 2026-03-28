import path from 'node:path';
import { pathToFileURL } from 'node:url';

const MAX_PDF_PAGES = 40;
const MAX_PDF_CHARACTERS = 80_000;
let pdfParseModulePromise: Promise<typeof import('pdf-parse')> | null = null;

async function ensurePdfGeometryGlobals() {
  const pdfGlobals = globalThis as Record<string, unknown>;

  if (
    pdfGlobals['DOMMatrix'] &&
    pdfGlobals['DOMPoint'] &&
    pdfGlobals['DOMRect']
  ) {
    return;
  }

  const geometry = await import('@napi-rs/canvas');

  pdfGlobals['DOMMatrix'] ??= geometry.DOMMatrix as unknown;
  pdfGlobals['DOMPoint'] ??= geometry.DOMPoint as unknown;
  pdfGlobals['DOMRect'] ??= geometry.DOMRect as unknown;
}

async function loadPdfParse() {
  if (!pdfParseModulePromise) {
    pdfParseModulePromise = (async () => {
      await ensurePdfGeometryGlobals();
      const pdfParseModule = await import('pdf-parse');

      pdfParseModule.PDFParse.setWorker(
        pathToFileURL(
          path.join(
            process.cwd(),
            'node_modules',
            'pdf-parse',
            'dist',
            'pdf-parse',
            'cjs',
            'pdf.worker.mjs'
          )
        ).toString()
      );

      return pdfParseModule;
    })().catch((error) => {
      pdfParseModulePromise = null;
      throw error;
    });
  }

  return pdfParseModulePromise;
}

export async function extractPdfTextFromBase64(base64Data: string) {
  const { PDFParse } = await loadPdfParse();
  const bytes = Buffer.from(base64Data, 'base64');
  const parser = new PDFParse({ data: bytes });

  try {
    const result = await parser.getText();
    const pages = Array.isArray(result.pages) ? result.pages : [];
    const pageCount = pages.length || result.total || 0;
    const pagesToRead = pages.slice(0, MAX_PDF_PAGES);
    const sections: string[] = [];
    let remainingCharacters = MAX_PDF_CHARACTERS;
    let truncated = pageCount > MAX_PDF_PAGES;

    for (const [pageIndex, page] of pagesToRead.entries()) {
      if (remainingCharacters <= 0) {
        truncated = true;
        break;
      }

      const pageText =
        typeof page.text === 'string'
          ? page.text.replace(/\n{3,}/g, '\n\n').trim()
          : '';

      if (!pageText) {
        continue;
      }

      const nextChunk = pageText.slice(0, remainingCharacters);
      if (nextChunk.length < pageText.length) {
        truncated = true;
      }

      sections.push(`[Page ${pageIndex + 1}]\n${nextChunk}`);
      remainingCharacters -= nextChunk.length;
    }

    return {
      pageCount,
      truncated,
      text: sections.join('\n\n').trim(),
    };
  } finally {
    await parser.destroy();
  }
}
