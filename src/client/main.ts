import './style.css';
import '../shared/blocks.css';
import './block-editor.css';
import './project-workspace.js';
import './library.js';
import './outline-editor.js';
import './accounts.js';
const status = document.querySelector<HTMLParagraphElement>('#connection-status')!;
const retry = document.querySelector<HTMLButtonElement>('#retry')!;
async function checkConnection() {
  retry.disabled = true;
  status.textContent = 'Checking the authoring service…';
  try {
    const response = await fetch('/api/health', { signal: AbortSignal.timeout(5000) });
    const body: unknown = await response.json();
    if (!response.ok || typeof body !== 'object' || body === null || !('status' in body) || body.status !== 'ready') throw new Error('Unavailable');
    status.textContent = 'Connected. The authoring service and database are ready.';
  } catch {
    status.textContent = 'The authoring service or database is unavailable. Try checking again.';
  } finally { retry.disabled = false; }
}
retry.addEventListener('click', () => { void checkConnection(); });
void checkConnection();
