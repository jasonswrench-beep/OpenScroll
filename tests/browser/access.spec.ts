import { test, expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { readFile, readdir, unlink } from 'node:fs/promises';
import { cleanupTestAuthor, seedTestAuthor, type TestAuthor } from '../helpers/accounts.js';

const origin = 'http://127.0.0.1:3000';
const password = 'An approval browser test password 42';
const createdEmails: string[] = [];
const createdFixtures: TestAuthor[] = [];

test.afterEach(async () => {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try {
    for (const fixture of createdFixtures.splice(0)) await cleanupTestAuthor(pool, fixture);
    const emails = createdEmails.splice(0);
    if (emails.length) await pool.query('DELETE FROM authors WHERE email=ANY($1::text[])', [emails]);
    for (const file of await readdir('.local/test-mail').catch(() => [])) {
      const path = `.local/test-mail/${file}`;
      const mail = JSON.parse(await readFile(path, 'utf8'));
      if (emails.includes(mail.to)) await unlink(path);
    }
  } finally { await pool.end(); }
});

async function fixture(options: Parameters<typeof seedTestAuthor>[1] = {}) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
  try { const author = await seedTestAuthor(pool, options); createdFixtures.push(author); return author; }
  finally { await pool.end(); }
}
async function setSession(page: Page, author: TestAuthor) {
  await page.context().addCookies([{ name: 'openscroll_session', value: author.token, domain: '127.0.0.1', path: '/', httpOnly: true, secure: false, sameSite: 'Lax' }]);
}
async function signIn(page: Page, email: string, secret = password) {
  await page.goto('/account/');
  await page.locator('#login-email').fill(email);
  await page.locator('#login-password').fill(secret);
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
}
async function verificationLink(email: string) {
  let link = '';
  await expect.poll(async () => {
    for (const file of await readdir('.local/test-mail').catch(() => [])) {
      const mail = JSON.parse(await readFile(`.local/test-mail/${file}`, 'utf8'));
      if (mail.to === email && mail.subject.includes('Verify')) link = mail.text.match(/http[^\s]+/)?.[0] ?? '';
    }
    return link;
  }).not.toBe('');
  return new URL(link);
}

test('anonymous visitors see the public landing page without authoring bundles or author APIs', async ({ page, request }) => {
  const requests: string[] = [];
  page.on('request', request => requests.push(new URL(request.url()).pathname));
  await page.goto('/');
  await expect(page.locator('#public-landing')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Sign in', exact: true })).toHaveAttribute('href', '/account/');
  await expect(page.getByRole('link', { name: 'Request an author account', exact: true })).toHaveAttribute('href', '/account/');
  await expect(page.getByRole('link', { name: /self.host/i })).toHaveAttribute('href', /SELF-HOSTING/);
  await expect(page.locator('#library-panel, #project-details, #outline-course-title')).toHaveCount(0);
  expect(requests.filter(path => path.startsWith('/api/'))).toEqual([]);
  const appHtml = await readFile('dist/client/app.html', 'utf8');
  const authorEntries = [...appHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/g)].map(match => new URL(match[1]!, origin).pathname);
  expect(authorEntries.length).toBeGreaterThan(0);
  expect(requests.filter(path => authorEntries.includes(path))).toEqual([]);
  expect(requests.filter(path => /\/(?:app|editor|outline|library|project-ui|accounts)-[^/]+\.js$/.test(path))).toEqual([]);
  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  for (const path of ['/app/', '/player.html']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/account\//);
    await expect(page.locator('#library-panel, #project-details')).toHaveCount(0);
  }
  for (const path of ['/api/library/courses', '/api/projects/sample', '/api/owner/accounts']) {
    expect((await request.get(path)).status()).toBe(401);
  }
});

