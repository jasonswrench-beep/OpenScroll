import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { buildApp } from '../../src/server/app.js';
import { isolatedDatabase } from '../helpers/database.js';
test('restricted PostgreSQL transaction round trip and API readiness', async () => {
  const database=await isolatedDatabase(),pool=database.runtimePool;
  const app = await buildApp(pool);
  try {
    const client = await pool.connect(),id=randomUUID();
    try {
      await client.query('BEGIN');
      await client.query('INSERT INTO authors(id,email,display_name,password_hash,verified) VALUES($1,$2,$3,$4,false)',[id,`transaction-${id}@example.invalid`,'OpenScroll','Synthetic fixture hash']);
      assert.equal((await client.query('SELECT display_name FROM authors WHERE id=$1',[id])).rows[0].display_name,'OpenScroll');
      await client.query('ROLLBACK');
      assert.equal((await client.query('SELECT count(*)::int AS n FROM authors WHERE id=$1',[id])).rows[0].n,0);
    } finally { client.release(); }
    assert.equal((await app.inject('/api/health')).json().status, 'ready');
  } finally { await app.close(); await database.close(); }
});
