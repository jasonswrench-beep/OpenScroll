import type { Block } from './course.js';
import { richToPlain } from './rich-text.js';

/** Blocks that collect something from the learner. The answer lives in learner state, never in the course file. */
export type ResponseBlock = Extract<Block, { type: 'reflection' | 'activity' | 'checklist' | 'self-assessment' }>;
const RESPONSE_TYPES: ReadonlySet<string> = new Set(['reflection', 'activity', 'checklist', 'self-assessment']);
export function isResponseBlock(block: Block): block is ResponseBlock { return RESPONSE_TYPES.has(block.type); }

/** What a learner has written, ticked or rated. Only the parts that apply to the block are kept. */
export interface LearnerResponse { text?: string; ticks?: number[]; ratings?: (number | null)[]; done?: boolean }
export const RESPONSE_TEXT_MAX = 20_000;

export const wordCount = (text: string) => (text.trim().match(/\S+/g) ?? []).length;
const writes = (block: ResponseBlock) => block.type === 'reflection' || (block.type === 'activity' && !!block.content.output);

/**
 * Checks and normalizes a response for a block. Returns undefined when the value does not fit the block, and an
 * empty object when there is nothing to keep.
 */
export function cleanResponse(block: ResponseBlock, input: unknown): LearnerResponse | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const value = input as Record<string, unknown>, result: LearnerResponse = {};
  const allowed = new Set(block.type === 'checklist' ? ['ticks'] : block.type === 'self-assessment' ? ['ratings'] : block.type === 'activity' ? ['text', 'done'] : ['text']);
  if (Object.keys(value).some(key => !allowed.has(key))) return undefined;
  if (value.text !== undefined) {
    if (typeof value.text !== 'string' || value.text.length > RESPONSE_TEXT_MAX || !writes(block)) return undefined;
    if (value.text.trim()) result.text = value.text;
  }
  if (value.done !== undefined) { if (typeof value.done !== 'boolean') return undefined; if (value.done) result.done = true; }
  if (value.ticks !== undefined) {
    if (block.type !== 'checklist' || !Array.isArray(value.ticks) || value.ticks.length > block.content.items.length) return undefined;
    const ticks = value.ticks as unknown[];
    if (!ticks.every(i => Number.isInteger(i) && (i as number) >= 0 && (i as number) < block.content.items.length) || new Set(ticks).size !== ticks.length) return undefined;
    if (ticks.length) result.ticks = [...(ticks as number[])].sort((a, b) => a - b);
  }
  if (value.ratings !== undefined) {
    if (block.type !== 'self-assessment' || !Array.isArray(value.ratings) || value.ratings.length !== block.content.items.length) return undefined;
    const ratings = value.ratings as unknown[];
    if (!ratings.every(r => r === null || (Number.isInteger(r) && (r as number) >= 0 && (r as number) < block.content.scale.length))) return undefined;
    if (ratings.some(r => r !== null)) result.ratings = ratings as (number | null)[];
  }
  return result;
}
export const isEmptyResponse = (response: LearnerResponse) => Object.keys(response).length === 0;

/** Whether the response meets what the block asks for. A block that is not required counts as done regardless. */
export function responseMeets(block: ResponseBlock, response: LearnerResponse | undefined): boolean {
  switch (block.type) {
    case 'reflection': return wordCount(response?.text ?? '') >= Math.max(1, block.content.minWords);
    case 'activity': return block.content.output ? !!response?.text?.trim() : !!response?.done;
    case 'checklist': return (response?.ticks?.length ?? 0) === block.content.items.length;
    case 'self-assessment': return !!response?.ratings && response.ratings.every(r => r !== null);
  }
}

/** The total of a self-assessment (each rating counts its position on the scale, from 1) and the band it falls in. */
export function selfAssessmentResult(block: Extract<Block, { type: 'self-assessment' }>, response: LearnerResponse | undefined) {
  const ratings = response?.ratings ?? block.content.items.map(() => null), rated = ratings.filter((r): r is number => r !== null);
  const total = rated.reduce((sum, r) => sum + r + 1, 0), complete = rated.length === block.content.items.length;
  const band = complete ? block.content.bands.find(b => total >= b.min && total <= b.max) : undefined;
  return { total, complete, rated: rated.length, max: block.content.items.length * block.content.scale.length, band };
}

/** A readable summary of a response, used by My workbook and the LMS record. */
export function responseText(block: ResponseBlock, response: LearnerResponse | undefined): string {
  switch (block.type) {
    case 'reflection': return response?.text ?? '';
    case 'activity': return response?.text ?? (response?.done ? 'Done' : '');
    case 'checklist': return block.content.items.map((item, i) => `${response?.ticks?.includes(i) ? '[x]' : '[ ]'} ${item}`).join('\n');
    case 'self-assessment': {
      const result = selfAssessmentResult(block, response);
      const lines = block.content.items.map((item, i) => { const r = response?.ratings?.[i]; return `${item} — ${r === null || r === undefined ? 'not rated' : block.content.scale[r]}`; });
      if (result.complete) lines.push(`Total: ${result.total} of ${result.max}${result.band ? `. ${richToPlain(result.band.text)}` : ''}`);
      return lines.join('\n');
    }
  }
}

/** The heading a response block shows in My workbook and in lists of things to finish. */
export function responseTitle(block: ResponseBlock): string {
  const text = block.type === 'reflection' ? richToPlain(block.content.prompt) : block.content.title || (block.type === 'checklist' ? 'Checklist' : block.type === 'activity' ? 'Activity' : 'Self-assessment');
  return text.replace(/\s+/g, ' ').trim().slice(0, 160) || 'Reflection';
}
