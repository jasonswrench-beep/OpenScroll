/**
 * Checks: what stops a course from publishing, what deserves a fix, and what needs a person's judgment. The same
 * list drives the studio's Checks panel and the server's publish gate, so they can never disagree. Checks never
 * stop saving.
 */
import { assessmentIssue } from '../shared/assessment.js';
import { safeLink, type Block, type PortableProject, type Lesson } from '../shared/course.js';
import { richIsEmpty, richToPlain } from '../shared/rich-text.js';

export type CheckEffect = 'blocks' | 'warning' | 'review';
export type Output = 'website' | 'scorm' | 'pdf';
export interface CheckIssue {
  effect: CheckEffect; code: string; message: string; outputs: Output[];
  lessonId?: string; blockId?: string;
  /** The field to focus: a block content path, or `altText`, `cover-alt`, `banner-alt`, `lesson-title`. */
  field?: string;
  /** Where the field lives in the inspector. */
  tab?: 'content' | 'behavior' | 'access';
}
const ALL: Output[] = ['website', 'scorm', 'pdf'];
const LIVE: Output[] = ['website', 'scorm'];

/** Lessons and blocks with the lesson each block belongs to, including blocks inside columns. */
function* walk(project: PortableProject): Generator<{ lesson: Lesson; block: Block; parent?: Block }> {
  for (const lesson of project.document.course.sections.flatMap(s => s.lessons)) for (const block of lesson.blocks) {
    yield { lesson, block };
    if (block.type === 'columns') for (const column of block.content.columns) for (const child of column.blocks) yield { lesson, block: child, parent: block };
  }
}
const looksLikeFileName = (alt: string) => /\.(png|jpe?g|webp|gif|svg)$/i.test(alt.trim()) || /^(img|image|photo|picture|dsc|screenshot)[\s_-]*\d*$/i.test(alt.trim());

