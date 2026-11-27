import test from 'node:test';
import assert from 'node:assert/strict';
import Fastify from 'fastify';
import { BUSY_MESSAGE, guardLargeBodies, installLargeRequestSlot, withLargeRequest } from '../src/server/large-requests.js';

/** A small app with the slot guarding one route; "large" means over 10 bytes here. */
async function slotApp() {
  const app = Fastify();
  installLargeRequestSlot(app);
  let open: () => void = () => {};
  const gate = new Promise<void>(resolve => { open = resolve; });
  let calls = 0;
  await app.register(async scope => {
    installLargeRequestSlot(scope);
    guardLargeBodies(scope, 10);
    scope.post('/course', { config: { largeBody: true } }, async request => withLargeRequest(scope, request, async () => { if (++calls === 1) await gate; return { saved: true }; }));
  });
  await app.ready();
  return { app, open };
}
const course = (size: number) => ({ text: 'x'.repeat(size) });
const settle = async (until: () => boolean) => { for (let i = 0; i < 200 && !until(); i++) await new Promise(resolve => setImmediate(resolve)); };

test('one large course request at a time: a second is told to retry, small ones pass, and the slot comes back', async () => {
  const { app, open } = await slotApp();
  try {
    const first = app.inject({ method: 'POST', url: '/course', payload: course(100) });
    await settle(() => app.largeRequests.busy);
    assert.equal(app.largeRequests.busy, true, 'the first large request holds the slot while it works');
    const second = await app.inject({ method: 'POST', url: '/course', payload: course(100) });
    assert.equal(second.statusCode, 429);
    assert.equal(second.headers['retry-after'], '3');
    assert.equal(second.json().error, BUSY_MESSAGE);
    const small = await app.inject({ method: 'POST', url: '/course', payload: {} });
    assert.equal(small.statusCode, 200, 'a small save never waits for the slot');
    open();
    assert.equal((await first).statusCode, 200);
    assert.equal(app.largeRequests.busy, false);
    assert.equal((await app.inject({ method: 'POST', url: '/course', payload: course(100) })).statusCode, 200);
  } finally { await app.close(); }
});

test('a large request rejected before its handler runs gives the slot back', async () => {
  const { app } = await slotApp();
  try {
    const broken = await app.inject({ method: 'POST', url: '/course', headers: { 'content-type': 'application/json' }, payload: `{"text":"${'x'.repeat(50)}"` });
    assert.equal(broken.statusCode, 400);
    assert.equal(app.largeRequests.busy, false);
  } finally { await app.close(); }
});
