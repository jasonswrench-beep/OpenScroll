import { test,expect,type APIRequestContext,type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import AxeBuilder from '@axe-core/playwright';
import { randomToken,tokenHash,hashPassword } from '../../src/server/accounts/passwords.js';
import { assetPath } from '../../src/shared/course.js';
import { sampleProject } from '../../src/project/sample.js';
import { importProject } from '../../src/project/archive.js';
let client:APIRequestContext;let id:string;
const owner=randomUUID(),token=randomToken(),csrf=randomToken();
const cookie={name:'openscroll_session',value:token,domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax' as const};
test.beforeAll(async({playwright})=>{
  const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});
  try{
    await pool.query('INSERT INTO authors(id,email,display_name,password_hash,verified) VALUES($1,$2,$3,$4,true)',[owner,`blocks-${owner}@example.invalid`,'Block test author',await hashPassword(randomToken())]);
    await pool.query("INSERT INTO author_sessions(token_hash,author_id,csrf_token,expires_at) VALUES($1,$2,$3,now()+interval '1 hour')",[tokenHash(token),owner,csrf]);
  }finally{await pool.end();}
  client=await playwright.request.newContext({baseURL:'http://127.0.0.1:3000',extraHTTPHeaders:{cookie:`openscroll_session=${token}`,'x-openscroll-request':'1','x-csrf-token':csrf,origin:'http://127.0.0.1:3000'}});
});
test.beforeEach(async({context})=>{await context.addCookies([cookie]);const result=await client.post('/api/library/courses/import',{data:sampleProject()});expect(result.ok()).toBe(true);id=(await result.json()).id;});
test.afterEach(async()=>{const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});try{await pool.query('DELETE FROM courses WHERE owner_id=$1',[owner]);}finally{await pool.end();}});
test.afterAll(async()=>{const pool=new pg.Pool({connectionString:process.env.DATABASE_URL});try{await pool.query('DELETE FROM authors WHERE id=$1',[owner]);}finally{await pool.end();}await client?.dispose();});
async function open(page:Page){await page.goto('/');await page.getByRole('button',{name:'Open: Welcome to OpenScroll',exact:true}).click();await page.getByRole('button',{name:'Open lesson',exact:true}).first().click();await expect(page.getByRole('region',{name:'Lesson canvas',exact:true})).toBeVisible();}
const cards=(page:Page)=>page.locator('.lesson-canvas>article');
const saved=(page:Page)=>expect(page.locator('#outline-save-status')).toHaveText('Saved to your library.');
async function snapshot(){const response=await client.get(`/api/library/courses/${id}/edit`);expect(response.ok()).toBe(true);return response.json();}

