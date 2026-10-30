import { approveFixtureAuthor } from '../helpers/accounts.js';
import { test,expect, type Page } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { readdir,readFile,unlink } from 'node:fs/promises';
const createdEmails:string[]=[];
test.afterEach(async () => {
  const emails=createdEmails.splice(0);
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  try {await pool.query('DELETE FROM authors WHERE email=ANY($1::text[])',[emails]);}finally{await pool.end();}
  for(const file of await readdir('.local/test-mail').catch(() => [])) {
    const path=`.local/test-mail/${file}`;
    const message=JSON.parse(await readFile(path,'utf8'));
    if(emails.includes(message.to))await unlink(path);
  }
});
const password='A browser testing password 42';
async function signup(page:Page,email:string,name:string) {
  await page.goto('/account/');
  await page.locator('#register-name').fill(name);await page.locator('#register-email').fill(email);await page.locator('#register-password').fill(password);
  await page.getByRole('button',{name:'Request account',exact:true}).click();
  await expect(page.locator('#account-status')).toContainText(/verification|verify|email/i);
  createdEmails.push(email);
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});try{await approveFixtureAuthor(pool,email);}finally{await pool.end();}
}
async function login(page:Page,email:string,pass=password) {
  await page.locator('#login-email').fill(email);await page.locator('#login-password').fill(pass);
  await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await expect(page).toHaveURL(/\/app\/$/);
  await expect(page.locator('#library-panel')).toBeVisible();
}
test('author manages persistent library with accessible controls and no cross-account content',async ({page,browser}) => {
  const suffix=randomUUID();const email=`browser-${suffix}@example.invalid`;
  await signup(page,email,'Browser Author');await login(page,email);
  const title=`Course ${suffix}`;const renamed=`Renamed ${suffix}`;
  await page.getByLabel('New course title',{exact:true}).fill(title);await page.getByRole('button',{name:'Create course',exact:true}).click();
  await expect(page.getByRole('heading',{name:title,exact:true})).toBeVisible();
  await page.getByRole('button',{name:`Rename: ${title}`,exact:true}).click();
  await page.getByLabel('New course title',{exact:true}).filter({visible:true}).last().fill(renamed);
  await page.getByRole('button',{name:'Save title',exact:true}).click();
  await expect(page.getByRole('heading',{name:renamed,exact:true})).toBeVisible();
  await page.getByRole('button',{name:`Duplicate: ${renamed}`,exact:true}).click();
  await expect(page.getByRole('heading',{name:`Copy of ${renamed}`,exact:true})).toBeVisible();
  await page.getByLabel('Search your courses').fill(suffix);await page.getByRole('button',{name:'Search courses',exact:true}).click();
  await expect(page.locator('#course-list>li')).toHaveCount(2);
  await page.getByLabel('Sort courses').selectOption('title');
  await page.getByRole('button',{name:'Use list view',exact:true}).click();await expect(page.locator('#course-list')).toHaveClass(/list-view/);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:`Open: ${renamed}`,exact:true}).click();await expect(page.getByRole('textbox',{name:'Course title',exact:true})).toHaveValue(renamed);
  await page.reload();await expect(page.getByRole('heading',{name:renamed,exact:true})).toBeVisible();
  await expect(page.locator('#project-details')).toBeHidden();
  const other=await browser.newContext();
  try {
    const bob=await other.newPage();await signup(bob,`other-${suffix}@example.invalid`,'Other Author');await login(bob,`other-${suffix}@example.invalid`);
    await expect(bob.locator('#course-list>li')).toHaveCount(0);await expect(bob.getByRole('heading',{name:renamed,exact:true})).toHaveCount(0);
  }finally{await other.close();}
  page.once('dialog',dialog => dialog.accept());await page.getByRole('button',{name:`Delete: ${renamed}`,exact:true}).click();
  await expect(page.getByRole('heading',{name:renamed,exact:true})).toHaveCount(0);
  await expect(page.getByRole('heading',{name:`Copy of ${renamed}`,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.locator('#library-panel')).toBeHidden();await expect(page.locator('#course-list>li')).toHaveCount(0);
});

test('author saves a portable starter and resets password through a private development email',async ({page}) => {
  const email=`reset-${randomUUID()}@example.invalid`;
  await signup(page,email,'Reset Author');await login(page,email);
  await page.getByRole('button',{name:'Open starter course'}).click();await expect(page.locator('#course-title')).toHaveValue('Welcome to OpenScroll');
  await page.getByRole('button',{name:'Save a copy to library'}).click();await expect(page.locator('#library-panel').getByRole('heading',{name:'Welcome to OpenScroll',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await expect(page.locator('#project-details')).toBeHidden();
  await page.getByText('Reset your password or verify your email',{exact:true}).click();
  await page.locator('#reset-email').fill(email);await page.getByRole('button',{name:'Send reset email'}).click();
  await expect(page.locator('#account-status')).toContainText('If an account matches');
  let text='';
  await expect.poll(async () => {
    for(const file of await readdir('.local/test-mail')) {const message=JSON.parse(await readFile(`.local/test-mail/${file}`,'utf8'));if(message.to===email&&message.subject.includes('Reset'))text=message.text;}
    return !!text;
  }).toBe(true);
  const link=new URL(text.match(/http[^\s]+/)![0]);await page.goto('/'+link.hash);
  await expect(page).toHaveURL(/\/account\//);
  await expect(page.locator('#reset-form')).toBeVisible();expect(page.url()).not.toContain('#reset=');
  const next='A changed browser password 43';await page.locator('#new-password').fill(next);await page.getByRole('button',{name:'Change password',exact:true}).click();
  await expect(page.locator('#account-status')).toContainText('Password changed');
  await login(page,email,next);await expect(page.locator('#library-panel').getByRole('heading',{name:'Welcome to OpenScroll',exact:true})).toBeVisible();
});
