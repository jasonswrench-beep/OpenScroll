/** Local, length-prefixed protocol. These constants have no platform dependencies. */
export const PDF_RENDER_REQUEST_LIMIT=32*1024*1024;
export const PDF_RENDER_OUTPUT_LIMIT=32*1024*1024;
export const PDF_WORKER_DEADLINE_MS=45000;
export const PDF_CLIENT_DEADLINE_MS=47000;
export const PDF_BROWSER_UID=65532;
export const PDF_BROWSER_GID=65532;
export const PDF_STATUS_OK=0;
export const PDF_STATUS_ERROR=1;
export const PDF_STATUS_BUSY=2;
export type PdfPaper='A4'|'Letter';
export interface PdfRenderRequest {html:string;paper:PdfPaper;}
