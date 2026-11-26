/**
 * Import a Rise 360 web export ("raw" ZIP) as an editable OpenScroll project.
 *
 * A Rise web export stores the course in content/runtime-data.js as base64 JSON inside __jsonp("runtime-data.js", "…")
 * and its media in content/assets/. Only those entries are read; the Rise player code is skipped unopened. Every block
 * is mapped or listed in the report, so nothing is dropped silently, and the result passes the same validation as any
 * uploaded .openscroll project.
 */
import { createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import yauzl from 'yauzl';
import { ProjectError, SCHEMA_VERSION, assetPath, type Asset, type PortableProject } from '../shared/course.js';
import { sanitizeRich, richToPlain, richIsEmpty } from '../shared/rich-text.js';
import { validateProject, LIMITS } from './archive.js';
import { riseUploadBytes, sizeLabel } from '../shared/limits.js';
import { instanceSizeLimits } from '../server/config.js';

export const RISE_LIMITS = { get upload() { return riseUploadBytes(instanceSizeLimits()); }, runtime: 16 * 1024 * 1024, entries: 4000 };
export type RiseResult = 'exact' | 'adjusted' | 'review';
export interface RiseRow { rise: string; openscroll: string; count: number; result: RiseResult; note?: string }
export interface RiseReport {
  title: string;
  lessons: number;
  sourceBlocks: number;
  importedBlocks: number;
  rows: RiseRow[];
  review: { lesson: number; block: number; message: string }[];
  notImported: { lesson: number; block: number; rise: string }[];
  assets: { count: number; bytes: number };
}
// Rise JSON is untrusted and loosely typed; every value read from it is checked before use.
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

/* ---------- reading the ZIP ---------- */
function safeAssetName(path: string) {
  const match = /^content\/assets\/([^/\\\0]{1,200})$/.exec(path);
  return match && match[1] !== '.' && match[1] !== '..' ? match[1] : undefined;
}
async function readRiseZip(bytes: Buffer): Promise<{ runtime: string; assets: Map<string, Buffer> }> {
  if (!bytes.length || bytes.length > RISE_LIMITS.upload) throw new ProjectError(`Choose a Rise web export ZIP no larger than ${sizeLabel(RISE_LIMITS.upload)}.`);
  const assets = new Map<string, Buffer>();
  let runtime: Buffer | undefined;
  await new Promise<void>((resolve, reject) => {
    yauzl.fromBuffer(bytes, { lazyEntries: true, validateEntrySizes: true, strictFileNames: false }, (error, zip) => {
      if (error || !zip) { reject(new ProjectError('The file is not a readable ZIP.')); return; }
      let stopped = false, count = 0, total = 0;
      const fail = (message: string) => { if (stopped) return; stopped = true; zip.close(); reject(new ProjectError(message)); };
      zip.on('error', () => fail('The ZIP is corrupt or uses an unsupported archive feature.'));
      zip.on('end', () => { if (!stopped) { stopped = true; resolve(); } });
      zip.on('entry', (entry: yauzl.Entry) => {
        if (++count > RISE_LIMITS.entries) { fail('The ZIP has too many entries for a Rise export.'); return; }
        const path = entry.fileName;
        if (path.includes('\0') || path.includes('\\') || path.startsWith('/') || path.split('/').includes('..')) { fail('The ZIP contains an unsafe path.'); return; }
        const asset = safeAssetName(path);
        const wanted = path === 'content/runtime-data.js' || !!asset;
        if (!wanted || path.endsWith('/')) { zip.readEntry(); return; }
        const mode = (entry.externalFileAttributes >>> 16) & 0o170000;
        if ((mode !== 0 && mode !== 0o100000) || (entry.generalPurposeBitFlag & 1) || ![0, 8].includes(entry.compressionMethod)) { fail('The ZIP contains an unsupported or encrypted entry.'); return; }
        const limit = asset ? LIMITS.entry : RISE_LIMITS.runtime;
        if (entry.uncompressedSize > limit || total + entry.uncompressedSize > LIMITS.expanded) { fail(asset ? `The file ${asset.slice(0, 80)} is larger than this server's ${sizeLabel(LIMITS.entry)} limit for one file.` : 'The course data is too large.'); return; }
        zip.openReadStream(entry, (streamError, stream) => {
          if (streamError || !stream) { fail('A ZIP entry could not be read.'); return; }
          const chunks: Buffer[] = []; let size = 0, checksum = 0;
          stream.on('data', (chunk: Buffer) => {
            size += chunk.length; total += chunk.length;
            if (size > limit || total > LIMITS.expanded) { stream.destroy(); fail('The export is larger than OpenScroll can import.'); return; }
            checksum = crc32(chunk, checksum); chunks.push(chunk);
          });
          stream.on('error', () => fail('A ZIP entry is corrupt.'));
          stream.on('end', () => {
            if (stopped) return;
            if (size !== entry.uncompressedSize || checksum !== entry.crc32) { fail('A ZIP entry failed its integrity check.'); return; }
            if (asset) assets.set(asset, Buffer.concat(chunks)); else runtime = Buffer.concat(chunks);
            zip.readEntry();
          });
        });
      });
      zip.readEntry();
    });
  });
  if (!runtime) throw new ProjectError('This ZIP is not a Rise web export: content/runtime-data.js is missing. In Rise, choose Publish, then Web.');
  return { runtime: runtime.toString('utf8'), assets };
}
export function decodeRuntimeData(source: string): Loose {
  const match = /__jsonp\(\s*["']runtime-data\.js["']\s*,\s*["']([A-Za-z0-9+/=\s]+)["']\s*\)/.exec(source);
  if (!match) throw new ProjectError('The Rise course data could not be found in runtime-data.js.');
  let data: unknown;
  try { data = JSON.parse(Buffer.from(match[1]!.replace(/\s+/g, ''), 'base64').toString('utf8')); } catch { throw new ProjectError('The Rise course data is not readable.'); }
  if (!data || typeof data !== 'object' || !('course' in data) || typeof (data as Loose).course !== 'object') throw new ProjectError('The Rise course data has an unexpected shape.');
  return data as Loose;
}

/* ---------- helpers ---------- */
const str = (value: unknown) => typeof value === 'string' ? value : '';
const plain = (html: unknown, max = 300) => richToPlain(sanitizeRich(str(html))).replace(/\s+/g, ' ').trim().slice(0, max);
const rich = (html: unknown) => sanitizeRich(str(html));
const appearance = { width: 'reading', padding: 'medium', background: 'page' } as const;
function detectType(bytes: Buffer): Asset['mediaType'] | undefined {
  const h = bytes.subarray(0, 16);
  if (h.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (h[0] === 255 && h[1] === 216 && h[2] === 255) return 'image/jpeg';
  if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (h.toString('ascii', 0, 4) === 'RIFF' && h.toString('ascii', 8, 12) === 'WAVE') return 'audio/wav';
  if (h.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  if (h.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (h.toString('ascii', 0, 3) === 'ID3' || (h[0] === 255 && ((h[1] ?? 0) & 0xe0) === 0xe0)) return 'audio/mpeg';
  return undefined;
}
const EXTENSION: Record<Asset['mediaType'], string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4', 'application/pdf': 'pdf', 'text/plain': 'txt' };
function cleanFileName(name: string, type: Asset['mediaType']) {
  const base = name.replace(/\.[A-Za-z0-9]{1,5}$/, '').replace(/[^A-Za-z0-9 ._-]+/g, '-').replace(/^[^A-Za-z0-9]+/, '').slice(0, 160) || 'file';
  return `${base}.${EXTENSION[type]}`;
}
const LABEL: Record<string, [string, string, RiseResult, string?]> = {
  'text/heading paragraph': ['Text · Paragraph with heading', 'Paragraph with heading', 'exact'],
  'text/paragraph': ['Text · Paragraph', 'Paragraph', 'exact'],
  'text/heading': ['Text · Heading', 'Heading', 'exact'],
  'text/subheading': ['Text · Subheading', 'Subheading', 'exact'],
  'text/statement': ['Statement', 'Statement', 'adjusted', 'Same words; OpenScroll’s statement style replaces the Rise style.'],
  'text/note': ['Statement · Note', 'Note', 'exact'],
  'text/note-from-b': ['Statement B', 'Note', 'adjusted', 'Same words; OpenScroll’s Note style replaces Statement B.'],
  'quote': ['Quote', 'Quote', 'exact'],
  'list': ['List', 'List', 'exact'],
  'image': ['Image', 'Image', 'review', 'Rise exports carry no alternative text. Describe each image or mark it decorative.'],
  'image-text': ['Image and text', 'Image and text', 'review', 'Rise exports carry no alternative text.'],
  'accordion': ['Interactive · Accordion', 'Accordion', 'exact'],
  'tabs': ['Interactive · Tabs', 'Tabs', 'exact'],
  'process': ['Interactive · Process', 'Process', 'exact', 'Introduction and summary cards are kept.'],
  'flashcards': ['Interactive · Flashcards', 'Flashcards', 'exact'],
  'timeline': ['Interactive · Timeline', 'Timeline', 'exact', 'Date labels are kept.'],
  'categorize': ['Interactive · Sorting activity', 'Sort into groups', 'adjusted', 'Groups and correct placements are kept. Learners choose a group from a list instead of dragging.'],
  'question': ['Knowledge check', 'Question (practice)', 'exact', 'Choices, correct answers, and every feedback message are kept.'],
  'continue': ['Divider · Continue', 'Continue', 'exact', 'Button label and completion message are kept.'],
  'divider': ['Divider', 'Divider', 'exact'],
  'spacer': ['Divider · Spacer', 'Spacer', 'exact'],
  'attachment': ['Multimedia · Attachment', 'Attachment', 'review', 'Add a short description of each file.'],
  'audio': ['Multimedia · Audio', 'Audio', 'review', 'Add a transcript before publishing.'],
  'video': ['Multimedia · Video', 'Video', 'review', 'Add captions and a transcript before publishing.'],
};

/* ---------- conversion ---------- */
export async function importRiseExport(bytes: Buffer): Promise<{ project: PortableProject; report: RiseReport }> {
  const { runtime, assets: files } = await readRiseZip(bytes);
  const data = decodeRuntimeData(runtime);
  const rise = data.course as Loose;
  const used = new Set<string>();
  const id = (prefix: string, source: unknown) => {
    const digest = createHash('sha256').update(String(source ?? Math.random())).digest('hex');
    let value = `${prefix}-${digest.slice(0, 12)}`, n = 1;
    while (used.has(value)) value = `${prefix}-${digest.slice(0, 12)}-${++n}`;
    used.add(value); return value;
  };
  const assets: Asset[] = [], projectFiles: Record<string, string> = {}, byHash = new Map<string, string>();
  let assetBytes = 0;
  const addAsset = (name: string, accepted: (type: Asset['mediaType']) => boolean): string | undefined => {
    const decoded = (() => { try { return decodeURIComponent(name); } catch { return name; } })();
    const bytes = files.get(decoded) ?? files.get(name);
    if (!bytes || !bytes.length) return undefined;
    const type = detectType(bytes);
    if (!type || !accepted(type)) return undefined;
    const sha256 = createHash('sha256').update(bytes).digest('hex');
    const existing = byHash.get(sha256);
    if (existing) return existing;
    if (assets.length >= 255) throw new ProjectError('This course has more than 255 media files, more than one OpenScroll project can hold.');
    const asset: Asset = { id: id('asset', sha256), fileName: cleanFileName(decoded.split('/').pop()!, type), mediaType: type, byteLength: bytes.length, sha256 };
    assets.push(asset); projectFiles[assetPath(asset)] = bytes.toString('base64'); byHash.set(sha256, asset.id); assetBytes += bytes.length;
    return asset.id;
  };
  const isImage = (t: Asset['mediaType']) => t.startsWith('image/');
  const imageKey = (media: Loose | undefined) => { const image = media?.image as Loose | undefined; return str(image?.crushedKey) || str(image?.key).split('/').pop() || str(image?.originalUrl); };

  const counts = new Map<string, number>();
  const report: RiseReport = { title: str(rise.title), lessons: 0, sourceBlocks: 0, importedBlocks: 0, rows: [], review: [], notImported: [], assets: { count: 0, bytes: 0 } };
  const count = (key: string) => counts.set(key, (counts.get(key) ?? 0) + 1);

  // Blocks are built loosely and checked by validateProject below, which applies the full schema.
  const convert = (item: Loose, lessonIndex: number, blockIndex: number): Loose[] => {
    const type = str(item.type), variant = str(item.variant), entries: Loose[] = Array.isArray(item.items) ? item.items : [];
    const first = entries[0] ?? {};
    const base = { id: id('block', item.id), appearance: { ...appearance } };
    const review = (message: string) => report.review.push({ lesson: lessonIndex + 1, block: blockIndex + 1, message });
    if (type === 'text') {
      if (variant === 'heading paragraph') { count('text/heading paragraph'); return [{ ...base, type: 'paragraph', variant: 'with-heading', content: { heading: plain(first.heading), text: rich(first.paragraph) } }]; }
      if (variant === 'paragraph') { count('text/paragraph'); return [{ ...base, type: 'paragraph', variant: 'plain', content: { heading: '', text: rich(first.paragraph) } }]; }
      if (variant === 'heading' || variant === 'subheading') { count(`text/${variant}`); return [{ ...base, type: 'heading', variant: variant === 'heading' ? 'heading' : 'subheading', content: { text: plain(first.heading ?? first.paragraph, 100000) } }]; }
      if (variant === 'note' || variant === 'b') { count(variant === 'note' ? 'text/note' : 'text/note-from-b'); return [{ ...base, type: 'statement', variant: 'note', content: { text: rich(first.paragraph) } }]; }
      if (['a', 'c', 'd'].includes(variant)) { count('text/statement'); return [{ ...base, type: 'statement', variant: 'statement', content: { text: rich(first.paragraph) } }]; }
    }
    if (type === 'quote') { count('quote'); return [{ ...base, type: 'quote', variant: 'plain', content: { text: rich(first.paragraph ?? first.quote), attribution: plain(first.name ?? first.attribution) } }]; }
    if (type === 'list') {
      count('list');
      const listVariant = variant === 'numbered' ? 'numbered' : variant.includes('check') ? 'checklist' : 'bulleted';
      return [{ ...base, type: 'list', variant: listVariant, content: { items: entries.slice(0, 100).map(e => rich(e.paragraph)) } }];
    }
    if (type === 'image') {
      const assetId = addAsset(imageKey(first.media), isImage);
      if (!assetId) return [];
      const caption = plain(first.caption, 100000);
      if (variant === 'text aside' || variant === 'text-aside') { count('image-text'); review('Describe this image for screen reader users, or mark it decorative.'); return [{ ...base, type: 'image-text', variant: 'image-left', content: { assetId, altText: '', decorative: false, caption: '', heading: '', text: rich(first.paragraph ?? first.caption) } }]; }
      count('image'); review('Describe this image for screen reader users, or mark it decorative.');
      return [{ ...base, type: 'image', variant: variant === 'full' || variant === 'full width' ? 'full-width' : 'centered', content: { assetId, altText: '', decorative: false, caption } }];
    }
    if (type === 'interactive' && (variant === 'accordion' || variant === 'tabs')) {
      count(variant);
      return [{ ...base, type: variant, variant: variant === 'accordion' ? 'stacked' : 'horizontal', content: { items: entries.slice(0, 50).map(e => ({ title: plain(e.title), text: rich(e.description) })) } }];
    }
    if (type === 'interactive' && variant === 'process') {
      count('process');
      const card = (kind: string) => { const e = entries.find(x => x.type === kind); return e ? { title: plain(e.title), text: rich(e.description) } : null; };
      const steps = entries.filter(e => e.type !== 'intro' && e.type !== 'summary').slice(0, 50).map(e => ({ title: plain(e.title), text: rich(e.description) }));
      return steps.length ? [{ ...base, type: 'process', variant: 'steps', content: { intro: card('intro'), items: steps, summary: card('summary') } }] : [];
    }
    if (type === 'interactive' && variant === 'flashcard') {
      count('flashcards');
      const side = (s: Loose | undefined) => { if (s?.type !== 'description' && s?.media) review('A flashcard side used an image; only its text was imported.'); return rich(s?.description); };
      return [{ ...base, type: 'flashcards', variant: 'grid', content: { cards: entries.slice(0, 50).map(e => ({ front: side(e.front), back: side(e.back) })) } }];
    }
    if (type === 'interactive' && variant === 'timeline') {
      count('timeline');
      return [{ ...base, type: 'timeline', variant: 'vertical', content: { items: entries.slice(0, 50).map(e => ({ date: plain(e.date), title: plain(e.title), text: rich(e.description) })) } }];
    }
    if (type === 'interactive' && variant === 'sorting') {
      count('categorize');
      const piles: Loose[] = Array.isArray(item.piles) ? item.piles : [];
      const groups = piles.slice(0, 10).map(p => plain(p.title));
      const cards = entries.filter(e => piles.findIndex(p => p.id === e.pileId) >= 0 && piles.findIndex(p => p.id === e.pileId) < 10).slice(0, 20);
      if (entries.length > cards.length) review('Only the first 20 cards and 10 groups of this sorting activity were imported.');
      return [{ ...base, type: 'assessment', variant: 'categorize', content: { prompt: 'Sort each card into the group where it belongs.', options: [], correct: [], accepted: [], caseSensitive: false, pairs: [], items: cards.map(c => plain(c.title)), feedbackCorrect: 'All cards are in the right groups.', feedbackIncorrect: 'Some cards are in the wrong group. Look again at the ones marked wrong.', feedbackMode: 'correct-incorrect', choiceFeedback: [], groups, placements: cards.map(c => piles.findIndex(p => p.id === c.pileId)) }, assessment: { graded: false, points: 1, required: false, completion: 'correct', maxAttempts: 0 } }];
    }
    if (type === 'knowledgeCheck' && ['MULTIPLE_CHOICE', 'MULTIPLE_RESPONSE'].includes(str(first.type))) {
      count('question');
      const answers: Loose[] = (Array.isArray(first.answers) ? first.answers : []).slice(0, 20);
      const mode = str(first.feedbackType) === 'CHOICE' ? 'per-choice' : str(first.feedbackType) === 'CORRECT_INCORRECT' ? 'correct-incorrect' : str(first.feedbackType) === 'NONE' ? 'none' : 'correct-incorrect';
      const single = str(first.type) === 'MULTIPLE_CHOICE';
      const correct = answers.map((a, i) => a.correct ? i : -1).filter(i => i >= 0);
      const general = str(first.feedbackType) === 'ANY' || str(first.feedbackType) === 'ONE' ? rich(first.feedback ?? first.feedbackCorrect) : '';
      return [{ ...base, type: 'assessment', variant: single ? 'single-choice' : 'multiple-response', content: { prompt: rich(first.title), options: answers.map(a => plain(a.title)), correct: single ? correct.slice(0, 1) : correct, accepted: [], caseSensitive: false, pairs: [], items: [], feedbackCorrect: general || rich(first.feedbackCorrect), feedbackIncorrect: general || rich(first.feedbackIncorrect), feedbackMode: mode, choiceFeedback: mode === 'per-choice' ? answers.map(a => rich(a.feedback)) : [], groups: [], placements: [] }, assessment: { graded: false, points: 1, required: false, completion: 'submitted', maxAttempts: 0 } }];
    }
    if (type === 'divider' && variant === 'continue') { count('continue'); return [{ ...base, type: 'continue', variant: 'button', content: { label: plain(first.title) || 'Continue', hint: plain(first.completeHint) }, completion: 'none' }]; }
    if (type === 'divider' && (variant === 'divider' || variant === 'numbered divider')) { count('divider'); return [{ ...base, type: 'divider', variant: variant === 'divider' ? 'line' : 'numbered', content: { label: plain(first.title ?? first.number) } }]; }
    if (type === 'divider' && variant === 'spacer') { count('spacer'); return [{ ...base, type: 'spacer', variant: 'medium', content: {} }]; }
    if (type === 'multimedia' && variant === 'attachment') {
      const attachment = first.media?.attachment as Loose | undefined;
      const assetId = addAsset(str(attachment?.key) || str(attachment?.originalUrl), t => t === 'application/pdf');
      if (!assetId) { review('This attachment is not a PDF, so it was not imported. Attach it again as a PDF.'); return []; }
      count('attachment'); review('Add a short description of this file so learners know what it contains.');
      return [{ ...base, type: 'attachment', variant: 'download', content: { label: plain(attachment?.originalUrl).replace(/\.pdf$/i, '') || 'Download', description: '', assetId } }];
    }
    if (type === 'multimedia' && (variant === 'audio' || variant === 'video')) {
      const media = first.media?.[variant] as Loose | undefined;
      const assetId = addAsset(str(media?.key).split('/').pop() || str(media?.originalUrl), t => variant === 'audio' ? t === 'audio/mpeg' || t === 'audio/wav' : t === 'video/mp4');
      if (!assetId) return [];
      count(variant); review(variant === 'audio' ? 'Add a transcript to this audio.' : 'Add captions and a transcript to this video.');
      return [variant === 'audio' ? { ...base, type: 'audio', variant: 'player', content: { title: plain(first.title) || 'Audio', assetId, transcript: '' } } : { ...base, type: 'video', variant: 'player', content: { title: plain(first.title) || 'Video', assetId, transcript: '', captionLanguage: 'en', captions: [] } }];
    }
    return [];
  };

  const sections: { id: string; title: string; lessons: Loose[] }[] = [];
  const lessons: Loose[] = Array.isArray(rise.lessons) ? rise.lessons : [];
  let section: { id: string; title: string; lessons: Loose[] } = { id: id('section', 'first'), title: '', lessons: [] };
  sections.push(section);
  const coverId = addAsset(imageKey(rise.coverImage?.media as Loose | undefined), isImage);
  lessons.forEach((lesson, lessonIndex) => {
    if (str(lesson.type) === 'section') {
      section = { id: id('section', lesson.id), title: plain(lesson.title), lessons: [] };
      sections.push(section); return;
    }
    const items: Loose[] = Array.isArray(lesson.items) ? lesson.items : [];
    report.lessons++;
    const blocks: Loose[] = [];
    items.forEach((item, blockIndex) => {
      report.sourceBlocks++;
      const converted = convert(item ?? {}, report.lessons - 1, blockIndex);
      if (!converted.length) report.notImported.push({ lesson: report.lessons, block: blockIndex + 1, rise: `${str(item?.type) || 'unknown'} · ${str(item?.variant) || 'unknown'}` });
      blocks.push(...converted);
    });
    if (str(lesson.type) !== 'blocks' && !items.length) report.notImported.push({ lesson: report.lessons, block: 0, rise: `${str(lesson.type) || 'unknown'} lesson` });
    report.importedBlocks += blocks.length;
    section.lessons.push({ id: id('lesson', lesson.id ?? lessonIndex), title: plain(lesson.title), blocks: blocks.slice(0, 2000), banner: coverId ? { source: 'cover', assetId: null, altText: '', decorative: true } : null, objectives: [] });
  });
  const author = (Array.isArray(rise.authors) ? rise.authors : [])[0] as Loose | undefined;
  const authorImage = author ? addAsset(str(author.avatar), isImage) : undefined;
  const theme = (rise.theme ?? {}) as Loose;
  const accent = /^#[0-9a-fA-F]{6}$/.test(str(theme.colorAccent)) ? str(theme.colorAccent).toLowerCase() : /^#[0-9a-fA-F]{6}$/.test(str(rise.color)) ? str(rise.color).toLowerCase() : '#193c35';
  const layouts: Record<string, 'split-left' | 'split-right' | 'two-thirds-left' | 'overlay' | 'centered'> = { SPLIT_LEFT_IMAGE: 'split-left', SPLIT_RIGHT_IMAGE: 'split-right', TWO_THIRDS_LEFT_IMAGE: 'two-thirds-left', TWO_THIRDS_RIGHT_IMAGE: 'split-right', CENTERED_OVERLAY: 'overlay', LEFT_OVERLAY: 'overlay', CENTERED: 'centered', LEFT: 'centered' };
  const heading = str(rise.headingTypeface).toLowerCase(), body = str(rise.bodyTypeface).toLowerCase();
  const time = new Date().toISOString();
  const document = {
    format: 'openscroll', schemaVersion: SCHEMA_VERSION,
    course: {
      id: id('course', rise.id), title: plain(rise.title) || 'Imported Rise course', description: rich(rise.description), author: plain(author?.authorName),
      language: 'en', createdAt: time, updatedAt: time,
      cover: coverId ? { assetId: coverId, altText: '', decorative: true } : null,
      authorImage: authorImage ? { assetId: authorImage } : null,
      theme: { accentColor: accent, font: /merriweather|serif|lora|georgia|playfair|libre baskerville/.test(body) ? 'serif' : 'sans', pageWidth: 'standard', coverLayout: layouts[str(theme.coverPageType)] ?? 'stacked', lessonHeader: coverId ? 'image' : 'plain', fontPairing: heading === 'lato' && body === 'merriweather' ? 'lato-merriweather' : null },
      settings: { navigation: theme.navigationRestricted === true ? 'sequential' : 'free', completion: 'all-lessons', passingScore: 80 },
      sections: sections.filter((s, i) => s.lessons.length || i > 0),
    },
    assets,
  };
  if (!document.course.sections.length) document.course.sections = [{ id: id('section', 'empty'), title: '', lessons: [] }];
  const project = validateProject({ document, files: projectFiles });
  report.assets = { count: assets.length, bytes: assetBytes };
  for (const [key, value] of counts) { const [from, to, result, note] = LABEL[key] ?? [key, key, 'review']; report.rows.push({ rise: from, openscroll: to, count: value, result, ...(note ? { note } : {}) }); }
  report.rows.sort((a, b) => b.count - a.count);
  if (coverId) report.rows.push({ rise: 'Cover image and theme', openscroll: 'Cover, accent color, fonts, cover layout', count: 1, result: 'adjusted', note: 'Each lesson shows the cover as a banner, marked decorative like the cover. Describe it if it carries information.' });
  if (richIsEmpty(document.course.description)) report.review.push({ lesson: 0, block: 0, message: 'The course has no description.' });
  return { project, report };
}
