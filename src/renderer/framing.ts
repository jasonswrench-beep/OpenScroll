import type { Readable } from 'node:stream';
import { PDF_RENDER_REQUEST_LIMIT, PDF_RENDER_OUTPUT_LIMIT, type PdfRenderRequest } from '../project/pdf-protocol.js';

/** One bounded frame, accepted only after EOF; trailing bytes are invalid. */
export function readRequestFrame(input: Readable): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const header = Buffer.alloc(4);
    let headerBytes = 0, bodyBytes = 0, body: Buffer | undefined, settled = false;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      input.off('data', data); input.off('end', end); input.off('error', failure); input.off('close', closed);
      if (error) reject(error); else resolve(body!);
    };
    const failure = () => finish(new Error('Invalid renderer request.'));
    const closed = () => failure();
    const end = () => { if (headerBytes !== 4 || !body || bodyBytes !== body.length) failure(); else finish(); };
    const data = (chunk: Buffer) => {
      let offset = 0;
      if (headerBytes < 4) {
        const length = Math.min(4 - headerBytes, chunk.length);
        chunk.copy(header, headerBytes, 0, length); headerBytes += length; offset += length;
        if (headerBytes === 4) {
          const length = header.readUInt32BE();
          if (!length || length > PDF_RENDER_REQUEST_LIMIT) { failure(); return; }
          body = Buffer.allocUnsafe(length);
        }
      }
      if (offset < chunk.length) {
        if (!body || chunk.length - offset > body.length - bodyBytes) { failure(); return; }
        chunk.copy(body, bodyBytes, offset); bodyBytes += chunk.length - offset;
      }
    };
    input.on('data', data); input.once('end', end); input.once('error', failure); input.once('close', closed);
  });
}

export function parseRenderRequest(bytes: Buffer): PdfRenderRequest {
  if (!bytes.length || bytes.length > PDF_RENDER_REQUEST_LIMIT) throw new Error('Invalid renderer request.');
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid renderer request.');
  const object = value as Record<string, unknown>, keys = Object.keys(object);
  if (keys.length !== 2 || !Object.hasOwn(object, 'html') || !Object.hasOwn(object, 'paper') || typeof object.html !== 'string' || !object.html.length || typeof object.paper !== 'string' || !['A4', 'Letter'].includes(object.paper)) throw new Error('Invalid renderer request.');
  return { html: object.html, paper: object.paper as PdfRenderRequest['paper'] };
}

export function validPdf(bytes: Buffer): boolean {
  return bytes.length >= 5 && bytes.length <= PDF_RENDER_OUTPUT_LIMIT && bytes.subarray(0, 5).equals(Buffer.from('%PDF-'));
}
