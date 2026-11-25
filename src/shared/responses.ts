import type { Block } from './course.js';
import { richToPlain } from './rich-text.js';

/** Blocks that collect something from the learner. The answer lives in learner state, never in the course file. */
export type ResponseBlock = Extract<Block, { type: 'reflection' | 'activity' | 'checklist' | 'self-assessment' | 'survey' | 'software-practice' | 'action-plan' | 'scenario' }>;
const RESPONSE_TYPES: ReadonlySet<string> = new Set(['reflection', 'activity', 'checklist', 'self-assessment', 'survey', 'software-practice', 'action-plan', 'scenario']);
export const SCENARIO_TRAIL_MAX = 500;
export function isResponseBlock(block: Block): block is ResponseBlock { return RESPONSE_TYPES.has(block.type); }

/** What a learner has written, ticked or rated. Only the parts that apply to the block are kept. */
export interface LearnerResponse { text?: string; ticks?: number[]; ratings?: (number | null)[]; done?: boolean; answers?: (number | string | null)[]; test?: number[]; rows?: string[][]; trail?: string[]; picks?: number[] }
export const SURVEY_COMMENT_MAX = 4000;
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
  const allowed = new Set(block.type === 'checklist' ? ['ticks'] : block.type === 'self-assessment' ? ['ratings'] : block.type === 'survey' ? ['answers'] : block.type === 'software-practice' ? ['done', 'test'] : block.type === 'action-plan' ? ['rows'] : block.type === 'scenario' ? ['trail', 'picks'] : block.type === 'activity' ? ['text', 'done'] : ['text']);
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
  if (value.trail !== undefined || value.picks !== undefined) {
    // A scenario path must follow the scenario's own links, from its start, one pick per choice passed.
    if (block.type !== 'scenario' || !Array.isArray(value.trail) || !Array.isArray(value.picks ?? [])) return undefined;
    const trail = value.trail as unknown[], picks = (value.picks ?? []) as unknown[];
    if (!trail.length || trail.length > SCENARIO_TRAIL_MAX || !trail.every(id => typeof id === 'string') || !picks.every(i => Number.isInteger(i))) return undefined;
    const nodes = new Map(block.content.scenes.flatMap(s => s.nodes).map(n => [n.id, n]));
    if (trail[0] !== block.content.start) return undefined;
    let pick = 0;
    for (let i = 0; i < trail.length; i++) {
      const node = nodes.get(trail[i] as string);
      if (!node) return undefined;
      const following = trail[i + 1] as string | undefined;
      if (node.kind === 'choice') {
        if (following === undefined) break;
        const chosen = picks[pick] as number, choice = node.choices[chosen];
        if (!choice || choice.next !== following) return undefined;
        pick++;
      } else if (node.kind === 'ending') { if (following !== undefined) return undefined; }
      else if (following !== undefined && node.next !== following) return undefined;
    }
    if (pick !== picks.length) return undefined;
    if (trail.length > 1 || picks.length) { result.trail = trail as string[]; result.picks = picks as number[]; }
  }
  if (value.rows !== undefined) {
    if (block.type !== 'action-plan' || !Array.isArray(value.rows) || value.rows.length > block.content.maxRows) return undefined;
    const rows: string[][] = [];
    for (const row of value.rows as unknown[]) {
      if (!Array.isArray(row) || row.length !== block.content.columns.length) return undefined;
      const cells = row as unknown[];
      if (!cells.every((cell, i) => typeof cell === 'string' && cell.length <= 1000 && (block.content.columns[i]!.kind !== 'date' || cell === '' || /^\d{4}-\d{2}-\d{2}$/.test(cell)))) return undefined;
      rows.push(cells as string[]);
    }
    const kept = rows.filter(row => row.some(cell => cell.trim()));
    if (kept.length) result.rows = rows.slice(0, rows.length - [...rows].reverse().findIndex(row => row.some(cell => cell.trim())));
  }
  if (value.test !== undefined) {
    // One entry per step: 1 when the step was done right the first time in Test, else 0.
    if (block.type !== 'software-practice' || !Array.isArray(value.test) || value.test.length !== block.content.steps.length || !(value.test as unknown[]).every(v => v === 0 || v === 1)) return undefined;
    result.test = value.test as number[];
  }
  if (value.answers !== undefined) {
    if (block.type !== 'survey' || !Array.isArray(value.answers) || value.answers.length !== block.content.items.length) return undefined;
    const answers: (number | string | null)[] = [];
    for (const [index, answer] of (value.answers as unknown[]).entries()) {
      const item = block.content.items[index]!;
      if (answer === null || answer === '') { answers.push(null); continue; }
      if (item.kind === 'comment') { if (typeof answer !== 'string' || answer.length > SURVEY_COMMENT_MAX) return undefined; answers.push(answer.trim() ? answer : null); continue; }
      const limit = item.kind === 'choice' ? item.options.length : block.content.scale.length;
      if (!Number.isInteger(answer) || (answer as number) < 0 || (answer as number) >= limit) return undefined;
      answers.push(answer as number);
    }
    if (answers.some(a => a !== null)) result.answers = answers;
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
    case 'survey': return block.content.items.every((item, i) => item.kind === 'comment' || (response?.answers?.[i] ?? null) !== null);
    case 'software-practice': return block.content.modes.test ? !!response?.test : !!response?.done;
    case 'action-plan': return !!response?.rows?.some(row => row.every(cell => cell.trim()));
    case 'scenario': { const last = response?.trail?.at(-1); return !!last && block.content.scenes.some(s => s.nodes.some(n => n.id === last && n.kind === 'ending')); }
  }
}