test('requesting and verifying an account leaves authoring pending until an owner approves it', async ({ page, browser }) => {
  test.setTimeout(60_000);
  const email = `approval-request-${randomUUID()}@example.invalid`;
  createdEmails.push(email);
  await page.goto('/account/');
  await page.locator('#register-name').fill('Pending browser author');
  await page.locator('#register-email').fill(email);
  await page.locator('#register-password').fill(password);
  await page.getByRole('button', { name: 'Request account', exact: true }).click();
  await expect(page.locator('#account-status')).toContainText(/verification|verify|email/i);
  const link = await verificationLink(email);
  // Existing links issued at the site root must continue to reach the account flow.
  await page.goto('/' + link.hash);
  await expect(page).toHaveURL(/\/account\//);
  await expect(page.locator('#account-status')).toContainText(/verified/i);
  expect(page.url()).not.toContain('#verify=');
  await signIn(page, email);
  await expect(page.locator('#account-access')).toHaveAttribute('data-approval-status', 'pending');
  await expect(page.locator('#open-authoring')).toBeHidden();
  await expect(page.locator('#owner-accounts-panel')).toBeHidden();
  const sessionResponse = await page.request.get('/api/account/session');
  const session = await sessionResponse.json();
  expect(session.author).toMatchObject({ email, role: 'author', approvalStatus: 'pending', verified: true });
  const headers = { 'x-openscroll-request': '1', 'x-csrf-token': session.csrf, origin };
  for (const path of ['/api/library/courses', '/api/projects/sample', '/api/owner/accounts']) {
    expect((await page.request.get(path)).status()).toBe(403);
  }
  for (const path of ['/api/projects/import', '/api/projects/pdf', '/api/projects/html', '/api/projects/scorm-12', '/api/projects/scorm-2004', '/api/library/courses']) {
    expect((await page.request.post(path, { headers, data: {} })).status()).toBe(403);
  }
  await page.goto('/app/');
  await expect(page).toHaveURL(/\/account\//);
  await expect(page.locator('#library-panel')).toHaveCount(0);

  const owner = await fixture({ role: 'owner', name: 'Instance owner' });
  const ownerContext = await browser.newContext();
  try {
    const ownerPage = await ownerContext.newPage();
    await setSession(ownerPage, owner);
    await ownerPage.goto('/account/');
    const row = ownerPage.locator('#owner-account-list [data-account-id]').filter({ hasText: email });
    await expect(row).toContainText('pending');
    await row.locator('[data-action="approve"]').click();
    await expect(row).toContainText('approved');
    // Approval invalidates the pending session; it never upgrades a stale cookie.
    expect((await page.request.get('/api/library/courses')).status()).toBe(401);
    await signIn(page, email);
    await expect(page).toHaveURL(/\/app\/$/);
    await expect(page.locator('#library-panel')).toBeVisible();
    const approvedSession = await (await page.request.get('/api/account/session')).json();
    expect(approvedSession.author).toMatchObject({ approvalStatus: 'approved', role: 'author' });
    expect((await page.request.get('/api/owner/accounts')).status()).toBe(403);
    // Normal authors cannot change their own approval state through the owner API.
    expect((await page.request.post(`/api/owner/accounts/${approvedSession.author.id}/approve`, { headers: { 'x-openscroll-request': '1', 'x-csrf-token': approvedSession.csrf, origin }, data: {} })).status()).toBe(403);
    await ownerPage.reload();
    ownerPage.once('dialog', dialog => dialog.accept());
    await ownerPage.locator(`#owner-account-list [data-account-id="${approvedSession.author.id}"] [data-action="revoke"]`).click();
    await expect(ownerPage.locator(`#owner-account-list [data-account-id="${approvedSession.author.id}"]`)).toContainText('revoked');
    expect((await page.request.get('/api/library/courses')).status()).toBe(401);
    await page.locator('#library-refresh').click();
    await expect(page).toHaveURL(/\/account\//);
    await expect(page.locator('#library-panel, #project-details')).toHaveCount(0);
    await signIn(page, email);
    await expect(page.locator('#account-status')).toContainText(/sign.in failed/i);
  } finally { await ownerContext.close(); }
});

test('pending authors cannot load editor markup or preview even with an existing session', async ({ page }) => {
  const pending = await fixture({ approvalStatus: 'pending' });
  await setSession(page, pending);
  for (const path of ['/app/', '/app.html', '/player.html']) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/account\//);
    await expect(page.locator('#account-access')).toHaveAttribute('data-approval-status', 'pending');
    await expect(page.locator('#library-panel, #project-details')).toHaveCount(0);
  }
});
