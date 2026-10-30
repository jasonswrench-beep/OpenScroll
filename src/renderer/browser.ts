import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

export const BROWSER_EXECUTABLE_PATH = '/usr/bin/chromium';
export const MINIMUM_BROWSER_VERSION = '156.0.8078.79';
const minimumParts = MINIMUM_BROWSER_VERSION.split('.').map(Number);
const run = promisify(execFile);

/** Accept only a complete, bounded version response from a supported browser. */
export function assertBrowserVersion(output: string): string {
  if (output.length > 256) throw new Error('Unrecognized browser version output.');
  const part = '(?:0|[1-9]\\d{0,4})';
  const number = `${part}\\.${part}\\.${part}\\.${part}`;
  // Direct Chrome execution can report the literal "unknown" channel when its
  // launcher environment is omitted. The numeric version must still be known.
  const match = new RegExp(`^(?:Chromium (${number})(?: built on Debian GNU/Linux [1-9]\\d? \\([a-z][a-z0-9-]{0,23}\\))?|Google Chrome (${number})(?: unknown)?)$`).exec(output.trim());
  const version = match?.[1] ?? match?.[2];
  if (!version) throw new Error('Unrecognized browser version output.');
  const parts = version.split('.').map(Number);
  if (parts.some(value => value > 65535)) throw new Error('Unrecognized browser version output.');
  for (let index = 0; index < minimumParts.length; index++) {
    if (parts[index]! < minimumParts[index]!) throw new Error(`Browser version must be at least ${MINIMUM_BROWSER_VERSION}.`);
    if (parts[index]! > minimumParts[index]!) return version;
  }
  return version;
}

/** Check the same fixed executable that the unprivileged job will launch. */
export async function checkInstalledBrowser(env: NodeJS.ProcessEnv): Promise<string> {
  const { stdout } = await run(BROWSER_EXECUTABLE_PATH, ['--version'], {
    env, encoding: 'utf8', timeout: 2000, killSignal: 'SIGKILL', maxBuffer: 1024,
  });
  return assertBrowserVersion(stdout);
}
