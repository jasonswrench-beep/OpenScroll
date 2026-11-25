import { z } from 'zod';
import { isCanonicalRich, plainToRich, RICH_TEXT_MAX } from './rich-text.js';
import { safeLink } from './links.js';
export { safeLink };

export const SCHEMA_VERSION = 4;
export const FORMAT = 'openscroll';
export const idSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const text = z.string().max(100_000);
const label = z.string().max(300);
/** Schema 4 rich text: the canonical HTML subset from rich-text.ts. A single plain paragraph is already canonical. */
const rich = z.string().max(RICH_TEXT_MAX).refine(isCanonicalRich,{message:'Use supported formatting only: paragraphs, subheadings, lists, bold, italic and web links.'});
const narration = z.strictObject({ script: text, language: z.string().min(2).max(35), voice: z.string().max(100).optional(), speed: z.number().min(0.5).max(2) });
const appearance = z.strictObject({ width: z.enum(['reading', 'wide', 'full']), padding: z.enum(['small', 'medium', 'large']), background: z.enum(['page', 'surface', 'accent']) });
const base = { id: idSchema, appearance, narration: narration.optional(), requiredInteraction:z.boolean().optional() };
const imageContent = { assetId: idSchema, altText: z.string().max(2000), decorative: z.boolean(), caption: text };
const item = z.strictObject({title:label,text:rich});
const card = z.strictObject({title:label,text:rich});
const cue = z.strictObject({start:z.number().min(0).max(86400),end:z.number().min(0).max(86400),text:z.string().max(5000)}).refine(c=>c.end>c.start,{message:'Caption end must follow its start.'});
const link = z.string().max(2048).refine(value=>value==='' || safeLink(value),{message:'Use a complete HTTP or HTTPS address without embedded credentials.'});
export const blockSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('heading'), variant: z.enum(['heading', 'subheading']), content: z.strictObject({ text }) }),
  z.strictObject({ ...base, type: z.literal('paragraph'), variant: z.enum(['plain', 'with-heading']), content: z.strictObject({ text: rich, heading: label }) }),
  z.strictObject({ ...base, type: z.literal('list'), variant: z.enum(['bulleted', 'numbered', 'checklist']), content: z.strictObject({ items: z.array(rich).max(100) }) }),
  z.strictObject({ ...base, type: z.literal('statement'), variant: z.enum(['statement', 'note']), content: z.strictObject({ text: rich }) }),
  z.strictObject({ ...base, type: z.literal('quote'), variant: z.literal('plain'), content: z.strictObject({ text: rich, attribution: label }) }),
  z.strictObject({ ...base, type: z.literal('image'), variant: z.enum(['centered', 'full-width']), content: z.strictObject(imageContent) }),
  z.strictObject({ ...base, type: z.literal('image-text'), variant: z.enum(['image-left', 'image-right']), content: z.strictObject({ ...imageContent, heading: label, text: rich }) }),
  z.strictObject({ ...base, type: z.literal('divider'), variant: z.enum(['line', 'numbered']), content: z.strictObject({ label }) }),
  z.strictObject({ ...base, type: z.literal('spacer'), variant: z.enum(['small', 'medium', 'large']), content: z.strictObject({}) }),
  z.strictObject({...base,type:z.literal('gallery'),variant:z.literal('grid'),content:z.strictObject({items:z.array(z.strictObject(imageContent)).min(1).max(30)})}),
  z.strictObject({...base,type:z.literal('audio'),variant:z.literal('player'),content:z.strictObject({title:label,assetId:idSchema.nullable(),transcript:text})}),
  z.strictObject({...base,type:z.literal('video'),variant:z.literal('player'),content:z.strictObject({title:label,assetId:idSchema.nullable(),transcript:text,captionLanguage:z.string().min(2).max(35),captions:z.array(cue).max(500)})}),
  z.strictObject({...base,type:z.literal('attachment'),variant:z.literal('download'),content:z.strictObject({label,description:text,assetId:idSchema.nullable()})}),
  z.strictObject({...base,type:z.literal('button'),variant:z.literal('link'),content:z.strictObject({label,url:link})}),
  z.strictObject({...base,type:z.literal('accordion'),variant:z.literal('stacked'),content:z.strictObject({items:z.array(item).min(1).max(50)})}),
  z.strictObject({...base,type:z.literal('tabs'),variant:z.literal('horizontal'),content:z.strictObject({items:z.array(item).min(1).max(50)})}),
  z.strictObject({...base,type:z.literal('flashcards'),variant:z.literal('grid'),content:z.strictObject({cards:z.array(z.strictObject({front:rich,back:rich})).min(1).max(50)})}),
  z.strictObject({...base,type:z.literal('process'),variant:z.literal('steps'),content:z.strictObject({intro:card.nullable().default(null),items:z.array(item).min(1).max(50),summary:card.nullable().default(null)})}),
  z.strictObject({...base,type:z.literal('timeline'),variant:z.literal('vertical'),content:z.strictObject({items:z.array(z.strictObject({title:label,text:rich,date:label.default('')})).min(1).max(50)})}),
  z.strictObject({...base,type:z.literal('labeled-graphic'),variant:z.literal('markers'),content:z.strictObject({...imageContent,markers:z.array(z.strictObject({label,text:rich,x:z.number().min(0).max(100),y:z.number().min(0).max(100)})).min(1).max(30)})}),
  z.strictObject({...base,type:z.literal('assessment'),variant:z.enum(['single-choice','multiple-response','fill-blank','matching','ordering','categorize']),
    content:z.strictObject({prompt:rich,options:z.array(label).max(20),correct:z.array(z.number().int().min(0).max(19)).max(20),accepted:z.array(label).max(20),caseSensitive:z.boolean(),pairs:z.array(z.strictObject({left:label,right:label})).max(20),items:z.array(label).max(20),feedbackCorrect:rich,feedbackIncorrect:rich,
      feedbackMode:z.enum(['none','correct-incorrect','per-choice']).default('correct-incorrect'),choiceFeedback:z.array(rich).max(20).default([]),groups:z.array(label).max(10).default([]),placements:z.array(z.number().int().min(0).max(9)).max(20).default([])}),
    assessment:z.strictObject({graded:z.boolean(),points:z.number().int().min(1).max(100),required:z.boolean(),completion:z.enum(['submitted','correct']),maxAttempts:z.number().int().min(0).max(20)})}),
  z.strictObject({ ...base, type: z.literal('continue'), variant: z.literal('button'), content: z.strictObject({ label, hint: label.default('') }), completion: z.enum(['none', 'previous', 'all-previous']) }),
]);
export const assetSchema = z.strictObject({
  id: idSchema,
  fileName: z.string().min(1).max(180).regex(/^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$/),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/wav', 'video/mp4', 'application/pdf', 'text/plain']),
  byteLength: z.number().int().min(1).max(16 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const OBJECTIVE_LEVELS = ['remember','understand','apply','analyze','evaluate','create'] as const;
const bannerSchema = z.strictObject({ source: z.enum(['cover','image']), assetId: idSchema.nullable(), altText: z.string().max(2000), decorative: z.boolean() });
const objectiveSchema = z.strictObject({ id: idSchema, text: label, level: z.enum(OBJECTIVE_LEVELS).nullable() });
export const lessonSchema = z.strictObject({ id: idSchema, title: label, blocks: z.array(blockSchema).max(2000), banner: bannerSchema.nullable().default(null), objectives: z.array(objectiveSchema).max(30).default([]) });
export const courseSchema = z.strictObject({
  format: z.literal(FORMAT), schemaVersion: z.literal(SCHEMA_VERSION),
  course: z.strictObject({
    id: idSchema, title: label, description: rich, author: label,
    language: z.string().min(2).max(35), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
    cover: z.strictObject({ assetId: idSchema, altText: z.string().max(2000), decorative: z.boolean() }).nullable(),
    authorImage: z.strictObject({ assetId: idSchema }).nullable().default(null),
    theme: z.strictObject({ accentColor: z.string().regex(/^#[a-fA-F0-9]{6}$/), font: z.enum(['sans', 'serif']), pageWidth: z.enum(['standard', 'wide']),
      coverLayout: z.enum(['stacked','split-left','split-right','two-thirds-left','overlay','centered']).default('stacked'), lessonHeader: z.enum(['plain','image','accent']).default('plain'),
      fontPairing: z.enum(['lato-merriweather','worksans-sourceserif','figtree-literata','atkinson']).nullable().default(null) }),
    settings: z.strictObject({ navigation: z.enum(['free', 'sequential']), completion: z.literal('all-lessons'), passingScore: z.number().int().min(0).max(100) }),
    sections: z.array(z.strictObject({ id: idSchema, title: label, lessons: z.array(lessonSchema).max(200) })).max(100),
  }),
  assets: z.array(assetSchema).max(255),
});
export type CourseDocument = z.infer<typeof courseSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Block = z.infer<typeof blockSchema>;
export type Lesson = z.infer<typeof lessonSchema>;
export class ProjectError extends Error {
  constructor(message: string) { super(message); this.name = 'ProjectError'; }
}
const extensions: Record<Asset['mediaType'], string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4', 'application/pdf': 'pdf', 'text/plain': 'txt',
};
export function assetPath(asset: Asset) { return `assets/${asset.id}.${extensions[asset.mediaType]}`; }

// Loose JSON from an older file; fields are checked by the schema after migration.
type Loose = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
/**
 * Versions 1-3 stored plain text. Version 4 stores rich text in body fields, where a single plain paragraph is
 * already valid, so migration only escapes &, < and >, turns line breaks into paragraphs or <br>, and renames the
 * ordering question from 'sorting' to 'ordering'. It works on a copy; the original file is never changed.
 */
export function migrateToCurrent(input: Loose): Loose {
  const doc = structuredClone(input);
  const rich = (value: unknown) => typeof value === 'string' ? plainToRich(value) : value;
  const course = doc.course;
  if (course && typeof course === 'object') {
    course.description = rich(course.description);
    for (const section of Array.isArray(course.sections) ? course.sections : []) for (const lesson of Array.isArray(section?.lessons) ? section.lessons : []) for (const block of Array.isArray(lesson?.blocks) ? lesson.blocks : []) {
      const content = block?.content;
      if (!content || typeof content !== 'object') continue;
      switch (block.type) {
        case 'paragraph': case 'statement': case 'quote': case 'image-text': content.text = rich(content.text); break;
        case 'list': if (Array.isArray(content.items)) content.items = content.items.map(rich); break;
        case 'accordion': case 'tabs': case 'process': case 'timeline': for (const item of Array.isArray(content.items) ? content.items : []) if (item && typeof item === 'object') item.text = rich(item.text); break;
        case 'flashcards': for (const card of Array.isArray(content.cards) ? content.cards : []) if (card && typeof card === 'object') { card.front = rich(card.front); card.back = rich(card.back); } break;
        case 'labeled-graphic': for (const marker of Array.isArray(content.markers) ? content.markers : []) if (marker && typeof marker === 'object') marker.text = rich(marker.text); break;
        case 'assessment':
          content.prompt = rich(content.prompt); content.feedbackCorrect = rich(content.feedbackCorrect); content.feedbackIncorrect = rich(content.feedbackIncorrect);
          if (block.variant === 'sorting') block.variant = 'ordering';
          break;
      }
    }
  }
  doc.schemaVersion = SCHEMA_VERSION;
  return doc;
}
/** Older versions migrate by copying; original archives and stored rows remain untouched until explicit save. */
export function parseCourse(input: unknown): CourseDocument {
  if (input === null || typeof input !== 'object' || !('schemaVersion' in input)) throw new ProjectError('The course is missing its schema version.');
  if (![1,2,3,SCHEMA_VERSION].includes(input.schemaVersion as number)) throw new ProjectError(`Unsupported project version ${String(input.schemaVersion).slice(0,30)}. This release supports versions 1 to 4. The original file has not been changed.`);
  const version = input.schemaVersion as number;
  const migrated=version!==SCHEMA_VERSION ? migrateToCurrent(input as Loose) : input;
  const result = courseSchema.safeParse(migrated);
  if (!result.success) {
    const issue = result.error.issues[0]!;
    throw new ProjectError(`Invalid course at ${issue.path.join('.') || 'document'}: ${issue.message}`);
  }
  const doc = result.data;
  const ids = new Set<string>();
  const claim = (id: string) => {
    if (ids.has(id)) throw new ProjectError(`Duplicate identifier: ${id}.`);
    ids.add(id);
  };
  claim(doc.course.id);
  for (const asset of doc.assets) claim(asset.id);
  const assets = new Map(doc.assets.map(asset => [asset.id, asset]));
  const checkImage = (assetId: string) => {
    if (!assets.get(assetId)?.mediaType.startsWith('image/')) throw new ProjectError(`Missing or incompatible image asset: ${assetId}.`);
  };
  if (doc.course.cover) checkImage(doc.course.cover.assetId);
  if (doc.course.authorImage) checkImage(doc.course.authorImage.assetId);
  let blockCount = 0;
  let lessonCount = 0;
  for (const section of doc.course.sections) {
    claim(section.id);
    for (const lesson of section.lessons) {
      claim(lesson.id); lessonCount++;
      if (lesson.banner) {
        if (lesson.banner.source === 'image') { if (!lesson.banner.assetId) throw new ProjectError('A lesson banner image is missing.'); checkImage(lesson.banner.assetId); }
        else if (lesson.banner.assetId !== null) throw new ProjectError('A lesson banner that uses the course cover cannot name another image.');
      }
      for (const objective of lesson.objectives) claim(objective.id);
      for (const block of lesson.blocks) {
        claim(block.id); blockCount++;
        if(version===1 && !['heading','paragraph','list','statement','quote','image','image-text','divider','spacer','continue'].includes(block.type))throw new ProjectError('Version 1 does not support this block type. Use a version 2 project.');
        if(version<3 && (block.type==='assessment' || block.requiredInteraction!==undefined))throw new ProjectError('Assessment and interaction requirements need a version 3 project.');
        if(block.requiredInteraction && !['accordion','tabs','flashcards','process','labeled-graphic'].includes(block.type))throw new ProjectError('This block does not support required item exploration.');
        if(block.type==='assessment' && (new Set(block.content.correct).size!==block.content.correct.length || block.content.correct.some(i=>i>=block.content.options.length)))throw new ProjectError('Assessment answer references must be unique and match existing choices.');
        if(block.type==='assessment' && block.content.choiceFeedback.length>block.content.options.length)throw new ProjectError('Choice feedback must match existing choices.');
        if(block.type==='assessment' && (block.content.placements.length>block.content.items.length || block.content.placements.some(i=>i>=Math.max(1,block.content.groups.length))))throw new ProjectError('Sorting placements must match existing cards and groups.');
        if (block.type === 'image' || block.type === 'image-text' || block.type==='labeled-graphic') checkImage(block.content.assetId);
        if(block.type==='gallery')for(const image of block.content.items)checkImage(image.assetId);
        if(['audio','video','attachment'].includes(block.type)){
          const media=block as Extract<Block,{type:'audio'|'video'|'attachment'}>;
          if(media.content.assetId){const type=assets.get(media.content.assetId)?.mediaType;const accepted=media.type==='audio' ? ['audio/mpeg','audio/wav'] : media.type==='video' ? ['video/mp4'] : ['application/pdf','text/plain'];if(!type || !accepted.includes(type))throw new ProjectError(`Missing or incompatible media asset: ${media.content.assetId}.`);}
        }
      }
    }
  }
  if (lessonCount > 500 || blockCount > 5000) throw new ProjectError('The project exceeds 500 lessons or 5,000 blocks.');
  return doc;
}

export interface PortableProject { document: CourseDocument; files: Record<string, string>; }
