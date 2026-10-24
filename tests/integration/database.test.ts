import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import { readConfig } from '../../src/server/config.js';
import { buildApp } from '../../src/server/app.js';
test('real PostgreSQL transaction round trip and API readiness', async () => {
  const pool = new pg.Pool({ connectionString: readConfig().databaseUrl, connectionTimeoutMillis: 3000 });
  const app = await buildApp(pool);
  try {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('CREATE TEMP TABLE foundation_probe (value text NOT NULL)');
      await client.query('INSERT INTO foundation_probe VALUES ($1)', ['OpenScroll']);
      assert.equal((await client.query('SELECT value FROM foundation_probe')).rows[0].value, 'OpenScroll');
      await client.query('ROLLBACK');
    } finally { client.release(); }
    assert.equal((await app.inject('/api/health')).json().status, 'ready');
  } finally { await app.close(); await pool.end(); }
});
