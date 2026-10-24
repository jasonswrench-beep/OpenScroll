import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { importProject } from '../../src/project/archive.js';
import { readFile } from 'node:fs/promises';

test('author opens starter, edits title, downloads and reopens a portable project', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Open starter course'}).click();
  const title=page.getByRole('textbox',{name:'Course title'});
  await expect(title).toHaveValue('Welcome to OpenScroll');
  await expect(title).toBeFocused();
  await expect(page.locator('#project-summary')).toContainText('2 lessons');
  await title.fill('My portable course');
  const downloading=page.waitForEvent('download');
  await page.getByRole('button',{name:'Download editable project'}).click();
  const downloaded=await downloading;
  const path=await downloaded.path();
  expect(path).not.toBeNull();
  const originalBytes=await readFile(path!);
  const project=await importProject(originalBytes);
  expect(project.document.course.title).toBe('My portable course');
  expect(project.document.assets).toHaveLength(1);
  await page.reload();
  await expect(page.locator('#project-details')).toBeHidden();
  await page.getByLabel('Open an .openscroll project').setInputFiles({name:'reopened.openscroll',mimeType:'application/x-openscroll-project',buffer:originalBytes});
  await expect(title).toHaveValue('My portable course');
  expect((await new AxeBuilder({page}).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze()).violations).toEqual([]);
  await page.setViewportSize({width:375,height:812});
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test('bad import preserves current project and downloaded text never becomes executable markup', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button',{name:'Open starter course'}).click();
  const title=page.getByRole('textbox',{name:'Course title'});
  await expect(title).toHaveValue('Welcome to OpenScroll');
  const hostile='<img src=x onerror=alert(1)>';
  await title.fill(hostile);
  page.on('dialog',dialog => dialog.accept());
  await page.getByLabel('Open an .openscroll project').setInputFiles({name:'bad.openscroll',mimeType:'application/x-openscroll-project',buffer:Buffer.from('not a zip')});
  await expect(page.locator('#project-status')).toContainText('Your current project is unchanged.');
  await expect(title).toHaveValue(hostile);
  await expect(page.locator('#project-details img')).toHaveCount(0);
  await expect(page.locator('img[onerror]')).toHaveCount(0);
  await expect(page.getByRole('button',{name:'Download editable project'})).toBeEnabled();
});
