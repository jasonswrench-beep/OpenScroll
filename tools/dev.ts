import { spawn } from 'node:child_process';
import { runtimeEnvironment } from './runtime-environment.mjs';
const children = [
  spawn(process.execPath, ['--import', 'tsx', 'src/server/index.ts'], { stdio: 'inherit', env: { ...runtimeEnvironment(), NODE_ENV: 'development' } }),
  spawn(process.execPath, ['node_modules/vite/bin/vite.js'], { stdio: 'inherit', env: runtimeEnvironment() }),
];
let stopping = false;
function stop(code: number) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) child.kill('SIGTERM');
}
for (const child of children) {
  child.on('error', () => stop(1));
  child.on('exit', code => stop(code ?? 1));
}
process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));
