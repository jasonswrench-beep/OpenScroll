import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import { TextDecoder } from 'node:util';
import yauzl from 'yauzl';
import yazl from 'yazl';
import { assetPath, parseCourse, ProjectError, type Asset, type PortableProject } from '../shared/course.js';

export const LIMITS = { archive: 32 * 1024 * 1024, expanded: 64 * 1024 * 1024, entry: 16 * 1024 * 1024, json: 2 * 1024 * 1024, entries: 256 } as const;
const utf8 = new TextDecoder('utf-8', { fatal: true });
function hash(bytes: Buffer) { return createHash('sha256').update(bytes).digest('hex'); }
function validateAsset(asset: Asset, bytes: Buffer) {
  if (bytes.length !== asset.byteLength || hash(bytes) !== asset.sha256) throw new ProjectError(`Asset integrity check failed: ${asset.id}.`);
  const header = bytes.subarray(0, 16);
  const valid = {
    'image/png': () => header.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])),
    'image/jpeg': () => header[0] === 255 && header[1] === 216 && header[2] === 255,
    'image/webp': () => header.toString('ascii',0,4) === 'RIFF' && header.toString('ascii',8,12) === 'WEBP',
    'audio/mpeg': () => header.toString('ascii',0,3) === 'ID3' || (header[0] === 255 && ((header[1] ?? 0) & 0xe0) === 0xe0),
    'audio/wav': () => header.toString('ascii',0,4) === 'RIFF' && header.toString('ascii',8,12) === 'WAVE',
    'video/mp4': () => header.toString('ascii',4,8) === 'ftyp',
    'application/pdf': () => header.toString('ascii',0,5) === '%PDF-',
    'text/plain': () => { try { return !utf8.decode(bytes).includes('\0'); } catch { return false; } },
  }[asset.mediaType]();
  const suffixes: Record<Asset['mediaType'], string[]> = { 'image/png':['png'], 'image/jpeg':['jpg','jpeg'], 'image/webp':['webp'], 'audio/mpeg':['mp3'], 'audio/wav':['wav'], 'video/mp4':['mp4'], 'application/pdf':['pdf'], 'text/plain':['txt'] };
  if (!valid || !suffixes[asset.mediaType].includes(asset.fileName.split('.').at(-1)!.toLowerCase())) throw new ProjectError(`Asset type does not match its file: ${asset.id}.`);
}

export function validateProject(input: unknown): PortableProject {
  if (!input || typeof input !== 'object' || !('document' in input) || !('files' in input) || Object.keys(input).some(key => !['document','files'].includes(key))) throw new ProjectError('Expected a course document and asset files.');
  const document = parseCourse(input.document);
  if (typeof input.files !== 'object' || input.files === null || Array.isArray(input.files)) throw new ProjectError('Invalid asset file map.');
  const files = input.files as Record<string, unknown>;
  const expected = new Set(document.assets.map(assetPath));
  if (Object.keys(files).length !== expected.size || Object.keys(files).some(path => !expected.has(path))) throw new ProjectError('The package has missing or unexpected asset files.');
  let total = Buffer.byteLength(JSON.stringify(document));
  if (total > LIMITS.json) throw new ProjectError('The course document exceeds 2 MiB.');
  const output: Record<string,string> = {};
  for (const asset of document.assets) {
    const path = assetPath(asset);
    const encoded = files[path];
    if (typeof encoded !== 'string' || encoded.length > Math.ceil(LIMITS.entry / 3) * 4) throw new ProjectError(`Invalid asset encoding: ${asset.id}.`);
    const bytes = Buffer.from(encoded,'base64');
    if (bytes.toString('base64') !== encoded) throw new ProjectError(`Invalid asset encoding: ${asset.id}.`);
    validateAsset(asset,bytes);
    total += bytes.length;
    if (total > LIMITS.expanded) throw new ProjectError('The expanded project exceeds 64 MiB.');
    output[path] = encoded;
  }
  return { document, files: output };
}

