import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

// The packs the studio's library reads (src/studio/character-library.ts), copied from OpenStage Author.
const root = 'public/character-packs';
const picture = /^[a-z0-9-]+(\/[a-z0-9-]+)*\.webp$/;
const isWebp = (bytes: Buffer) => bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP';

test('every person in the library has described poses whose pictures are present', async () => {
  const pack = JSON.parse(await readFile(join(root, 'openstage-people-1/pack.json'), 'utf8'));
  assert.equal(pack.credit.licence, 'AI-generated, Apache License 2.0');
  assert.equal(pack.people.length, 15);
  for (const person of pack.people) {
    assert.match(person.head, picture); assert.ok(isWebp(await readFile(join(root, 'openstage-people-1', person.head))));
    assert.ok(person.poses.length >= 1);
    for (const pose of person.poses) {
      assert.match(pose.file, picture, pose.file);
      assert.ok(pose.alt.trim().length > 20 && pose.alt.length <= 2000, `${person.id}/${pose.id} is described`);
      assert.ok(pose.label.trim() && pose.label.length <= 300);
      const bytes = await readFile(join(root, 'openstage-people-1', pose.file));
      assert.ok(isWebp(bytes) && bytes.length < 16 * 1024 * 1024, pose.file);
    }
  }
});

test('every background in the library is described and present', async () => {
  const pack = JSON.parse(await readFile(join(root, 'openstage-offices-1/pack.json'), 'utf8'));
  assert.equal(pack.credit.licence, 'AI-generated, Apache License 2.0');
  assert.equal(pack.backgrounds.length, 58);
  for (const place of pack.backgrounds) {
    assert.match(place.file, picture); assert.ok(place.alt.trim() && place.name.trim() && place.group.trim());
    assert.ok(isWebp(await readFile(join(root, 'openstage-offices-1', place.file))), place.file);
  }
});

test('the library holds only pictures, pack descriptions and its README, and every published course credits it', async () => {
  const files = (await readdir(root, { recursive: true, withFileTypes: true })).filter(entry => entry.isFile()).map(entry => entry.name);
  assert.ok(files.every(name => name.endsWith('.webp') || name === 'pack.json' || name === 'README.txt'), 'nothing executable');
  const notice = await readFile('NOTICE', 'utf8');
  assert.match(notice, /public\/character-packs/); assert.match(notice, /Jason S\. Wrench/); assert.match(notice, /AI-generated/); assert.match(notice, /Apache License 2\.0/);
});
