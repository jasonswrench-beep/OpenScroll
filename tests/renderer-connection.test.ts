import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createConnection, createServer, type Socket } from 'node:net';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { rejectBusyConnection } from '../src/renderer/connection.js';
import { PDF_STATUS_BUSY } from '../src/project/pdf-protocol.js';

async function busyServer(run: (path: string, accepted: Set<Socket>) => Promise<void>) {
  const directory = await mkdtemp(join(tmpdir(), 'openscroll-busy-'));
  const path = join(directory, 'worker.sock'), accepted = new Set<Socket>();
  const server = createServer({ allowHalfOpen: true }, socket => {
    accepted.add(socket);
    socket.once('close', () => accepted.delete(socket));
    rejectBusyConnection(socket);
  });
  try {
    await new Promise<void>((resolve, reject) => { server.once('error', reject); server.listen(path, resolve); });
    await run(path, accepted);
  } finally {
    for (const socket of accepted) socket.destroy();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  }
}

test('busy worker sends one exact BUSY frame and clean EOF for 20 written requests', { timeout: 10000 }, async () => {
  await busyServer(async path => {
    for (let attempt = 0; attempt < 20; attempt++) {
      const body = Buffer.from(JSON.stringify({ html: '<p>' + 'x'.repeat(attempt * 4096) + '</p>', paper: 'A4' }));
      const header = Buffer.alloc(4); header.writeUInt32BE(body.length);
      await new Promise<void>((resolve, reject) => {
        const socket = createConnection({ path }), chunks: Buffer[] = [];
        let ended = false;
        socket.once('error', reject);
        socket.setTimeout(3000, () => { socket.destroy(); reject(new Error('Busy response stalled.')); });
        socket.once('connect', () => { socket.write(header); socket.end(body); });
        socket.on('data', (bytes: Buffer) => chunks.push(bytes));
        socket.once('end', () => { ended = true; });
        socket.once('close', hadError => {
          try {
            assert.equal(hadError, false);
            assert.equal(ended, true, 'complete frame must be followed by EOF');
            assert.deepEqual(Buffer.concat(chunks), Buffer.from([0, 0, 0, 1, PDF_STATUS_BUSY]));
            resolve();
          } catch (error) { reject(error); }
        });
      });
    }
  });
});

test('busy worker releases silent and continuously writing peers on its absolute one-second bound', { timeout: 10000 }, async () => {
  await busyServer(async (path, accepted) => {
    for (const writeContinuously of [false, true]) {
      const client = createConnection({ path, allowHalfOpen: true });
      client.on('error', () => {});
      let drip: ReturnType<typeof setInterval> | undefined;
      const started = performance.now();
      try {
        await new Promise<void>((resolve, reject) => {
          client.once('error', reject);
          client.once('connect', resolve);
        });
        const peer = [...accepted][0];
        assert.ok(peer, 'worker accepted the peer');
        if (writeContinuously) drip = setInterval(() => { if (!client.destroyed) client.write('x'); }, 25);
        // Neither peer sends EOF. Dripping data must not refresh the bound.
        await new Promise<void>((resolve, reject) => {
          const watchdog = setTimeout(() => reject(new Error('Busy worker retained its connection.')), 2500);
          peer.once('close', () => { clearTimeout(watchdog); resolve(); });
        });
        const elapsed = performance.now() - started;
        assert.ok(elapsed >= 850 && elapsed < 1800, `busy peer retained for ${elapsed.toFixed(0)}ms`);
        assert.equal(accepted.size, 0, 'worker released the descriptor');
      } finally {
        if (drip) clearInterval(drip);
        client.destroy();
      }
    }
  });
});
