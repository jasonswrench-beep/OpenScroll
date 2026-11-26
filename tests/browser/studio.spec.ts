import { approveFixtureAuthor } from '../helpers/accounts.js';
import { seedSampleCourse } from '../helpers/library-fixture.js';
import { test,expect,type APIRequestContext,type Page } from './fixtures.js';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
let storage:Awaited<ReturnType<APIRequestContext['storageState']>>;
let client:APIRequestContext;
let owner:string;
let id:string;
let csrf:string;
const email=`studio-browser-${randomUUID()}@example.invalid`;
test.beforeAll(async({playwright})=>{
  client=await playwright.request.newContext({baseURL:'http://127.0.0.1:3000',extraHTTPHeaders:{'x-openscroll-request':'1',origin:'http://127.0.0.1:3000'}});
  const credentials={email,password:'A studio browser password 42'};
  expect((await client.post('/api/account/register',{data:{...credentials,name:'Studio browser author'}})).ok()).toBe(true);
  const pool=new pg.Pool({connectionString:process.env.ADMIN_DATABASE_URL});try{await approveFixtureAuthor(pool,email);}finally{await pool.end();}
  const login=await client.post('/api/account/login',{data:credentials});expect(login.ok()).toBe(true);const data=await login.json();owner=data.author.id;csrf=data.csrf;storage=await client.storageState();
});
test.beforeEach(async({context})=>{await context.addCookies(storage.cookies);id=await seedSampleCourse(owner);});
test.afterEach(async()=>{const pool=new pg.Pool({connectionString:process.env.ADMIN_DATABASE_URL});try{await pool.query('DELETE FROM courses WHERE owner_id=$1',[owner]);}finally{await pool.end();}});
test.afterAll(async()=>{
  if(owner){const pool=new pg.Pool({connectionString:process.env.ADMIN_DATABASE_URL});try{await pool.query('DELETE FROM authors WHERE id=$1 AND email=$2',[owner,email]);}finally{await pool.end();}}
  await client?.dispose();
});
const axe=async(page:Page)=>expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
async function snapshot(){const response=await client.get(`/api/library/courses/${id}/edit`);expect(response.ok()).toBe(true);return response.json();}
const saved=(page:Page)=>expect(page.getByRole('button',{name:'Save status, snapshots, and recovery'})).toHaveAttribute('data-state','saved');

test('the library lists courses and opens one on its course page',async({page})=>{
  await page.goto('/studio/');
  await expect(page.getByRole('heading',{name:'Library',level:1})).toBeVisible();
  await expect(page.getByRole('button',{name:'Welcome to OpenScroll',exact:true})).toBeVisible();
  await axe(page);
  await page.getByRole('button',{name:'Welcome to OpenScroll',exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`#course=${id}$`));
  await expect(page.getByRole('heading',{name:'Lessons'})).toBeVisible();
  await axe(page);
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('an author renames, adds, and reorders lessons and every change saves',async({page})=>{
  await page.goto(`/studio/#course=${id}`);
  await expect(page.getByRole('heading',{name:'Lessons'})).toBeVisible();
  const before=(await snapshot()).project.document.course.sections[0].lessons.length;
  await page.getByRole('button',{name:'Add lesson',exact:true}).first().click();
  const added=page.getByRole('textbox',{name:`Lesson ${before+1} title`});
  await expect(added).toBeFocused();await added.fill('Practice round');await saved(page);
  await page.getByRole('button',{name:`Move lesson ${before+1} up`}).click();
  await expect(page.getByRole('button',{name:`Move lesson ${before} up`})).toBeFocused();
  await saved(page);
  const lessons=(await snapshot()).project.document.course.sections[0].lessons;
  expect(lessons[before-1].title).toBe('Practice round');
  await page.getByRole('button',{name:new RegExp(`^Edit lesson ${before}: Practice round$`)}).click();
  await expect(page).toHaveURL(new RegExp(`&lesson=`));
  await page.getByRole('button',{name:'Back to course'}).click();
  await expect(page.getByRole('heading',{name:'Lessons'})).toBeVisible();
});

test('a change made in another tab pauses saving and keeps the edits',async({page})=>{
  await page.goto(`/studio/#course=${id}`);
  await expect(page.getByRole('heading',{name:'Lessons'})).toBeVisible();
  const current=await snapshot();
  expect((await client.patch(`/api/library/courses/${id}`,{data:{title:'Changed elsewhere',revision:current.revision},headers:{'x-csrf-token':csrf}})).ok()).toBe(true);
  await page.getByRole('textbox',{name:'Lesson 1 title'}).fill('My unsaved lesson title');
  await expect(page.getByRole('button',{name:'Save status, snapshots, and recovery'})).toHaveAttribute('data-state','conflict');
  await expect(page.getByRole('button',{name:'Download my edits'})).toBeVisible();
  await page.getByRole('button',{name:'Reload saved course'}).click();
  await page.getByRole('dialog',{name:'Reload the saved course?'}).getByRole('button',{name:'Reload saved course'}).click();
  await expect(page.getByRole('textbox',{name:'Lesson 1 title'})).not.toHaveValue('My unsaved lesson title');
  await saved(page);
});

test('the studio redirects people without authoring access to their account page',async({browser})=>{
  const context=await browser.newContext({storageState:{cookies:[],origins:[]}});const page=await context.newPage();
  await page.goto('/studio/');await expect(page).toHaveURL(/\/account\/?/);
  await context.close();
});