test('between-block insertion, plaintext editing, variants, ordering and keyboard history persist',async({page})=>{
  await open(page);const count=await cards(page).count();
  await page.getByRole('button',{name:'Insert a block at position 2',exact:true}).click();
  await expect(page.getByLabel('Search block templates')).toBeFocused();await page.getByLabel('Search block templates').fill('paragraph');
  await page.getByRole('button',{name:'Insert Paragraph',exact:true}).click();await expect(cards(page)).toHaveCount(count+1);
  const block=cards(page).nth(1),blockId=await block.getAttribute('data-block-id');const text=block.getByRole('textbox',{name:'Paragraph text',exact:true});
  await text.fill('An original lesson.');await text.press('End');await text.pressSequentially(' More text.');await expect(text).toHaveText('An original lesson. More text.');
  await text.evaluate(element=>{const data=new DataTransfer();data.setData('text/plain','<img src=x onerror=alert(1)>');data.setData('text/html','<img src=x onerror=alert(1)>');element.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));});
  await expect(block.locator('[contenteditable] img')).toHaveCount(0);await expect(text).toContainText('<img src=x onerror=alert(1)>');
  await block.getByRole('combobox').selectOption('with-heading');await expect(block.getByRole('textbox',{name:'Paragraph text',exact:true})).toContainText('An original lesson.');
  await block.getByRole('textbox',{name:'Paragraph heading',exact:true}).fill('A useful heading');
  await block.getByRole('button',{name:'Settings for block 2',exact:true}).click();await page.getByLabel('Block width', {exact:true}).selectOption('wide');await page.getByLabel('Block background',{exact:true}).selectOption('accent');
  await page.getByLabel('Include a narration script').check();await page.getByLabel('Narration script',{exact:true}).fill('Read this original lesson.');
  await page.getByRole('button',{name:'Close block settings'}).click();
  await block.getByRole('button',{name:'Duplicate block 2',exact:true}).click();await expect(cards(page)).toHaveCount(count+2);
  const copyId=await cards(page).nth(2).getAttribute('data-block-id');expect(copyId).not.toBe(blockId);
  await cards(page).nth(2).getByRole('button',{name:'Move block 3 up',exact:true}).click();expect(await cards(page).nth(1).getAttribute('data-block-id')).toBe(copyId);
  await cards(page).nth(1).getByRole('button',{name:'Delete block 2',exact:true}).click();await expect(cards(page)).toHaveCount(count+1);
  await page.getByRole('button',{name:'Undo lesson edit',exact:true}).click();await expect(cards(page)).toHaveCount(count+2);expect(await cards(page).nth(1).getAttribute('data-block-id')).toBe(copyId);
  await cards(page).nth(1).getByRole('textbox',{name:'Paragraph text',exact:true}).press('Control+Shift+z');await expect(cards(page)).toHaveCount(count+1);
  await saved(page);const state=await snapshot();const stored=state.project.document.course.sections[0].lessons[0].blocks.find((b:{id:string})=>b.id===blockId);
  expect(stored.content.heading).toBe('A useful heading');expect(stored.appearance.width).toBe('wide');expect(stored.narration.script).toBe('Read this original lesson.');
  await page.getByRole('button',{name:'Preview course',exact:true}).click();const preview=page.frameLocator('iframe[title="Learner course preview"]');await expect(preview.getByText('A useful heading',{exact:true})).toBeVisible();await preview.getByRole('button',{name:'Complete lesson and continue',exact:true}).click();await page.getByRole('button',{name:'Return to editing',exact:true}).click();
  await expect(page.locator(`[data-block-id="${blockId}"]`).getByRole('textbox',{name:'Paragraph heading',exact:true})).toHaveText('A useful heading');expect((await snapshot()).revision).toBe(state.revision);
  const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Download outline project',exact:true}).click();const file=await downloading;
  const portable=await importProject(await readFile((await file.path())!));expect(portable.document.course.sections[0]!.lessons[0]!.blocks.find(b=>b.id===blockId)).toEqual(stored);
  await page.reload();await page.getByRole('button',{name:'Open: Welcome to OpenScroll',exact:true}).click();await page.getByRole('button',{name:'Open lesson',exact:true}).first().click();await expect(page.locator(`[data-block-id="${blockId}"]`).getByRole('textbox',{name:'Paragraph heading',exact:true})).toHaveText('A useful heading');
});

test('image and list settings, accessible panels and narrow canvas work without losing assets',async({page})=>{
  await open(page);await page.getByRole('group',{name:'Quick insert at end of lesson'}).getByRole('button',{name:'Image',exact:true}).click();
  let image=cards(page).last();const imageId=await image.getAttribute('data-block-id');await image.getByRole('button',{name:/Settings for block/}).click();
  await page.getByLabel('Upload image (PNG, JPEG, or WebP)',{exact:true}).setInputFiles({name:'lesson.png',mimeType:'image/png',buffer:Buffer.from(sampleProject().files['assets/sample-image.png']!,'base64')});
  await expect(page.getByRole('status').filter({hasText:'Image added.'})).toBeVisible();await page.getByLabel('Image alternative text',{exact:true}).fill('A meaningful lesson illustration');
  await expect(page.locator(`[data-block-id="${imageId}"] img`)).toHaveAttribute('alt','A meaningful lesson illustration');
  await page.getByLabel('Image is decorative').check();await expect(page.locator(`[data-block-id="${imageId}"] img`)).toHaveAttribute('alt','');await page.getByLabel('Image is decorative').uncheck();
  await page.getByRole('button',{name:'Close block settings'}).click();await page.getByRole('group',{name:'Quick insert at end of lesson'}).getByRole('button',{name:'List',exact:true}).click();
  const list=cards(page).last();await list.getByRole('button',{name:/Settings for block/}).click();const before=await list.getByRole('textbox').count();await page.getByRole('button',{name:'Add list item',exact:true}).click();await expect(list.getByRole('textbox')).toHaveCount(before+1);await page.getByRole('button',{name:'Remove list item 1',exact:true}).click();await expect(list.getByRole('textbox')).toHaveCount(before);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');await expect(page.getByRole('complementary',{name:'Block settings',exact:true})).toBeHidden();await expect(list.getByRole('button',{name:/Settings for block/})).toBeFocused();
  await page.getByRole('button',{name:'Block library',exact:true}).click();await page.getByRole('group',{name:'Block categories'}).getByRole('button',{name:'Images',exact:true}).click();await expect(page.getByRole('button',{name:'Insert Paragraph',exact:true})).toHaveCount(0);
  await page.setViewportSize({width:375,height:812});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.keyboard.press('Escape');await saved(page);const state=await snapshot();expect(state.project.document.assets).toHaveLength(3);
  await page.screenshot({path:'/tmp/openscroll-step6-mobile.png',fullPage:true});
});

