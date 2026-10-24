import { z } from 'zod';

export const SCHEMA_VERSION = 3;
export const FORMAT = 'openscroll';
export const idSchema = z.string().regex(/^[a-z][a-z0-9-]{0,63}$/);
const text = z.string().max(100_000);
const label = z.string().max(300);
const narration = z.strictObject({ script: text, language: z.string().min(2).max(35), voice: z.string().max(100).optional(), speed: z.number().min(0.5).max(2) });
const appearance = z.strictObject({ width: z.enum(['reading', 'wide', 'full']), padding: z.enum(['small', 'medium', 'large']), background: z.enum(['page', 'surface', 'accent']) });
const base = { id: idSchema, appearance, narration: narration.optional(), requiredInteraction:z.boolean().optional() };
const imageContent = { assetId: idSchema, altText: z.string().max(2000), decorative: z.boolean(), caption: text };
const item = z.strictObject({title:label,text});
const cue = z.strictObject({start:z.number().min(0).max(86400),end:z.number().min(0).max(86400),text:z.string().max(5000)}).refine(c=>c.end>c.start,{message:'Caption end must follow its start.'});
export function safeLink(value:string){try{const url=new URL(value);return ['https:','http:'].includes(url.protocol) && !url.username && !url.password;}catch{return false;}}
const link = z.string().max(2048).refine(value=>value==='' || safeLink(value),{message:'Use a complete HTTP or HTTPS address without embedded credentials.'});
export const blockSchema = z.discriminatedUnion('type', [
  z.strictObject({ ...base, type: z.literal('heading'), variant: z.enum(['heading', 'subheading']), content: z.strictObject({ text }) }),
  z.strictObject({ ...base, type: z.literal('paragraph'), variant: z.enum(['plain', 'with-heading']), content: z.strictObject({ text, heading: label }) }),
  z.strictObject({ ...base, type: z.literal('list'), variant: z.enum(['bulleted', 'numbered', 'checklist']), content: z.strictObject({ items: z.array(text).max(100) }) }),
  z.strictObject({ ...base, type: z.literal('statement'), variant: z.enum(['statement', 'note']), content: z.strictObject({ text }) }),
  z.strictObject({ ...base, type: z.literal('quote'), variant: z.literal('plain'), content: z.strictObject({ text, attribution: label }) }),
  z.strictObject({ ...base, type: z.literal('image'), variant: z.enum(['centered', 'full-width']), content: z.strictObject(imageContent) }),
  z.strictObject({ ...base, type: z.literal('image-text'), variant: z.enum(['image-left', 'image-right']), content: z.strictObject({ ...imageContent, heading: label, text }) }),
  z.strictObject({ ...base, type: z.literal('divider'), variant: z.enum(['line', 'numbered']), content: z.strictObject({ label }) }),
  z.strictObject({ ...base, type: z.literal('spacer'), variant: z.enum(['small', 'medium', 'large']), content: z.strictObject({}) }),
  z.strictObject({...base,type:z.literal('gallery'),variant:z.literal('grid'),content:z.strictObject({items:z.array(z.strictObject(imageContent)).min(1).max(30)})}),
  z.strictObject({...base,type:z.literal('audio'),variant:z.literal('player'),content:z.strictObject({title:label,assetId:idSchema.nullable(),transcript:text})}),
  z.strictObject({...base,type:z.literal('video'),variant:z.literal('player'),content:z.strictObject({title:label,assetId:idSchema.nullable(),transcript:text,captionLanguage:z.string().min(2).max(35),captions:z.array(cue).max(500)})}),
  z.strictObject({...base,type:z.literal('attachment'),variant:z.literal('download'),content:z.strictObject({label,description:text,assetId:idSchema.nullable()})}),
  z.strictObject({...base,type:z.literal('button'),variant:z.literal('link'),content:z.strictObject({label,url:link})}),
  z.strictObject({...base,type:z.literal('accordion'),variant:z.literal('stacked'),content:z.strictObject({items:z.array(item).min(1).max(50)})}),
  z.strictObject({...base,type:z.literal('tabs'),variant:z.literal('horizontal'),content:z.strictObject({items:z.array(item).min(1).max(50)})}),
  z.strictObject({...base,type:z.literal('flashcards'),variant:z.literal('grid'),content:z.strictObject({cards:z.array(z.strictObject({front:text,back:text})).min(1).max(50)})}),
  z.strictObject({...base,type:z.literal('process'),variant:z.literal('steps'),content:z.strictObject({items:z.array(item).min(1).max(50)})}),
  z.strictObject({...base,type:z.literal('timeline'),variant:z.literal('vertical'),content:z.strictObject({items:z.array(item).min(1).max(50)})}),
  z.strictObject({...base,type:z.literal('labeled-graphic'),variant:z.literal('markers'),content:z.strictObject({...imageContent,markers:z.array(z.strictObject({label,text,x:z.number().min(0).max(100),y:z.number().min(0).max(100)})).min(1).max(30)})}),
  z.strictObject({...base,type:z.literal('assessment'),variant:z.enum(['single-choice','multiple-response','fill-blank','matching','sorting']),
    content:z.strictObject({prompt:text,options:z.array(label).max(20),correct:z.array(z.number().int().min(0).max(19)).max(20),accepted:z.array(label).max(20),caseSensitive:z.boolean(),pairs:z.array(z.strictObject({left:label,right:label})).max(20),items:z.array(label).max(20),feedbackCorrect:text,feedbackIncorrect:text}),
    assessment:z.strictObject({graded:z.boolean(),points:z.number().int().min(1).max(100),required:z.boolean(),completion:z.enum(['submitted','correct']),maxAttempts:z.number().int().min(0).max(20)})}),
  z.strictObject({ ...base, type: z.literal('continue'), variant: z.literal('button'), content: z.strictObject({ label }), completion: z.enum(['none', 'previous', 'all-previous']) }),
]);
export const assetSchema = z.strictObject({
  id: idSchema,
  fileName: z.string().min(1).max(180).regex(/^[a-zA-Z0-9][a-zA-Z0-9 ._-]*$/),
  mediaType: z.enum(['image/png', 'image/jpeg', 'image/webp', 'audio/mpeg', 'audio/wav', 'video/mp4', 'application/pdf', 'text/plain']),
  byteLength: z.number().int().min(1).max(16 * 1024 * 1024),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
});
export const courseSchema = z.strictObject({
  format: z.literal(FORMAT), schemaVersion: z.literal(SCHEMA_VERSION),
  course: z.strictObject({
    id: idSchema, title: label, description: text, author: label,
    language: z.string().min(2).max(35), createdAt: z.iso.datetime(), updatedAt: z.iso.datetime(),
    cover: z.strictObject({ assetId: idSchema, altText: z.string().max(2000), decorative: z.boolean() }).nullable(),
    theme: z.strictObject({ accentColor: z.string().regex(/^#[a-fA-F0-9]{6}$/), font: z.enum(['sans', 'serif']), pageWidth: z.enum(['standard', 'wide']) }),
    settings: z.strictObject({ navigation: z.enum(['free', 'sequential']), completion: z.literal('all-lessons'), passingScore: z.number().int().min(0).max(100) }),
    sections: z.array(z.strictObject({ id: idSchema, title: label, lessons: z.array(z.strictObject({ id: idSchema, title: label, blocks: z.array(blockSchema).max(2000) })).max(200) })).max(100),
  }),
  assets: z.array(assetSchema).max(255),
});
export type CourseDocument = z.infer<typeof courseSchema>;
export type Asset = z.infer<typeof assetSchema>;
export type Block = z.infer<typeof blockSchema>;
export class ProjectError extends Error {
  constructor(message: string) { super(message); this.name = 'ProjectError'; }
}
const extensions: Record<Asset['mediaType'], string> = {
  'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'video/mp4': 'mp4', 'application/pdf': 'pdf', 'text/plain': 'txt',
};
export function assetPath(asset: Asset) { return `assets/${asset.id}.${extensions[asset.mediaType]}`; }

/** Version 1 migrates by copying; original archives and stored rows remain untouched until explicit save. */
export function parseCourse(input: unknown): CourseDocument {
  if (input === null || typeof input !== 'object' || !('schemaVersion' in input)) throw new ProjectError('The course is missing its schema version.');
  if (![1,2,SCHEMA_VERSION].includes(input.schemaVersion as number)) throw new ProjectError(`Unsupported project version ${String(input.schemaVersion).slice(0,30)}. This release supports versions 1, 2, and 3. The original file has not been changed.`);
  const migrated=input.schemaVersion!==SCHEMA_VERSION ? {...structuredClone(input),schemaVersion:SCHEMA_VERSION} : input;
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
  let blockCount = 0;
  let lessonCount = 0;
  for (const section of doc.course.sections) {
    claim(section.id);
    for (const lesson of section.lessons) {
      claim(lesson.id); lessonCount++;
      for (const block of lesson.blocks) {
        claim(block.id); blockCount++;
        if(input.schemaVersion===1 && !['heading','paragraph','list','statement','quote','image','image-text','divider','spacer','continue'].includes(block.type))throw new ProjectError('Version 1 does not support this block type. Use a version 2 project.');
        if(input.schemaVersion!==3 && (block.type==='assessment' || block.requiredInteraction!==undefined))throw new ProjectError('Assessment and interaction requirements need a version 3 project.');
        if(block.requiredInteraction && !['accordion','tabs','flashcards','process','labeled-graphic'].includes(block.type))throw new ProjectError('This block does not support required item exploration.');
        if(block.type==='assessment' && (new Set(block.content.correct).size!==block.content.correct.length || block.content.correct.some(i=>i>=block.content.options.length)))throw new ProjectError('Assessment answer references must be unique and match existing choices.');
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
