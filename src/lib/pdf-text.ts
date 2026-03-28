import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PDFParse } from 'pdf-parse';

const MAX_PDF_PAGES = 40;
const MAX_PDF_CHARACTERS = 80_000;

PDFParse.setWorker(
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

export async function extractPdfTextFromBase64(base64Data: string) {
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
