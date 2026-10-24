import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { crc32, deflateRawSync } from 'node:zlib';
import { exportProject, importProject, LIMITS, validateProject } from '../src/project/archive.js';
import { sampleProject } from '../src/project/sample.js';
import { assetPath, parseCourse } from '../src/shared/course.js';
import { buildApp } from '../src/server/app.js';

// Construct adversarial archives without asking a ZIP writer to sanitize them.
function rawZip(entries: { name: string; data: Buffer; method?: number; mode?: number; flags?: number; declaredSize?: number }[]): Buffer {
  const local: Buffer[]=[]; const central: Buffer[]=[];
  let offset=0;
  for (const entry of entries) {
    const name=Buffer.from(entry.name);
    const method=entry.method ?? 0;
    const data=method === 8 ? deflateRawSync(entry.data) : entry.data;
    const size=entry.declaredSize ?? entry.data.length;
    const checksum=crc32(entry.data);
    const head=Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20,4); head.writeUInt16LE(entry.flags ?? 0,6); head.writeUInt16LE(method,8);
    head.writeUInt32LE(checksum,14); head.writeUInt32LE(data.length,18); head.writeUInt32LE(size,22); head.writeUInt16LE(name.length,26);
    const directory=Buffer.alloc(46);
    directory.writeUInt32LE(0x02014b50); directory.writeUInt16LE(0x0314,4); directory.writeUInt16LE(20,6); directory.writeUInt16LE(entry.flags ?? 0,8); directory.writeUInt16LE(method,10);
    directory.writeUInt32LE(checksum,16); directory.writeUInt32LE(data.length,20); directory.writeUInt32LE(size,24); directory.writeUInt16LE(name.length,28);
    directory.writeUInt32LE(((entry.mode ?? 0o100644) << 16) >>> 0,38); directory.writeUInt32LE(offset,42);
    local.push(head,name,data); central.push(directory,name); offset+=head.length+name.length+data.length;
  }
  const index=Buffer.concat(central); const end=Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(entries.length,8); end.writeUInt16LE(entries.length,10); end.writeUInt32LE(index.length,12); end.writeUInt32LE(offset,16);
  return Buffer.concat([...local,index,end]);
}
const manifest = () => Buffer.from(JSON.stringify(sampleProject().document));
function sampleEntries() { const p=sampleProject(); return [{name:'course.json',data:Buffer.from(JSON.stringify(p.document))},...p.document.assets.map(asset => ({name:assetPath(asset),data:Buffer.from(p.files[assetPath(asset)]!,'base64')}))]; }

test('editable package round trip preserves content, narration, settings, IDs, and asset bytes', async () => {
  const original=sampleProject(); const before=structuredClone(original);
  const archive=await exportProject(original);
  const opened=await importProject(archive);
  assert.deepEqual(opened,original);
  opened.document.course.title='My revised course';
  const reopened=await importProject(await exportProject(opened));
  assert.deepEqual(reopened,opened); assert.deepEqual(original,before);
  assert.deepEqual(await exportProject(original),archive,'identical content produces identical archives');
});

test('versions, unknown fields/types, duplicate IDs, and broken references fail without mutation', () => {
  const future={...sampleProject().document,schemaVersion:4}; const before=structuredClone(future);
  assert.throws(() => parseCourse(future), /Unsupported project version/); assert.deepEqual(future,before);
  assert.throws(() => parseCourse({...future,schemaVersion:0}), /Unsupported/);
  assert.throws(() => parseCourse({...sampleProject().document,extra:'must not disappear'}), /Invalid/);
  const duplicate=sampleProject(); duplicate.document.course.sections[0]!.id=duplicate.document.course.id;
  assert.throws(() => validateProject(duplicate), /Duplicate identifier/);
  const missing=sampleProject(); missing.document.assets=[]; missing.files={};
  assert.throws(() => validateProject(missing), /image asset/);
  const block=sampleProject(); (block.document.course.sections[0]!.lessons[0]!.blocks[0] as {type:string}).type='custom-code';
  assert.throws(() => validateProject(block), /Invalid/);
});

test('asset inventory, hash, type, filename, and encoding must agree', () => {
  const corrupt=sampleProject(); corrupt.files['assets/sample-image.png']=Buffer.from('not an image').toString('base64');
  assert.throws(() => validateProject(corrupt), /integrity/);
  const disguised=sampleProject(); const bytes=Buffer.from('<script>bad()</script>');
  disguised.files['assets/sample-image.png']=bytes.toString('base64');
  disguised.document.assets[0]!.byteLength=bytes.length;
  disguised.document.assets[0]!.sha256=createHash('sha256').update(bytes).digest('hex');
  assert.throws(() => validateProject(disguised), /type does not match/);
  const extension=sampleProject(); extension.document.assets[0]!.fileName='payload.html';
  assert.throws(() => validateProject(extension), /type does not match/);
  const extra=sampleProject(); extra.files['assets/extra.png']='AA==';
  assert.throws(() => validateProject(extra), /unexpected/);
  const absent=sampleProject(); absent.files={}; assert.throws(() => validateProject(absent), /missing/);
  const encoding=sampleProject(); encoding.files['assets/sample-image.png']='???'; assert.throws(() => validateProject(encoding), /encoding/);
});

