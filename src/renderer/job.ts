import { readRequestFrame, parseRenderRequest } from './framing.js';
import { assertBrowserIdentity } from './identity.js';
import { renderPdf } from './render.js';

try {
  assertBrowserIdentity();
  const request = parseRenderRequest(await readRequestFrame(process.stdin));
  const bytes = await renderPdf(request);
  await new Promise<void>((resolve, reject) => {
    process.stdout.once('error', reject);
    process.stdout.end(bytes, resolve);
  });
} catch {
  process.exitCode = 1;
  process.stderr.write('PDF browser job failed.\n');
}
