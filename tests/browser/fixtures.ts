import { test as base, expect } from '@playwright/test';
import pg from 'pg';
import { cleanupTestAuthor, seedTestAuthor, type TestAuthor } from '../helpers/accounts.js';

/** Approved synthetic accounts belong only to the explicitly supplied disposable database. */
export const test = base.extend<{ approvedAuthor: TestAuthor }>({
  approvedAuthor: async ({}, use) => {
    const pool = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL });
    let author: TestAuthor | undefined;
    try { author = await seedTestAuthor(pool); await use(author); }
    finally { try { if (author) await cleanupTestAuthor(pool, author); } finally { await pool.end(); } }
  },
  storageState: async ({ approvedAuthor }, use) => {
    await use({ cookies: [{ name: 'openscroll_session', value: approvedAuthor.token, domain: '127.0.0.1', path: '/', expires: -1, httpOnly: true, secure: false, sameSite: 'Lax' }], origins: [] });
  },
  request: async ({ playwright, baseURL, storageState, approvedAuthor }, use) => {
    const client = await playwright.request.newContext({ baseURL, storageState, extraHTTPHeaders: { 'x-openscroll-request': '1', 'x-csrf-token': approvedAuthor.csrf, origin: 'http://127.0.0.1:3000' } });
    try { await use(client); } finally { await client.dispose(); }
  },
});

export { expect };
export type { APIRequestContext, Page } from '@playwright/test';
