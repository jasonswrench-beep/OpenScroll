import { readFileSync } from 'node:fs';
import { PDF_BROWSER_UID, PDF_BROWSER_GID } from '../project/pdf-protocol.js';

export function assertBrowserIdentity() {
  if (process.platform !== 'linux' || process.getuid?.() !== PDF_BROWSER_UID || process.geteuid?.() !== PDF_BROWSER_UID || process.getgid?.() !== PDF_BROWSER_GID || process.getegid?.() !== PDF_BROWSER_GID || process.getgroups?.().some(group => group !== PDF_BROWSER_GID)) throw new Error('Invalid browser process identity.');
  const status = readFileSync('/proc/self/status', 'utf8');
  for (const name of ['CapInh', 'CapPrm', 'CapEff', 'CapAmb']) {
    const value = status.match(new RegExp(`^${name}:\\s*([0-9a-f]+)$`, 'mi'))?.[1];
    if (!value || BigInt('0x' + value) !== 0n) throw new Error('Browser capabilities were not dropped.');
  }
  if (!/^NoNewPrivs:\s*1$/m.test(status)) throw new Error('Browser privilege escalation is not disabled.');
}