test('block edits recover after failed saves and retain a conflicting tab draft',async({page,context})=>{
  await open(page);const paragraph=cards(page).filter({has:page.getByRole('textbox',{name:'Paragraph text',exact:true})}).first();const blockId=await paragraph.getAttribute('data-block-id');
  await page.route('**/api/library/courses/*/document',route=>route.abort('failed'));await paragraph.getByRole('textbox',{name:'Paragraph text',exact:true}).fill('A recoverable block edit.');await expect(page.locator('#outline-save-status')).toContainText('Save not confirmed');
  page.once('dialog',dialog=>dialog.accept());await page.reload();await page.getByRole('button',{name:'Open: Welcome to OpenScroll',exact:true}).click();await page.getByRole('button',{name:'Restore recovery draft',exact:true}).click();await page.unroute('**/api/library/courses/*/document');await page.getByRole('button',{name:'Retry save',exact:true}).click();await saved(page);
  await page.getByRole('button',{name:'Open lesson',exact:true}).first().click();await expect(page.locator(`[data-block-id="${blockId}"]`).getByRole('textbox',{name:'Paragraph text',exact:true})).toHaveText('A recoverable block edit.');
  const other=await context.newPage();await open(other);await page.locator(`[data-block-id="${blockId}"]`).getByRole('textbox',{name:'Paragraph text',exact:true}).fill('Saved from the first tab.');await saved(page);
  await other.locator(`[data-block-id="${blockId}"]`).getByRole('textbox',{name:'Paragraph text',exact:true}).fill('Unsaved text in the second tab.');await expect(other.locator('#outline-save-status')).toContainText('Conflict:');
  expect((await snapshot()).project.document.course.sections[0].lessons[0].blocks.find((b:{id:string})=>b.id===blockId).content.text).toBe('Saved from the first tab.');await expect(other.locator(`[data-block-id="${blockId}"]`).getByRole('textbox',{name:'Paragraph text',exact:true})).toHaveText('Unsaved text in the second tab.');await other.close();
});

test('all core templates render accessibly and keyboard insertion keeps per-lesson history separate',async({page})=>{
  const {BLOCK_TEMPLATES,prepareBlock}=await import('../../src/shared/block-catalog.js');
  const state=await snapshot(),project=state.project;project.document.course.sections[0].lessons[0].blocks=[];
  for(const template of BLOCK_TEMPLATES){const prepared=prepareBlock(template.key,project);project.document.course.sections[0].lessons[0].blocks.push(prepared.block);if(prepared.asset){project.document.assets.push(prepared.asset);project.files[assetPath(prepared.asset)]=prepared.data;}}
  const response=await client.put(`/api/library/courses/${id}/document`,{data:{revision:state.revision,mutationId:randomUUID(),document:project.document,files:project.files}});expect(response.ok()).toBe(true);
  await open(page);await expect(cards(page)).toHaveCount(BLOCK_TEMPLATES.length);
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.getByRole('button',{name:'Insert a block at position 1',exact:true}).focus();await page.keyboard.press('Enter');await expect(page.getByLabel('Search block templates')).toBeFocused();await page.keyboard.press('Escape');await expect(page.getByRole('button',{name:'Insert a block at position 1',exact:true})).toBeFocused();
  await page.keyboard.press('Enter');await page.getByLabel('Search block templates').fill('quote');await page.getByRole('button',{name:'Insert Quote',exact:true}).focus();await page.keyboard.press('Enter');await expect(cards(page)).toHaveCount(BLOCK_TEMPLATES.length+1);await expect(cards(page).first().getByRole('textbox',{name:'Quotation text',exact:true})).toBeFocused();
  await page.keyboard.press('Control+z');await expect(cards(page)).toHaveCount(BLOCK_TEMPLATES.length);await page.keyboard.press('Control+Shift+z');await expect(cards(page)).toHaveCount(BLOCK_TEMPLATES.length+1);
  const nav=page.getByLabel('Jump to lesson',{exact:true});const lessons=project.document.course.sections[0].lessons;
  await nav.selectOption(lessons[1].id);await expect(page.getByRole('button',{name:'Undo lesson edit',exact:true})).toBeDisabled();await nav.selectOption(lessons[0].id);await expect(page.getByRole('button',{name:'Undo lesson edit',exact:true})).toBeEnabled();
  await page.getByRole('button',{name:'Block library',exact:true}).click();await page.getByLabel('Search block templates').fill('');await page.screenshot({path:'/tmp/openscroll-step6-desktop.png',fullPage:true});await saved(page);
});
