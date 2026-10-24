import { test,expect,type APIRequestContext,type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
import { sampleProject } from '../../src/project/sample.js';
import { importProject } from '../../src/project/archive.js';
let storage:Awaited<ReturnType<APIRequestContext['storageState']>>;
let client:APIRequestContext;
let owner:string;
let id:string;
let csrf:string;
const email=`outline-browser-${randomUUID()}@example.invalid`;
test.beforeAll(async({playwright})=>{
  client=await playwright.request.newContext({baseURL:'http://127.0.0.1:3000',extraHTTPHeaders:{'x-openscroll-request':'1',origin:'http://127.0.0.1:3000'}});
  const credentials={email,password:'An outline browser password 42'};
  expect((await client.post('/api/account/register',{data:{...credentials,name:'Outline browser author'}})).ok()).toBe(true);
  const login=await client.post('/api/account/login',{data:credentials});expect(login.ok()).toBe(true);const data=await login.json();csrf=data.csrf;owner=data.author.id;storage=await client.storageState();
});
test.beforeEach(async({context})=>{
  await context.addCookies(storage.cookies);
  const created=await client.post('/api/library/courses/import',{headers:{'x-csrf-token':csrf},data:sampleProject()});expect(created.ok()).toBe(true);id=(await created.json()).id;
});
test.afterEach(async()=>{
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});try{await pool.query('DELETE FROM courses WHERE owner_id=$1',[owner]);}finally{await pool.end();}
});
test.afterAll(async()=>{
  if(owner){const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});try{await pool.query('DELETE FROM authors WHERE id=$1 AND email=$2',[owner,email]);}finally{await pool.end();}}
  await client?.dispose();
});
async function open(page:Page,title='Welcome to OpenScroll') {
  await page.goto('/');await page.getByRole('button',{name:`Open: ${title}`,exact:true}).click();await expect(page.locator('#outline-course-title')).toHaveValue(title);
}
const saved=(page:Page)=>expect(page.locator('#outline-save-status')).toHaveText('Saved to your library.');
async function snapshot(){const response=await client.get(`/api/library/courses/${id}/edit`);expect(response.ok()).toBe(true);return response.json();}

