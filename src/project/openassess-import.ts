/**
 * Turns an OpenAssess question bank (.openassess, read with @openstage/bank, BANK-1) into OpenScroll questions for a
 * course question bank. Each question keeps its prompt, choices, answer key, points and feedback. What OpenScroll
 * cannot represent is listed in the report, never guessed: multi-blank fill-ins, hotspots, calculated questions,
 * questions without an answer key, pictures and equations.
 */
import { inflateRawSync } from 'node:zlib';
import { readBank, BankError, type Question } from '@openstage/bank';
import { assessmentBlock, ProjectError, type Block } from '../shared/course.js';
import { sanitizeRich, plainToRich } from '../shared/rich-text.js';
import { newId } from '../shared/outline.js';

type AssessmentBlock = Extract<Block, { type: 'assessment' }>;
export const OPENASSESS_LIMIT = 32 * 1024 * 1024;
export interface OpenAssessReport { title: string; total: number; imported: number; skipped: { title: string; reason: string }[]; notes: string[] }

const rich = (html: string | undefined) => html ? sanitizeRich(html) : '';
const plain = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 300);

function convert(q: Question): AssessmentBlock | string {
  if (!q.hasKey && q.type !== 'essay') return 'It has no answer key.';
  const options = (q.options ?? []).slice(0, 20), key = (q.key ?? {}) as Record<string, unknown>;
  const base = {
    id: newId(), type: 'assessment' as const, appearance: { width: 'reading', padding: 'medium', background: 'page' },
    content: { prompt: rich(q.stem.html) || plainToRich(q.stem.text), options: [] as string[], correct: [] as number[], accepted: [] as string[], caseSensitive: false, pairs: [] as { left: string; right: string }[], items: [] as string[],
      feedbackCorrect: rich(q.feedback.correct?.html ?? q.feedback.general?.html), feedbackIncorrect: rich(q.feedback.incorrect?.html ?? q.feedback.general?.html), feedbackMode: 'correct-incorrect', choiceFeedback: [] as string[] },
    assessment: { graded: true, points: Math.min(100, Math.max(1, Math.round(q.points || 1))), required: false, completion: 'submitted', maxAttempts: 0 },
  };
  const choices = () => {
    if ((q.options?.length ?? 0) > 20) return 'It has more than 20 choices.';
    base.content.options = options.map(o => plain(o.text.text));
    base.content.correct = options.flatMap((o, i) => o.correct ? [i] : []);
    if (options.some(o => o.feedback?.html)) { base.content.feedbackMode = 'per-choice'; base.content.choiceFeedback = options.map(o => rich(o.feedback?.html)); }
    return undefined;
  };
  let variant: AssessmentBlock['variant'];
  switch (q.type) {
    case 'multipleChoice': { const problem = choices(); if (problem) return problem; variant = 'single-choice'; break; }
    case 'multipleResponse': { const problem = choices(); if (problem) return problem; variant = 'multiple-response'; break; }
    case 'trueFalse': {
      if (typeof key.correct !== 'boolean') return 'Its true or false answer is not set.';
      variant = 'true-false'; base.content.options = ['True', 'False']; base.content.correct = [key.correct ? 0 : 1]; break;
    }
    case 'fillInBlank': {
      const blanks = key.blanks as { accepted: string[] }[] | undefined;
      if (!blanks?.length) return 'It has no accepted answers.';
      if (blanks.length > 1) return 'It has more than one blank; OpenScroll fill-ins take one answer.';
      variant = 'fill-blank'; base.content.accepted = blanks[0]!.accepted.slice(0, 20).map(plain); base.content.caseSensitive = !!key.caseSensitive; break;
    }
    case 'shortAnswer': variant = 'short-answer'; base.content.accepted = ((key.accepted as string[]) ?? []).slice(0, 20).map(plain); base.content.caseSensitive = !!key.caseSensitive; if (!base.content.accepted.length) return 'It has no accepted answers.'; break;
    case 'essay': {
      variant = 'short-answer';
      const model = (key?.modelAnswer as { html?: string } | undefined)?.html;
      Object.assign(base.content, { selfCheck: true, model: rich(model) || plainToRich('Compare your answer with the course material.') });
      base.assessment.graded = false; break;
    }
    case 'matching': {
      const pairs = (key.pairs as { left: { text: string }; right: string }[] | undefined) ?? [];
      if (pairs.length < 2 || pairs.length > 20) return 'Its pairs cannot be shown as an OpenScroll matching question (2 to 20 pairs).';
      variant = 'matching'; base.content.pairs = pairs.map(p => ({ left: plain(p.left.text), right: plain(p.right) })); break;
    }
    case 'ordering': {
      const items = [...((key.items as { text: { text: string }; position: number }[] | undefined) ?? [])].sort((a, b) => a.position - b.position);
      if (items.length < 2 || items.length > 20) return 'It needs 2 to 20 items to put in order.';
      variant = 'ordering'; base.content.items = items.map(i => plain(i.text.text)); break;
    }
    case 'numeric': {
      const mode = key.mode as string, value = Number(key.value ?? 0);
      variant = 'numeric';
      Object.assign(base.content, { numeric: mode === 'range'
        ? { mode: 'range', value: 0, tolerance: 0, min: Number(key.min ?? 0), max: Number(key.max ?? 0), unit: String(key.units ?? '').slice(0, 40) }
        : { mode: 'exact', value, tolerance: mode === 'tolerance' ? Math.abs(Number(key.tolerance ?? 0)) : 0, min: 0, max: 0, unit: String(key.units ?? '').slice(0, 40) } });
      break;
    }
    default: return q.type === 'hotspot' ? 'Hotspot areas cannot be carried over yet; rebuild it as an OpenScroll hotspot.' : 'Calculated questions are not supported.';
  }
  const parsed = assessmentBlock.safeParse({ ...base, variant });
  return parsed.success ? parsed.data : `It could not be converted (${parsed.error.issues[0]?.message ?? 'invalid'}).`;
}

