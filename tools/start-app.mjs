import { spawn } from 'node:child_process';
import { runtimeEnvironment } from './runtime-environment.mjs';
const child = spawn(process.execPath, ['dist/server/src/server/index.js'], { stdio: 'inherit', env: runtimeEnvironment() });
child.once('error', () => { console.error('OpenScroll application could not be launched.'); process.exitCode = 1; });
child.once('exit', (code, signal) => { process.exitCode = code ?? (signal ? 1 : 0); });
for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => { child.kill(signal); });