/** The total of a self-assessment (each rating counts its position on the scale, from 1) and the band it falls in. */
export function selfAssessmentResult(block: Extract<Block, { type: 'self-assessment' }>, response: LearnerResponse | undefined) {
  const ratings = response?.ratings ?? block.content.items.map(() => null), rated = ratings.filter((r): r is number => r !== null);
  const total = rated.reduce((sum, r) => sum + r + 1, 0), complete = rated.length === block.content.items.length;
  const band = complete ? block.content.bands.find(b => total >= b.min && total <= b.max) : undefined;
  return { total, complete, rated: rated.length, max: block.content.items.length * block.content.scale.length, band };
}

/** The choices a learner made in a scenario, with their feedback, the ending reached, and the points. */
export function scenarioResult(block: Extract<Block, { type: 'scenario' }>, response: LearnerResponse | undefined) {
  const nodes = new Map(block.content.scenes.flatMap(s => s.nodes).map(n => [n.id, n]));
  const choices: { prompt: string; text: string; feedback: string; points: number }[] = [];
  let pick = 0;
  for (const id of response?.trail ?? []) {
    const node = nodes.get(id);
    if (node?.kind !== 'choice') continue;
    const choice = node.choices[response?.picks?.[pick++] ?? -1];
    if (choice) choices.push({ prompt: node.text, text: choice.text, feedback: choice.feedback, points: choice.points });
  }
  const last = nodes.get(response?.trail?.at(-1) ?? ''), ending = last?.kind === 'ending' ? last : undefined;
  const points = choices.reduce((n, c) => n + c.points, 0);
  return { choices, ending, points, passed: !block.content.scoring || points >= block.content.passPoints };
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
    case 'scenario': { const r = scenarioResult(block, response); return r.choices.map(c => `Chose: ${c.text}`).concat(r.ending ? [`Ending: ${richToPlain(r.ending.text).slice(0, 200)}`] : []).concat(block.content.scoring ? [`Points: ${r.points}`] : []).join('\n'); }
    case 'action-plan': return (response?.rows ?? []).filter(row => row.some(cell => cell.trim())).map(row => block.content.columns.map((column, i) => `${column.label}: ${row[i] || '—'}`).join('; ')).join('\n');
    case 'software-practice': return response?.test ? `Test: ${response.test.filter(Boolean).length} of ${response.test.length} steps right the first time` : response?.done ? 'Practised every step' : '';
    case 'survey': return block.content.items.map((item, i) => `${item.prompt} — ${surveyAnswer(block, i, response?.answers?.[i] ?? null) || 'no answer'}`).join('\n');
  }
}
/** A survey answer as words: the rating label, the chosen option, or the comment. */
export function surveyAnswer(block: Extract<Block, { type: 'survey' }>, index: number, answer: number | string | null): string {
  const item = block.content.items[index];
  if (!item || answer === null) return '';
  if (typeof answer === 'string') return answer;
  if (item.kind === 'choice') return item.options[answer] ?? '';
  if (item.kind === 'differential') return `${answer + 1} of ${block.content.scale.length} (${item.options[0] ?? ''} to ${item.options[1] ?? ''})`;
  return block.content.scale[answer] ?? '';
}

/** The heading a response block shows in My workbook and in lists of things to finish. */
export function responseTitle(block: ResponseBlock): string {
  const text = block.type === 'reflection' ? richToPlain(block.content.prompt) : block.content.title || (block.type === 'checklist' ? 'Checklist' : block.type === 'activity' ? 'Activity' : block.type === 'survey' ? 'Survey' : block.type === 'software-practice' ? 'Software practice' : block.type === 'action-plan' ? 'Action plan' : block.type === 'scenario' ? 'Scenario' : 'Self-assessment');
  return text.replace(/\s+/g, ' ').trim().slice(0, 160) || 'Reflection';
}