test('unsafe ZIP paths, symlinks, duplicate names, encryption, and unsupported entries are rejected', async () => {
  for (const name of ['../course.json','/course.json','assets/../course.json','assets\\sample.png','assets/payload.html','assets/%2e%2e.png','assets/']) {
    await assert.rejects(importProject(rawZip([{name,data:manifest()}])));
  }
  await assert.rejects(importProject(rawZip([{name:'course.json',data:manifest(),mode:0o120777}])));
  await assert.rejects(importProject(rawZip([{name:'course.json',data:manifest(),flags:1}])));
  await assert.rejects(importProject(rawZip([{name:'course.json',data:manifest(),method:12}])));
  await assert.rejects(importProject(rawZip([{name:'course.json',data:manifest()},{name:'course.json',data:manifest()}])), /duplicate/);
});

test('corrupt ZIP, CRC, JSON, oversized entries, and excessive inventory fail safely', async () => {
  await assert.rejects(importProject(Buffer.from('not a zip')), /ZIP/);
  await assert.rejects(importProject(Buffer.alloc(LIMITS.archive+1)), /32 MiB/);
  const corrupt=rawZip(sampleEntries()); corrupt[30+'course.json'.length+1]! ^= 1;
  await assert.rejects(importProject(corrupt), /integrity/);
  await assert.rejects(importProject(rawZip([{name:'course.json',data:Buffer.from('{')} ])), /JSON/);
  await assert.rejects(importProject(rawZip([{name:'course.json',data:Buffer.from([255])} ])), /UTF-8/);
  await assert.rejects(importProject(rawZip([{name:'course.json',data:manifest(),method:8,declaredSize:LIMITS.json+1}])), /limits/);
  await assert.rejects(importProject(rawZip([{name:'assets/huge.txt',data:Buffer.alloc(LIMITS.entry+1,65),method:8}])), /limits/);
  await assert.rejects(importProject(rawZip(Array.from({length:257},(_,i) => ({name:`assets/a${i}.txt`,data:Buffer.from('a')})))), /limits/);
  await assert.rejects(importProject(rawZip([{name:'assets/orphan.txt',data:Buffer.from('a')} ])), /missing course.json/);
});

test('unknown versions preserve the original archive bytes', async () => {
  const future=sampleEntries(); future[0]!.data=Buffer.from(JSON.stringify({...sampleProject().document,schemaVersion:99}));
  const bytes=rawZip(future); const copy=Buffer.from(bytes);
  await assert.rejects(importProject(bytes), /Unsupported project version/); assert.deepEqual(bytes,copy);
});

test('project API downloads, imports, and re-exports without database writes', async () => {
  const app=await buildApp({query:async () => { throw new Error('Project operations must not access storage'); }});
  try {
    const sample=await app.inject('/api/projects/sample'); assert.equal(sample.statusCode,200);
    const imported=await app.inject({method:'POST',url:'/api/projects/import',headers:{'content-type':'application/x-openscroll-project'},payload:sample.rawPayload});
    assert.equal(imported.statusCode,200); assert.deepEqual(imported.json(),sampleProject());
    const exported=await app.inject({method:'POST',url:'/api/projects/export',payload:imported.json()});
    assert.equal(exported.statusCode,200); assert.deepEqual(await importProject(exported.rawPayload),sampleProject());
    const invalid=await app.inject({method:'POST',url:'/api/projects/import',headers:{'content-type':'application/x-openscroll-project'},payload:Buffer.from('bad')});
    assert.equal(invalid.statusCode,422); assert.match(invalid.json().error,/ZIP/);
    const malformed=await app.inject({method:'POST',url:'/api/projects/export',headers:{'content-type':'application/json'},payload:'{'});
    assert.equal(malformed.statusCode,400);
    assert.equal((await app.inject('/api/projects/sample')).statusCode,200,'failed requests release the processing slot');
  } finally { await app.close(); }
});

test('parallel project requests are bounded and the processing slot recovers', async () => {
  const app=await buildApp({query:async () => {}});
  try {
    const responses=await Promise.all([app.inject('/api/projects/sample'),app.inject('/api/projects/sample')]);
    assert.deepEqual(responses.map(r => r.statusCode).sort(),[200,429]);
    assert.equal((await app.inject('/api/projects/sample')).statusCode,200);
  } finally { await app.close(); }
});

test('committed starter fixture matches its original source', async () => {
  assert.deepEqual(await readFile('examples/welcome.openscroll'),await exportProject(sampleProject()));
});
