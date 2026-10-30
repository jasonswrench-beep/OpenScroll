import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertBrowserVersion, BROWSER_EXECUTABLE_PATH, MINIMUM_BROWSER_VERSION } from '../src/renderer/browser.js';

test('the fixed renderer browser accepts the patched Chrome and Debian Chromium version floor', () => {
  assert.equal(BROWSER_EXECUTABLE_PATH, '/usr/bin/chromium');
  assert.equal(MINIMUM_BROWSER_VERSION, '156.0.8078.79');
  for (const output of ['Google Chrome 156.0.8078.79\n', 'Google Chrome 156.0.8078.79 unknown\n', 'Chromium 156.0.8078.79', 'Chromium 156.0.8078.79 built on Debian GNU/Linux 12 (bookworm)']) {
    assert.equal(assertBrowserVersion(output), '156.0.8078.79');
  }
});

test('the renderer rejects older browsers even when their other version components are larger', () => {
  for (const version of ['156.0.8078.4', '156.0.8078.73', '156.0.8078.78', '156.0.8077.999', '155.65535.65535.65535']) {
    assert.throws(() => assertBrowserVersion('Google Chrome ' + version), /must be at least/);
  }
  assert.throws(() => assertBrowserVersion('Google Chrome 156.0.8078.73 unknown\n'), /must be at least/);
});

test('browser version comparison orders numeric components and permits later security releases', () => {
  for (const version of ['156.0.8078.80', '156.0.8078.100', '156.0.8079.0', '156.1.0.0', '157.0.0.0']) {
    assert.equal(assertBrowserVersion('Chromium ' + version), version);
  }
});

test('browser version output cannot hide a stale version in malformed, oversized or unsupported text', () => {
  for (const output of [
    '', '156.0.8078.79', 'Firefox 156.0.8078.79', 'Chrome 156.0.8078.79',
    'Google Chrome 156.0.8078', 'Google Chrome 156.0.8078.79.1', 'Google Chrome v156.0.8078.79',
    'Google Chrome 0156.0.8078.79', 'Google Chrome 156.0.8078.-79', 'Google Chrome 156.0.8078.65536',
    'Google Chrome 156.0.8078.79\nChromium 156.0.8078.73', 'Google Chrome 156.0.8078.79 arbitrary-suffix',
    'Google Chrome 156.0.8078.79 beta', 'Google Chrome 156.0.8078.79 unknown extra', 'Chromium 156.0.8078.79 unknown',
    'Chromium 156.0.8078.79 built on Debian GNU/Linux 12 (bookworm) extra',
    'Google Chrome 156.0.8078.79' + ' '.repeat(256),
  ]) assert.throws(() => assertBrowserVersion(output), /Unrecognized/);
});
