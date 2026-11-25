import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { studioEnabled } from '../src/server/config.js';

test('the studio is on in development and off in production unless the instance says otherwise', () => {
  assert.equal(studioEnabled({}), true);
  assert.equal(studioEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(studioEnabled({ NODE_ENV: 'production', OPENSCROLL_STUDIO: '' }), false);
  assert.equal(studioEnabled({ NODE_ENV: 'production', OPENSCROLL_STUDIO: 'on' }), true);
  assert.equal(studioEnabled({ OPENSCROLL_STUDIO: 'off' }), false);
  assert.throws(() => studioEnabled({ OPENSCROLL_STUDIO: 'yes' }), /on or off/);
});

test('the deployment files keep the studio off until an operator turns it on', async () => {
  assert.match(await readFile('deploy/compose.yaml', 'utf8'), /OPENSCROLL_STUDIO: \$\{OPENSCROLL_STUDIO:-off\}/);
  assert.match(await readFile('deploy/env.example', 'utf8'), /^OPENSCROLL_STUDIO=off$/m);
});