export function courseChecks(project: PortableProject): CheckIssue[] {
  const issues: CheckIssue[] = [], course = project.document.course;
  const add = (issue: CheckIssue) => issues.push(issue);
  if (!course.title.trim()) add({ effect: 'warning', code: 'course-title', message: 'The course has no title.', outputs: ALL, field: 'course-title' });
  if (course.cover && !course.cover.decorative && !course.cover.altText.trim()) add({ effect: 'warning', code: 'cover-alt', message: 'The cover image has no alternative text. Describe it or mark it decorative.', outputs: ALL, field: 'cover-alt' });
  const lessons = course.sections.flatMap(s => s.lessons);
  if (!lessons.length) add({ effect: 'warning', code: 'no-lessons', message: 'The course has no lessons yet.', outputs: ALL });
  let written = false;
  for (const lesson of lessons) {
    if (!lesson.title.trim()) add({ effect: 'warning', code: 'lesson-title', message: 'This lesson has no title.', outputs: ALL, lessonId: lesson.id, field: 'lesson-title' });
    if (!lesson.blocks.length) add({ effect: 'warning', code: 'empty-lesson', message: 'This lesson has no blocks.', outputs: ALL, lessonId: lesson.id });
    const banner = lesson.banner;
    if (banner && !banner.decorative && !banner.altText.trim() && (banner.source === 'image' || course.cover)) add({ effect: 'warning', code: 'banner-alt', message: 'The lesson banner has no alternative text. Describe it or mark it decorative.', outputs: ALL, lessonId: lesson.id, field: 'banner-alt' });
    if (banner?.source === 'cover' && !course.cover) add({ effect: 'warning', code: 'banner-cover', message: 'The lesson banner uses the course cover, but the course has no cover image.', outputs: ALL, lessonId: lesson.id });
  }
  for (const { lesson, block } of walk(project)) {
    const at = { lessonId: lesson.id, blockId: block.id };
    const blocking = (code: string, message: string, field?: string, tab: CheckIssue['tab'] = 'content') => add({ effect: 'blocks', code, message, outputs: ALL, ...at, ...(field ? { field } : {}), tab });
    const warn = (code: string, message: string, field?: string, tab: CheckIssue['tab'] = 'content', outputs = ALL) => add({ effect: 'warning', code, message, outputs, ...at, ...(field ? { field } : {}), tab });
    const review = (code: string, message: string, field?: string, tab: CheckIssue['tab'] = 'access') => add({ effect: 'review', code, message, outputs: ALL, ...at, ...(field ? { field } : {}), tab });
    switch (block.type) {
      case 'assessment': { const issue = assessmentIssue(block); if (issue) blocking('question', `Assessment is not ready: ${issue}`, richIsEmpty(block.content.prompt) ? 'prompt' : undefined); break; }
      case 'audio': case 'video':
        if (block.content.assetId && !block.content.transcript.trim()) blocking('transcript', `Add a transcript to the ${block.type} block before publishing.`);
        if (block.type === 'video' && block.content.assetId && !block.content.captions.length) blocking('captions', 'Add timed captions to the video block before publishing.');
        if (!block.content.assetId) warn('media-missing', `This ${block.type} block has no file yet. Learners will see the transcript only.`);
        if (block.type === 'video' && block.content.captions.length) review('captions-accuracy', 'Watch the video with captions on and check they match what is said.', undefined, 'content');
        break;
      case 'objectives': if (block.content.items.some(item => !item.text.trim())) blocking('objective-empty', 'Fill in or remove the empty learning objective before publishing.'); break;
      case 'reflection': if (richIsEmpty(block.content.prompt)) blocking('reflection-prompt', 'Add a prompt to the reflection block before publishing.', 'prompt'); written = true; break;
      case 'activity': if (block.content.steps.every(step => richIsEmpty(step))) blocking('activity-steps', 'Add at least one step to the activity block before publishing.'); if (block.content.output) written = true; break;
      case 'checklist': if (block.content.items.some(item => !item.trim())) blocking('checklist-empty', 'Fill in or remove the empty checklist item before publishing.'); break;
      case 'self-assessment':
        if (block.content.items.some(item => !item.trim()) || block.content.scale.some(label => !label.trim())) blocking('self-assessment-empty', 'Fill in every statement and rating label in the self-assessment before publishing.');
        else if (block.content.bands.length) {
          const low = block.content.items.length, high = low * block.content.scale.length;
          const gap = Array.from({ length: high - low + 1 }, (_, i) => low + i).find(total => !block.content.bands.some(b => total >= b.min && total <= b.max));
          if (gap !== undefined) warn('bands-gap', `No score band covers a total of ${gap}. Learners with that total see no message.`);
        }
        break;
      case 'survey':
        if (block.content.items.some(item => !item.prompt.trim()) || block.content.scale.some(label => !label.trim())) blocking('survey-empty', 'Fill in every survey question and rating label before publishing.');
        if (block.content.items.some(item => item.kind === 'comment')) written = true;
        break;
      case 'table':
        if (!block.content.head.length && !block.content.headerColumn) warn('table-headers', 'This table has no column or row headings, so screen readers cannot name its cells.', undefined, 'content');
        break;
      case 'image': case 'image-text': case 'labeled-graphic': {
        const c = block.content;
        if (!c.decorative && !c.altText.trim()) warn('alt-missing', 'This image has no alternative text. Describe it or mark it decorative.', 'altText', 'access');
        else if (!c.decorative && looksLikeFileName(c.altText)) review('alt-filename', 'The alternative text looks like a file name. Describe what the image shows.', 'altText');
        break;
      }
      case 'gallery': if (block.content.items.some(item => !item.decorative && !item.altText.trim())) warn('gallery-alt', 'A gallery image has no alternative text.'); break;
      case 'button': if (!safeLink(block.content.url)) warn('link-missing', 'This link button has no web address yet.', undefined, 'content', LIVE); break;
      case 'attachment': if (!block.content.assetId) warn('attachment-missing', 'This attachment has no file yet.', undefined, 'content', LIVE); break;
      case 'heading': if (!block.content.text.trim()) warn('heading-empty', 'This heading is empty. Screen reader users navigate by headings.', 'text'); break;
    }
  }
  if (written) add({ effect: 'warning', code: 'scorm-12-responses', message: 'This course has written responses. SCORM 1.2 can keep only about 4,000 characters of progress, so long answers may stay on the learner’s device. Choose SCORM 2004 when your LMS supports it.', outputs: ['scorm'] });
  return issues;
}
export function hasWrittenResponses(project: PortableProject) { return courseChecks(project).some(issue => issue.code === 'scorm-12-responses'); }
/** A one-line summary of a block for lists of issues. */
export function blockSummary(block: Block): string {
  const content = block.content as Record<string, unknown>;
  const text = String(content.prompt || content.title || content.heading || content.text || content.caption || block.type);
  return richToPlain(text).replace(/\s+/g, ' ').trim().slice(0, 80);
}
