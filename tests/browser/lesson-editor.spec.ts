import { approveFixtureAuthor } from '../helpers/accounts.js';
import { seedSampleCourse } from '../helpers/library-fixture.js';
import { test, expect, type APIRequestContext, type Page } from './fixtures.js';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
let storage: Awaited<ReturnType<APIRequestContext['storageState']>>;
let client: APIRequestContext;
let owner: string;
let id: string;
const email = `lesson-editor-${randomUUID()}@example.invalid`;
test.beforeAll(async ({ playwright }) => {
  client = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:3000', extraHTTPHeaders: { 'x-openscroll-request': '1', origin: 'http://127.0.0.1:3000' } });
  const credentials = { email, password: 'A lesson editor password 42' };
  expect((await client.post('/api/account/register', { data: { ...credentials, name: 'Lesson editor author' } })).ok()).toBe(true);
  const pool = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL }); try { await approveFixtureAuthor(pool, email, credentials.password); } finally { await pool.end(); }
  const login = await client.post('/api/account/login', { data: credentials }); expect(login.ok()).toBe(true); owner = (await login.json()).author.id; storage = await client.storageState();
});
test.beforeEach(async ({ context }) => { await context.addCookies(storage.cookies); id = await seedSampleCourse(owner); });
test.afterEach(async () => { const pool = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL }); try { await pool.query('DELETE FROM courses WHERE owner_id=$1', [owner]); } finally { await pool.end(); } });
test.afterAll(async () => {
  if (owner) { const pool = new pg.Pool({ connectionString: process.env.ADMIN_DATABASE_URL }); try { await pool.query('DELETE FROM authors WHERE id=$1 AND email=$2', [owner, email]); } finally { await pool.end(); } }
  await client?.dispose();
});
const saved = (page: Page) => expect(page.getByRole('button', { name: 'Save status, snapshots, and recovery' })).toHaveAttribute('data-state', 'saved');
async function courseDocument() { const response = await client.get(`/api/library/courses/${id}/edit`); expect(response.ok()).toBe(true); return (await response.json()).project.document; }
async function openLesson(page: Page) {
  const lesson = (await courseDocument()).course.sections[0].lessons[0];
  await page.goto(`/studio/#course=${id}&lesson=${lesson.id}`);
  await expect(page.getByRole('textbox', { name: 'Lesson title' })).toHaveValue(lesson.title);
  return lesson;
}
async function addBlock(page: Page, name: string, search: string) {
  await page.getByRole('button', { name: 'Add block', exact: true }).first().click();
  const picker = page.getByRole('dialog', { name: 'Add a block' });
  await picker.getByRole('searchbox', { name: 'Search blocks' }).fill(search);
  await picker.getByRole('button', { name: new RegExp(`^${name}`) }).click();
  await expect(picker).toBeHidden();
}

test('an author adds Wave A blocks with the picker, edits them in the inspector, undoes, and everything saves', async ({ page }) => {
  await openLesson(page);
  await addBlock(page, 'Table', 'table');
  await expect(page.getByRole('heading', { name: 'Table', level: 2 })).toBeVisible();
  await page.getByRole('textbox', { name: 'Caption', exact: true }).fill('Three stages side by side');
  await page.getByRole('button', { name: 'Add column' }).click();
  await saved(page);
  let blocks = (await courseDocument()).course.sections[0].lessons[0].blocks;
  const table = blocks.find((b: { type: string }) => b.type === 'table');
  expect(table.content.caption).toBe('Three stages side by side');
  expect(table.content.rows[0]).toHaveLength(4);
  await page.getByRole('button', { name: 'Undo block change' }).click();
  await saved(page);
  blocks = (await courseDocument()).course.sections[0].lessons[0].blocks;
  expect(blocks.find((b: { type: string }) => b.type === 'table').content.rows[0]).toHaveLength(3);

  await addBlock(page, 'Reflection', 'reflection');
  await page.getByRole('tab', { name: 'Behavior' }).click();
  await page.getByRole('checkbox', { name: /Required to finish the lesson/ }).check();
  await page.getByRole('tab', { name: 'Access' }).click();
  await expect(page.getByText('The prompt is the text box’s description.')).toBeVisible();
  await saved(page);
  blocks = (await courseDocument()).course.sections[0].lessons[0].blocks;
  expect(blocks.find((b: { type: string }) => b.type === 'reflection').content.required).toBe(true);

  await addBlock(page, 'Two columns', 'two columns');
  await page.getByRole('button', { name: 'Add a block to column 2' }).first().click();
  const picker = page.getByRole('dialog', { name: 'Add a block to column 2' });
  await expect(picker.getByRole('button', { name: /^Reflection/ })).toHaveCount(0);
  await picker.getByRole('button', { name: /^Note/ }).click();
  await expect(page.getByText('In a column')).toBeVisible();
  await saved(page);
  const columns = (await courseDocument()).course.sections[0].lessons[0].blocks.find((b: { type: string }) => b.type === 'columns');
  expect(columns.content.columns[1].blocks.map((b: { type: string }) => b.type)).toEqual(['paragraph', 'statement']);

  expect((await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('lesson settings set a banner from the course cover and lesson objectives', async ({ page }) => {
  await openLesson(page);
  await page.getByRole('combobox', { name: 'Show at the top of the lesson' }).selectOption('cover');
  await page.getByRole('button', { name: 'Add objective' }).click();
  await page.getByRole('textbox', { name: 'Objective 1' }).fill('Explain the idea in your own words.');
  await page.getByRole('combobox', { name: 'Thinking level for objective 1' }).selectOption('understand');
  await saved(page);
  const lesson = (await courseDocument()).course.sections[0].lessons[0];
  expect(lesson.banner.source).toBe('cover');
  expect(lesson.objectives[0]).toMatchObject({ text: 'Explain the idea in your own words.', level: 'understand' });
});

test('Checks lists an empty heading and Go to issue puts the cursor in it; Export recommends SCORM 2004 for written responses', async ({ page }) => {
  await openLesson(page);
  await addBlock(page, 'Heading', 'heading');
  await page.keyboard.press('Control+A'); await page.keyboard.press('Delete');
  await addBlock(page, 'Reflection', 'reflection');
  await saved(page);
  await page.getByRole('button', { name: /^Checks:/ }).click();
  const checks = page.getByRole('dialog', { name: 'Checks' });
  await expect(checks.getByText('This heading is empty.', { exact: false })).toBeVisible();
  await checks.getByRole('button', { name: /^Go to issue: This heading is empty/ }).click();
  await expect(checks).toBeHidden();
  await expect(page.locator(':focus')).toHaveAttribute('data-field', 'text');
  await page.getByRole('button', { name: 'Export' }).click();
  const exporter = page.getByRole('dialog', { name: 'Export' });
  await expect(exporter.getByRole('button', { name: /SCORM 2004 \(recommended for this course\)/ })).toBeVisible();
});