test('author edits metadata, cover, sections and lessons, then reopens the saved outline',async({page})=>{
  await open(page);
  await page.locator('#outline-course-title').fill('My organized course');await page.getByLabel('Course description').fill('An outline that survives reopening.');await page.getByLabel('Displayed author').fill('Course author');await page.getByLabel('Course language').fill('fr');
  await page.getByLabel('Upload a cover image').setInputFiles({name:'cover.png',mimeType:'image/png',buffer:Buffer.from(sampleProject().files['assets/sample-image.png']!,'base64')});
  await expect(page.locator('#outline-cover')).not.toHaveValue('');await page.getByLabel('Cover alternative text').fill('A course cover');
  const sections=page.locator('#outline-sections>.outline-section');
  await sections.first().getByLabel('Section title',{exact:true}).fill('Introduction');
  const firstId=await sections.first().locator('li[data-lesson-id]').first().getAttribute('data-lesson-id');
  await sections.first().locator('li[data-lesson-id]').first().getByLabel('Lesson title',{exact:true}).fill('Welcome');
  await sections.first().locator('li[data-lesson-id]').first().getByRole('button',{name:'Duplicate lesson',exact:true}).click();
  await expect(sections.first().locator('li[data-lesson-id]')).toHaveCount(3);
  await sections.first().locator('li[data-lesson-id]').first().getByRole('button',{name:'Move lesson down',exact:true}).click();
  expect(await sections.first().locator('li[data-lesson-id]').nth(1).getAttribute('data-lesson-id')).toBe(firstId);
  await sections.first().getByRole('button',{name:'Duplicate section',exact:true}).click();await expect(sections).toHaveCount(2);
  page.once('dialog',dialog=>dialog.accept());await sections.nth(1).getByRole('button',{name:'Delete section',exact:true}).click();await expect(sections).toHaveCount(1);
  page.once('dialog',dialog=>dialog.accept());await sections.first().locator('li[data-lesson-id]').first().getByRole('button',{name:'Delete lesson',exact:true}).click();await expect(sections.first().locator('li[data-lesson-id]')).toHaveCount(2);
  await page.getByRole('button',{name:'Add section',exact:true}).click();await sections.nth(1).getByLabel('Section title',{exact:true}).fill('Practice');
  await sections.nth(1).getByRole('button',{name:'Add lesson',exact:true}).click();await sections.nth(1).locator('li').getByLabel('Lesson title',{exact:true}).fill('Try it');
  const target=await sections.nth(1).getAttribute('data-section-id');
  const original=page.locator(`li[data-lesson-id="${firstId}"]`);await original.getByLabel('Destination section').selectOption(target!);await original.getByRole('button',{name:'Move to section',exact:true}).click();
  await expect(sections.nth(1).locator('li[data-lesson-id]')).toHaveCount(2);
  await sections.nth(1).getByRole('button',{name:'Move section up',exact:true}).click();await expect(sections.first().getByLabel('Section title',{exact:true})).toHaveValue('Practice');
  await sections.first().getByRole('button',{name:'Move section down',exact:true}).click();
  await original.getByRole('button',{name:'Open lesson',exact:true}).click();await expect(page.locator('#outline-lesson-title')).toHaveValue('Welcome');await page.locator('#outline-lesson-title').fill('Welcome revised');
  await page.getByRole('button',{name:'Back to course outline',exact:true}).click();await expect(page.locator('#outline-lesson')).toBeHidden();
  await saved(page);const before=await snapshot();expect(before.project.document.course.cover.altText).toBe('A course cover');expect(before.project.document.assets).toHaveLength(2);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.setViewportSize({width:375,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.reload();await page.getByRole('button',{name:'Open: My organized course',exact:true}).click();await expect(page.getByLabel('Course description')).toHaveValue('An outline that survives reopening.');
  await expect(page.getByLabel('Displayed author')).toHaveValue('Course author');await expect(sections.nth(1).getByLabel('Section title',{exact:true})).toHaveValue('Practice');
});

test('failed autosave survives reload as a recovery draft and retry preserves edits',async({page})=>{
  await open(page);await page.route('**/api/library/courses/*/document',route=>route.abort('failed'));
  await page.getByLabel('Upload a cover image').setInputFiles({name:'recovery-cover.png',mimeType:'image/png',buffer:Buffer.from(sampleProject().files['assets/sample-image.png']!,'base64')});
  await expect(page.locator('#outline-cover')).not.toHaveValue('');
  await page.locator('#outline-course-title').fill('Recovered outline');await expect(page.locator('#outline-save-status')).toContainText('Save not confirmed');
  page.once('dialog',dialog=>dialog.accept());await page.reload();await page.getByRole('button',{name:'Open: Welcome to OpenScroll',exact:true}).click();
  await expect(page.locator('#outline-recovery')).toBeVisible();await page.getByRole('button',{name:'Restore recovery draft'}).click();await expect(page.locator('#outline-course-title')).toHaveValue('Recovered outline');
  await page.unroute('**/api/library/courses/*/document');await page.getByRole('button',{name:'Retry save',exact:true}).click();await saved(page);
  expect((await snapshot()).project.document.course.title).toBe('Recovered outline');expect((await snapshot()).project.document.assets).toHaveLength(2);
  await page.reload();await page.getByRole('button',{name:'Open: Recovered outline',exact:true}).click();await expect(page.locator('#outline-recovery')).toBeHidden();
});

test('a second tab retains conflicting edits and can download or save a separate copy',async({page,context})=>{
  const other=await context.newPage();await open(page);await open(other);
  await page.locator('#outline-course-title').fill('Saved from tab one');await saved(page);
  await other.locator('#outline-course-title').fill('My tab two draft');await expect(other.locator('#outline-save-status')).toContainText('Conflict:');await expect(other.locator('#outline-course-title')).toHaveValue('My tab two draft');
  expect((await snapshot()).project.document.course.title).toBe('Saved from tab one');
  const downloading=other.waitForEvent('download');await other.getByRole('button',{name:'Download outline project'}).click();const file=await downloading;
  expect((await importProject(await readFile((await file.path())!))).document.course.title).toBe('My tab two draft');
  await other.getByRole('button',{name:'Save outline as separate copy'}).click();await expect(other.locator('#outline-notice')).toContainText('separate copy');
  const copies=await client.get('/api/library/courses?search=My%20tab%20two');expect((await copies.json()).courses).toHaveLength(1);
  other.once('dialog',dialog=>dialog.accept());await other.getByRole('button',{name:'Reload saved course'}).click();await expect(other.locator('#outline-course-title')).toHaveValue('Saved from tab one');await saved(other);
  await other.close();
});

test('a save committed before a lost response retries without creating an extra revision',async({page})=>{
  await open(page);let attempts=0;
  await page.route('**/api/library/courses/*/document',async route=>{attempts++;if(attempts===1){const response=await route.fetch();expect(response.ok()).toBe(true);await route.abort('failed');}else await route.continue();});
  await page.locator('#outline-course-title').fill('Saved despite lost response');await expect(page.locator('#outline-save-status')).toContainText('Save not confirmed');expect((await snapshot()).revision).toBe(2);
  await page.getByRole('button',{name:'Retry save',exact:true}).click();await saved(page);expect(attempts).toBe(2);expect((await snapshot()).revision).toBe(2);
});