export async function exportProject(input: unknown): Promise<Buffer> {
  const project = validateProject(input);
  const zip = new yazl.ZipFile();
  const options = { mtime: new Date('1980-01-01T00:00:00Z'), mode: 0o100644, compress: true };
  const json = Buffer.from(JSON.stringify(project.document,null,2) + '\n');
  if (json.length > LIMITS.json) throw new ProjectError('The formatted course document exceeds 2 MiB.');
  if (json.length + Object.values(project.files).reduce((size,data) => size + Buffer.byteLength(data,'base64'),0) > LIMITS.expanded) throw new ProjectError('The expanded project exceeds 64 MiB.');
  zip.addBuffer(json,'course.json',options);
  for (const path of Object.keys(project.files).sort()) zip.addBuffer(Buffer.from(project.files[path]!,'base64'),path,options);
  const chunks: Buffer[] = [];
  let size = 0;
  const output = new Promise<Buffer>((resolve,reject) => {
    zip.outputStream.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > LIMITS.archive) { (zip.outputStream as Readable).destroy(new ProjectError('The project archive exceeds 32 MiB.')); return; }
      chunks.push(chunk);
    });
    zip.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zip.outputStream.on('error',reject);
    zip.on('error',reject);
  });
  zip.end();
  return output;
}

export async function importProject(bytes: Buffer): Promise<PortableProject> {
  if (!bytes.length || bytes.length > LIMITS.archive) throw new ProjectError('Choose an OpenScroll archive no larger than 32 MiB.');
  const files = await new Promise<Map<string,Buffer>>((resolve,reject) => {
    yauzl.fromBuffer(bytes,{ lazyEntries:true, validateEntrySizes:true, strictFileNames:true },(error,zip) => {
      if (error || !zip) { reject(new ProjectError('The file is not a readable ZIP project.')); return; }
      const entries = new Map<string,Buffer>();
      let total = 0;
      let count = 0;
      let stopped = false;
      const fail = (message: string) => {
        if (stopped) return;
        stopped = true; zip.close(); reject(new ProjectError(message));
      };
      zip.on('error', () => fail('The ZIP project is corrupt or uses an unsupported archive feature.'));
      zip.on('end', () => { if (!stopped) { stopped=true; resolve(entries); } });
      zip.on('entry',(entry: yauzl.Entry) => {
        const path = entry.fileName;
        const allowed = path === 'course.json' || /^assets\/[a-z][a-z0-9-]{0,63}\.(png|jpg|webp|mp3|wav|mp4|pdf|txt)$/.test(path);
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if (!allowed || entries.has(path) || (mode !== 0 && mode !== 0o100000) || (entry.generalPurposeBitFlag & 1) || ![0,8].includes(entry.compressionMethod)) { fail('The archive contains an unsafe, duplicate, or unsupported entry.'); return; }
        count++;
        const limit = path === 'course.json' ? LIMITS.json : LIMITS.entry;
        if (count > LIMITS.entries || entry.uncompressedSize > limit || total + entry.uncompressedSize > LIMITS.expanded) { fail('The archive exceeds project entry or expanded-size limits.'); return; }
        zip.openReadStream(entry,(streamError,stream) => {
          if (streamError || !stream) { fail('An archive entry could not be read.'); return; }
          const chunks: Buffer[] = [];
          let size = 0;
          let checksum = 0;
          stream.on('data',(chunk: Buffer) => {
            size += chunk.length; total += chunk.length;
            if (size > limit || total > LIMITS.expanded) { stream.destroy(); fail('The archive exceeds expanded-size limits.'); return; }
            checksum = crc32(chunk,checksum);
            chunks.push(chunk);
          });
          stream.on('error', () => fail('An archive entry is corrupt.'));
          stream.on('end', () => {
            if (stopped) return;
            if (size !== entry.uncompressedSize || checksum !== entry.crc32) { fail('An archive entry failed its integrity check.'); return; }
            entries.set(path,Buffer.concat(chunks)); zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
  const json = files.get('course.json');
  if (!json) throw new ProjectError('The archive is missing course.json.');
  let document: unknown;
  try { document = JSON.parse(utf8.decode(json)); } catch { throw new ProjectError('course.json must contain valid UTF-8 JSON.'); }
  files.delete('course.json');
  return validateProject({ document, files: Object.fromEntries([...files].map(([path,data]) => [path,data.toString('base64')])) });
}
