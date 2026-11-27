import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { instanceSizeLimits } from '../src/server/config.js';
import { LIMITS } from '../src/project/archive.js';
import { RISE_LIMITS } from '../src/project/rise-import.js';
import { RETENTION } from '../src/server/reuse-routes.js';
import { applyInstanceLimits, courseTimeout, DEFAULT_LIMITS, instanceLimits, MiB, packageBytes, requestBytes, riseUploadBytes, transferTimeout } from '../src/shared/limits.js';
import { assetSchema } from '../src/shared/course.js';

const withEnv = (values: Record<string, string>, run: () => void) => {
  const before = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { run(); } finally { for (const [key, value] of Object.entries(before)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
};

test('an instance allows 64 MiB per file and 160 MiB per course unless its operator sets other limits', () => {
  assert.deepEqual(instanceSizeLimits({}), { fileBytes: 64 * MiB, courseBytes: 160 * MiB });
  assert.deepEqual(instanceSizeLimits({ OPENSCROLL_MAX_FILE_MIB: '200', OPENSCROLL_MAX_COURSE_MIB: '320' }), { fileBytes: 200 * MiB, courseBytes: 320 * MiB });
  assert.deepEqual(instanceSizeLimits({ OPENSCROLL_MAX_FILE_MIB: '', OPENSCROLL_MAX_COURSE_MIB: '' }), DEFAULT_LIMITS);
  assert.throws(() => instanceSizeLimits({ OPENSCROLL_MAX_FILE_MIB: '300' }), /16 to 256/);
  assert.throws(() => instanceSizeLimits({ OPENSCROLL_MAX_COURSE_MIB: '1000' }), /64 to 320/);
  assert.throws(() => instanceSizeLimits({ OPENSCROLL_MAX_FILE_MIB: '100', OPENSCROLL_MAX_COURSE_MIB: '64' }), /cannot be larger/);
  assert.throws(() => instanceSizeLimits({ OPENSCROLL_MAX_FILE_MIB: '64.5' }), /whole number/);
});

test('every limit that carries a course follows the instance setting', () => {
  assert.equal(LIMITS.entry, 64 * MiB); assert.equal(LIMITS.expanded, 160 * MiB); assert.equal(LIMITS.archive, 176 * MiB);
  assert.equal(RISE_LIMITS.upload, 192 * MiB); assert.equal(RETENTION.ownerBytes, 640 * MiB);
  withEnv({ OPENSCROLL_MAX_FILE_MIB: '16', OPENSCROLL_MAX_COURSE_MIB: '64' }, () => {
    assert.equal(LIMITS.entry, 16 * MiB); assert.equal(LIMITS.expanded, 64 * MiB); assert.equal(LIMITS.archive, 80 * MiB);
    assert.equal(RISE_LIMITS.upload, 96 * MiB); assert.equal(RETENTION.ownerBytes, 256 * MiB);
  });
  // The largest setting still fits one request in a JavaScript string (about 512 MiB) and under the proxy's limit.
  const largest = instanceSizeLimits({ OPENSCROLL_MAX_FILE_MIB: '256', OPENSCROLL_MAX_COURSE_MIB: '320' });
  assert.ok(requestBytes(largest) < 440 * MiB && requestBytes(largest) < 2 ** 29 - 24);
  assert.ok(riseUploadBytes(largest) > packageBytes(largest));
});

test('the format accepts files up to the largest setting; each instance checks its own limit', () => {
  const asset = { id: 'clip', fileName: 'clip.mp4', mediaType: 'video/mp4', byteLength: 256 * MiB, sha256: 'a'.repeat(64) };
  assert.ok(assetSchema.safeParse(asset).success);
  assert.ok(!assetSchema.safeParse({ ...asset, byteLength: 256 * MiB + 1 }).success);
});

test('the editors take the limits the server reports and ignore anything else', () => {
  const before = { ...instanceLimits };
  try {
    applyInstanceLimits({ fileBytes: 128 * MiB, courseBytes: 256 * MiB });
    assert.deepEqual(instanceLimits, { fileBytes: 128 * MiB, courseBytes: 256 * MiB });
    applyInstanceLimits({ fileBytes: 9999 * MiB, courseBytes: 256 * MiB });
    assert.deepEqual(instanceLimits, { fileBytes: 128 * MiB, courseBytes: 256 * MiB }, 'an out-of-range report is ignored');
    applyInstanceLimits(undefined);
    assert.equal(instanceLimits.fileBytes, 128 * MiB);
  } finally { Object.assign(instanceLimits, before); }
});

test('large uploads and exports are given time in proportion to their size', () => {
  assert.equal(transferTimeout(0), 30_000);
  assert.equal(transferTimeout(512 * 1024), 31_000);
  const small = courseTimeout({ document: { assets: [] } }), large = courseTimeout({ document: { assets: [{ byteLength: 160 * MiB }] } });
  assert.ok(small >= 60_000 && small < 70_000);
  assert.ok(large > 8 * 60_000, 'a full-size course gets several minutes');
});

test('the deployment files carry the size settings and a proxy limit that fits the largest course', async () => {
  const compose = await readFile('deploy/compose.yaml', 'utf8'), example = await readFile('deploy/env.example', 'utf8'), caddy = await readFile('deploy/Caddyfile', 'utf8');
  assert.match(compose, /OPENSCROLL_MAX_FILE_MIB: \$\{OPENSCROLL_MAX_FILE_MIB:-64\}/);
  assert.match(compose, /OPENSCROLL_MAX_COURSE_MIB: \$\{OPENSCROLL_MAX_COURSE_MIB:-160\}/);
  assert.match(example, /^OPENSCROLL_MAX_FILE_MIB=64$/m); assert.match(example, /^OPENSCROLL_MAX_COURSE_MIB=160$/m);
  assert.match(caddy, /max_size 440MiB/);
});
