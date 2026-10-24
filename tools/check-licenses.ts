import { readFileSync } from 'node:fs';
const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
const allowed = new Set(['MIT-0', 'MIT', 'ISC', 'Apache-2.0', 'BSD-2-Clause', 'BSD-3-Clause', '0BSD', 'BlueOak-1.0.0', 'Python-2.0', '(MIT OR CC0-1.0)', '(MIT OR Apache-2.0)']);
let failed = false;
for (const [path, value] of Object.entries(lock.packages) as [string, { license?: string; dev?: boolean }][]) {
  if (!path) continue;
  // MPL build/test tools stay outside the runtime. See docs/DEPENDENCIES.md.
  if (value.license === 'MPL-2.0' && value.dev) continue;
  if (!value.license || !allowed.has(value.license)) {
    console.error(`${path}: unreviewed license ${value.license ?? 'missing'}`);
    failed = true;
  }
}
if (failed) process.exitCode = 1;
else console.log('All locked dependency licenses match the reviewed policy.');