export async function importOpenAssess(bytes: Buffer): Promise<{ name: string; questions: AssessmentBlock[]; report: OpenAssessReport }> {
  if (!bytes.length || bytes.length > OPENASSESS_LIMIT) throw new ProjectError('Choose an OpenAssess bank (.openassess) no larger than 32 MiB.');
  let bank;
  try { bank = await readBank(new Uint8Array(bytes), { maxQuestions: 2000, inflateRaw: (data, limit) => inflateRawSync(data, { maxOutputLength: limit }) }); }
  catch (error) { throw new ProjectError(error instanceof BankError ? (error.code === 'newer-format' ? 'This bank was saved by a newer OpenAssess. Update OpenScroll or save the bank in format 1.' : 'This file is not an OpenAssess question bank.') : 'The question bank could not be read.'); }
  const questions: AssessmentBlock[] = [], skipped: OpenAssessReport['skipped'] = [], notes: string[] = [];
  for (const q of bank.questions) {
    if (questions.length >= 500) { skipped.push({ title: q.title || plain(q.stem.text).slice(0, 80), reason: 'An OpenScroll bank holds up to 500 questions.' }); continue; }
    const result = convert(q);
    if (typeof result === 'string') skipped.push({ title: q.title || plain(q.stem.text).slice(0, 80), reason: result });
    else questions.push(result);
  }
  const pictures = bank.questions.reduce((n, q) => n + q.pictures.length, 0), equations = bank.questions.reduce((n, q) => n + q.equations.length, 0);
  if (pictures) notes.push(`${pictures} ${pictures === 1 ? 'picture was' : 'pictures were'} not carried over; add an image near the question if it is needed.`);
  if (equations) notes.push(`${equations} ${equations === 1 ? 'equation is' : 'equations are'} kept as text.`);
  if (bank.problems.length) notes.push(`${bank.problems.length} ${bank.problems.length === 1 ? 'part' : 'parts'} of the bank could not be read.`);
  return { name: plain(bank.title) || 'Imported bank', questions, report: { title: bank.title, total: bank.questions.length, imported: questions.length, skipped, notes } };
}
