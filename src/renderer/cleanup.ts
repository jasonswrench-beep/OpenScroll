import { chmod, lstat, readFile, readdir, rmdir, unlink } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { PDF_BROWSER_UID } from '../project/pdf-protocol.js';
import { assertBrowserIdentity } from './identity.js';

/** Run only after all untrusted browser processes have been killed and reaped. */
async function removeOwned(path: string): Promise<void> {
  const stat = await lstat(path);
  if (stat.uid === 0) return;
  if (stat.uid !== PDF_BROWSER_UID) throw new Error('Unexpected temporary-file owner.');
  if (stat.isDirectory()) {
    await chmod(path, 0o700);
    for (const name of await readdir(path)) await removeOwned(path + '/' + name);
    await rmdir(path);
  } else await unlink(path); // Includes symlinks; never follow an attacker-controlled target.
}
try {
  assertBrowserIdentity();
  for (const directory of ['/tmp', '/dev/shm', '/dev/mqueue']) {
    try {
      const stat = await lstat(directory);
      if (!stat.isDirectory() || stat.uid !== 0) throw new Error('Invalid temporary directory.');
      for (const name of await readdir(directory)) await removeOwned(directory + '/' + name);
    } catch (error) {
      if (directory !== '/dev/mqueue' || !error || typeof error !== 'object' || !('code' in error) || error.code !== 'ENOENT') throw error;
    }
  }
  // These kernel IPC objects can outlive every browser PID. The worker has a
  // private IPC namespace; any object that cannot be removed forces a restart.
  const ipc = spawn('/usr/bin/ipcrm', ['--all'], { stdio: 'ignore', env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8' } });
  const code = await new Promise<number | null>((resolve, reject) => { ipc.once('error', reject); ipc.once('exit', resolve); });
  if (code !== 0) throw new Error('IPC cleanup failed.');
  for (const table of ['shm', 'sem', 'msg']) {
    const rows = (await readFile('/proc/sysvipc/' + table, 'utf8')).trim().split('\n');
    if (!rows[0]?.trim().split(/\s+/).includes('uid') || rows.length !== 1) throw new Error('Kernel IPC objects remain.');
  }
} catch {
  process.exitCode = 1;
}
