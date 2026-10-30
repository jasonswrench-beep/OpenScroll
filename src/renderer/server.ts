import { createServer, type Socket } from 'node:net';
import { chmod, lstat, mkdir, readFile, readdir, readlink, unlink } from 'node:fs/promises';
import { dirname, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PDF_BROWSER_UID, PDF_BROWSER_GID, PDF_RENDER_OUTPUT_LIMIT, PDF_WORKER_DEADLINE_MS, PDF_STATUS_OK, PDF_STATUS_ERROR } from '../project/pdf-protocol.js';
import { parseRenderRequest, readRequestFrame, validPdf } from './framing.js';
import { rejectBusyConnection } from './connection.js';

const socketPath = process.env.PDF_RENDERER_SOCKET ?? '/run/openscroll-renderer/renderer.sock';
const clientGroup = Number(process.env.PDF_RENDERER_CLIENT_GID ?? process.getgid?.());
const jobPath = fileURLToPath(new URL('./job.js', import.meta.url));
const cleanupPath = fileURLToPath(new URL('./cleanup.js', import.meta.url));
const minimalEnvironment = { PATH: '/usr/bin:/bin', HOME: '/tmp', TMPDIR: '/tmp', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' };
let active = false, exiting = false, privateNamespaceVerified = false;
function fatal(): never {
  if (!exiting) { exiting = true; console.error('PDF renderer stopped because isolation could not be guaranteed.'); }
  process.exit(1); // Container restart terminates the entire private PID namespace.
}
const missing = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && ['ENOENT', 'ESRCH'].includes(String(error.code));

/** Refuse dangerous launch modes before enabling a namespace-wide signal. */
async function verifyPrivateNamespace() {
  const marker = await lstat('/.dockerenv');
  const executable = await readlink('/proc/1/exe');
  const argv = (await readFile('/proc/1/cmdline', 'utf8')).split('\0');
  const status = await readFile('/proc/1/status', 'utf8');
  const paths = ['/sbin/docker-init', '/usr/sbin/docker-init', '/usr/bin/docker-init'];
  if (process.pid <= 1 || process.ppid !== 1 || !marker.isFile() || marker.uid !== 0 || !paths.includes(executable) || !paths.includes(argv[0] ?? '') || argv[1] !== '--' || !/^Uid:\s*0\s+0\s+0\s+0\s*$/m.test(status)) throw new Error('A private Docker init namespace is required.');
  privateNamespaceVerified = true;
}

/** Verify reaping after the kernel has signalled every possible browser descendant. */
async function browserPids(): Promise<number[]> {
  const found: number[] = [];
  await Promise.all((await readdir('/proc')).filter(name => /^\d+$/.test(name)).map(async name => {
    let status: string;
    try { status = await readFile('/proc/' + name + '/status', 'utf8'); } catch (error) { if (missing(error)) return; throw error; }
    const ids = status.match(/^Uid:\s*(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s*$/m);
    if (!ids) throw new Error('Uncertain process identity.');
    if (ids.slice(1).some(id => Number(id) === PDF_BROWSER_UID)) found.push(Number(name));
  }));
  return found;
}
async function killBrowserProcesses() {
  if (!privateNamespaceVerified) throw new Error('Renderer namespace was not verified.');
  // Linux serializes kill(-1) with fork insertion under tasklist_lock. Unlike
  // /proc enumeration, a forking/exiting parent cannot hide its new descendant.
  // PID 1 and this controller's whole thread group are excluded by the kernel.
  try { process.kill(-1, 'SIGKILL'); } catch (error) { if (!missing(error)) throw error; }
  for (let attempt = 0; attempt < 40; attempt++) {
    const pids = await browserPids();
    if (!pids.length) return;
    for (const pid of pids) { try { process.kill(pid, 'SIGKILL'); } catch (error) { if (!missing(error)) throw error; } }
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error('Browser processes remain.');
}

async function cleanTemporaryFiles() {
  const child = spawn(process.execPath, [cleanupPath], { uid: PDF_BROWSER_UID, gid: PDF_BROWSER_GID, env: minimalEnvironment, stdio: 'ignore', cwd: '/app' });
  const code = await new Promise<number | null>((resolve, reject) => { child.once('error', reject); child.once('exit', resolve); });
  if (code !== 0) throw new Error('Temporary cleanup failed.');
}

async function runBrowser(body: Buffer, signal: AbortSignal): Promise<Buffer> {
  const output = Buffer.allocUnsafe(PDF_RENDER_OUTPUT_LIMIT);
  let length = 0, failed = false, ended = false;
  const child = spawn(process.execPath, [jobPath], { uid: PDF_BROWSER_UID, gid: PDF_BROWSER_GID, env: minimalEnvironment, stdio: ['pipe', 'pipe', 'ignore'], cwd: '/app', detached: true });
  const terminate = () => { failed = true; try { child.kill('SIGKILL'); } catch { fatal(); } };
  signal.addEventListener('abort', terminate, { once: true });
  if (signal.aborted) terminate();
  let finishOutput!: () => void;
  const outputDone = new Promise<void>(resolve => { finishOutput = resolve; });
  child.stdout.on('data', (chunk: Buffer) => {
    if (failed) return;
    if (chunk.length > output.length - length) { terminate(); child.stdout.destroy(); return; }
    chunk.copy(output, length); length += chunk.length;
  });
  child.stdout.once('end', () => { ended = true; finishOutput(); });
  child.stdout.once('close', () => { if (!ended) failed = true; finishOutput(); });
  child.stdout.once('error', () => { terminate(); finishOutput(); });
  child.stdin.on('error', terminate);
  const exit = new Promise<number | null>(resolve => { child.once('error', () => { failed = true; resolve(null); }); child.once('exit', resolve); });
  const header = Buffer.alloc(4); header.writeUInt32BE(body.length);
  child.stdin.write(header); child.stdin.end(body);
  try {
    const code = await exit;
    // Do not wait for stdout EOF until escaped descendants holding that FD are dead.
    await killBrowserProcesses();
    await outputDone;
    const bytes = output.subarray(0, length);
    if (code !== 0 || failed || !validPdf(bytes)) throw new Error('PDF browser job failed.');
    return bytes;
  } finally {
    signal.removeEventListener('abort', terminate);
    child.stdin.destroy(); child.stdout.destroy();
  }
}

function send(socket: Socket, status: number, body: Buffer = Buffer.alloc(0)): Promise<void> {
  return new Promise(resolve => {
    socket.once('close', resolve); socket.once('error', () => { socket.destroy(); resolve(); });
    const header = Buffer.alloc(5); header.writeUInt32BE(body.length + 1); header[4] = status;
    socket.write(header); socket.end(body);
  });
}
async function handle(socket: Socket) {
  socket.on('error', () => {});
  if (active) { rejectBusyConnection(socket); return; }
  active = true;
  const deadline = setTimeout(fatal, PDF_WORKER_DEADLINE_MS);
  const abort = new AbortController(); socket.once('close', () => abort.abort());
  let status = PDF_STATUS_ERROR;
  let output: Buffer = Buffer.from('PDF rendering failed.');
  try {
    const body = await readRequestFrame(socket);
    parseRenderRequest(body);
    if ((await browserPids()).length) fatal();
    output = await runBrowser(body, abort.signal); status = PDF_STATUS_OK;
  } catch { /* Fixed generic errors only; never log authored HTML or child output. */ }
  try {
    await killBrowserProcesses();
    await cleanTemporaryFiles();
    await killBrowserProcesses();
  } catch { fatal(); }
  if (!socket.destroyed) await send(socket, status, output);
  clearTimeout(deadline); active = false;
}

process.on('uncaughtException', fatal); process.on('unhandledRejection', fatal);
process.on('SIGTERM', fatal); process.on('SIGINT', fatal);
try {
  if (process.platform !== 'linux' || process.getuid?.() !== 0 || process.geteuid?.() !== 0 || !Number.isSafeInteger(clientGroup) || clientGroup < 0 || clientGroup === PDF_BROWSER_GID || process.getgid?.() !== clientGroup || !isAbsolute(socketPath) || socketPath.includes('\0') || Buffer.byteLength(socketPath) > 107) throw new Error('Invalid renderer configuration.');
  await verifyPrivateNamespace();
  process.umask(0o077);
  const directory = dirname(socketPath);
  let created = false;
  try { await mkdir(directory, { mode: 0o750 }); created = true; } catch (error) { if (!error || typeof error !== 'object' || !('code' in error) || error.code !== 'EEXIST') throw error; }
  if (created) await chmod(directory, 0o750);
  const parent = await lstat(directory);
  if (!parent.isDirectory() || parent.uid !== 0 || parent.gid !== clientGroup || (parent.mode & 0o7777) !== 0o750) throw new Error('Invalid socket directory.');
  try {
    const previous = await lstat(socketPath);
    if (!previous.isSocket() || previous.uid !== 0 || previous.gid !== clientGroup || (previous.mode & 0o7777) !== 0o660) throw new Error('Invalid socket path.');
    await unlink(socketPath);
  } catch (error) { if (!missing(error)) throw error; }
  if ((await browserPids()).length) throw new Error('Unexpected browser process.');
  const server = createServer({ allowHalfOpen: true }, socket => { void handle(socket); });
  server.maxConnections = 8;
  server.on('error', fatal);
  await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen({ path: socketPath, backlog: 1 }, resolve); });
  await chmod(socketPath, 0o660);
  console.log('PDF renderer ready.');
} catch { fatal(); }
