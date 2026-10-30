import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildApp } from '../src/server/app.js';

const projectRequests = [
  { method: 'GET', url: '/api/projects/sample' },
  { method: 'GET', url: '/api/projects/questions/template.csv' },
  { method: 'GET', url: '/api/projects/questions/template.xlsx' },
  { method: 'POST', url: '/api/projects/import' },
  { method: 'POST', url: '/api/projects/export' },
  { method: 'POST', url: '/api/projects/html' },
  { method: 'POST', url: '/api/projects/pdf' },
  { method: 'POST', url: '/api/projects/scorm-12' },
  { method: 'POST', url: '/api/projects/scorm-2004' },
  { method: 'POST', url: '/api/projects/questions/import?format=csv' },
  { method: 'POST', url: '/api/projects/questions/import?format=xlsx' },
] as const;

test('production application fails closed for every project endpoint when account services are absent', async () => {
  let databaseQueries = 0;
  const app = await buildApp({ query: async () => { databaseQueries++; throw new Error('Unavailable private storage'); } });
  try {
    for (const request of projectRequests) {
      const response = await app.inject(request);
      assert.equal(response.statusCode, 401, `${request.method} ${request.url}`);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.body.includes('Unavailable private storage'), false);
      assert.equal(response.headers['content-disposition'], undefined, 'A denied request cannot return a downloadable project/template.');
    }
    assert.equal(databaseQueries, 0, 'Unauthenticated project requests must not access storage.');
  } finally { await app.close(); }
});

test('production project authorization rejects a missing session before JSON, content-type, and upload-limit validation', async () => {
  const app = await buildApp({ query: async () => { throw new Error('No project storage access expected'); } });
  try {
    const malformed = await app.inject({
      method: 'POST', url: '/api/projects/pdf', headers: { 'content-type': 'application/json' }, payload: '{',
    });
    assert.equal(malformed.statusCode, 401, 'Malformed unauthenticated input must not reach JSON parsing.');
    const unsupported = await app.inject({
      method: 'POST', url: '/api/projects/import', headers: { 'content-type': 'application/x-untrusted' }, payload: 'unparsed',
    });
    assert.equal(unsupported.statusCode, 401, 'Unsupported unauthenticated input must not reach a content-type parser.');
    const oversized = await app.inject({
      method: 'POST', url: '/api/projects/questions/import?format=csv',
      headers: { 'content-type': 'application/octet-stream', 'content-length': String(100 * 1024 * 1024) },
      payload: Buffer.from('not consumed'),
    });
    assert.equal(oversized.statusCode, 401, 'Unauthenticated uploads must be denied before body-limit handling.');
    const unknownSession = await app.inject({
      method: 'POST', url: '/api/projects/export',
      headers: { cookie: '__Host-openscroll_session=untrusted-session; openscroll_session=untrusted-session', 'content-type': 'application/json' }, payload: '{',
    });
    assert.equal(unknownSession.statusCode, 401, 'An untrusted cookie cannot activate project processing without account services.');
  } finally { await app.close(); }
});

test('missing account services cannot expose library or owner API routes', async () => {
  const app = await buildApp({ query: async () => { throw new Error('Private account storage'); } });
  try {
    for (const url of ['/api/library/courses', '/api/library/reusable', '/api/owner/accounts', '/api/unknown-private-route']) {
      const response = await app.inject(url);
      assert.equal(response.statusCode, 401, url);
      assert.equal(response.headers['cache-control'], 'no-store');
      assert.equal(response.body.includes('Private account storage'), false);
    }
    const response = await app.inject({
      method: 'POST', url: '/api/owner/accounts/00000000-0000-4000-8000-000000000001/approve',
      headers: { 'content-type': 'application/json' }, payload: '{',
    });
    assert.equal(response.statusCode, 401, 'Owner actions must not parse unauthenticated bodies.');
  } finally { await app.close(); }
});
