import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server/app.js';
import { readConfig } from '../src/server/config.js';
test('configuration rejects missing credentials and invalid ports', () => {
  assert.throws(() => readConfig({}), /DATABASE_URL/);
  assert.throws(() => readConfig({ DATABASE_URL: 'https://example.org' }), /PostgreSQL/);
  assert.throws(() => readConfig({ DATABASE_URL: 'postgres://localhost/db', PORT: '0' }), /PORT/);
});
test('readiness checks database and does not expose failure details', async () => {
  let available = true;
  const app = await buildApp({ query: async text => {
    assert.equal(text, 'SELECT 1');
    if (!available) throw new Error('private database credentials');
  } });
  try {
    assert.equal((await app.inject('/api/health')).statusCode, 200);
    available = false;
    const response = await app.inject('/api/health');
    assert.equal(response.statusCode, 503);
    assert.deepEqual(response.json(), { status: 'unavailable', database: 'unavailable' });
    assert.equal(response.headers['cache-control'], 'no-store');
    assert.equal((await app.inject('/api/missing')).statusCode, 401, 'Private API paths fail closed before route lookup.');
  } finally { await app.close(); }
});
