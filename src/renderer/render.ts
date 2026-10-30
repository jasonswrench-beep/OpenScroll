import { mkdtemp, rm } from 'node:fs/promises';
import type { Browser } from 'playwright-core';
import type { PdfRenderRequest } from '../project/pdf-protocol.js';
import { assertBrowserIdentity } from './identity.js';
import { validPdf } from './framing.js';

/** Fixed rendering policy; no caller-supplied paths, launch flags or environment. */
export async function renderPdf(request: PdfRenderRequest): Promise<Buffer> {
  assertBrowserIdentity();
  const directory = await mkdtemp('/tmp/openscroll-renderer-');
  let browser: Browser | undefined;
  try {
    const { chromium } = await import('playwright-core');
    browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true, chromiumSandbox: false, timeout: 15_000, args: ['--disable-dev-shm-usage'], env: { PATH: '/usr/bin:/bin', HOME: directory, TMPDIR: directory, XDG_CACHE_HOME: directory + '/cache', XDG_CONFIG_HOME: directory + '/config', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
    const context = await browser.newContext({ javaScriptEnabled: false, serviceWorkers: 'block', offline: true });
    await context.route('**/*', route => route.abort());
    const page = await context.newPage(); page.setDefaultTimeout(20_000);
    await page.setContent(request.html, { waitUntil: 'load', timeout: 20_000 });
    await page.emulateMedia({ media: 'print' });
    const ready = await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode().catch(() => {})));
      return [...document.images].every(image => image.complete && image.naturalWidth > 0);
    });
    if (!ready) throw new Error('An image could not be decoded.');
    const bytes = await page.pdf({ format: request.paper, tagged: true, outline: true, printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: '<div style="font:9px sans-serif;width:100%;text-align:center;color:#425e52">Page <span class="pageNumber"></span> of <span class="totalPages"></span></div>', margin: { top: '18mm', right: '18mm', bottom: '20mm', left: '18mm' } });
    if (!validPdf(bytes)) throw new Error('Invalid renderer output.');
    return bytes;
  } finally {
    await browser?.close().catch(() => {});
    await rm(directory, { recursive: true, force: true }).catch(() => {});
  }
}
