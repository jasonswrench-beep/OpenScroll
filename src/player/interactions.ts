/**
 * Per-question LMS reporting (foundation F3). Each submitted question and each learner response becomes one SCORM
 * interaction record: its type, the learner's response in the edition's own notation, the result and, for scored
 * questions, the correct pattern and weight. Responses that are not marked right or wrong report as neutral.
 */
import type { CourseDocument } from '../shared/course.js';
import { isAssessment, correctAnswer, parseNumeric, type AssessmentBlock, type Answer } from '../shared/assessment.js';
import { isResponseBlock, selfAssessmentResult, scenarioResult, type ResponseBlock, type LearnerResponse } from '../shared/responses.js';
import { richToPlain } from '../shared/rich-text.js';
import type { LearnerSnapshot } from './state.js';

import type { Edition } from './scorm.js';
export interface Interaction { id: string; type: string; response: string; result: 'correct' | 'incorrect' | 'neutral'; pattern?: string; weighting: number; description: string }

const letter = (index: number) => String.fromCharCode(97 + index);
const plain = (value: string, max: number) => richToPlain(value).replace(/\s+/g, ' ').trim().slice(0, max);
/** Free text in a response: no SCORM 2004 delimiters, no leading language or option marker, within the limit. */
const freeText = (value: string, max: number) => value.replace(/\[[,.:]\]/g, ' ').replace(/^\s*\{/, '(').replace(/\s+/g, ' ').trim().slice(0, max);

function questionRecord(block: AssessmentBlock, answer: Answer, edition: Edition): Interaction | undefined {
  const modern = edition === '2004', list = (items: string[]) => items.join(modern ? '[,]' : ','), pair = (a: string, b: string) => modern ? `${a}[.]${b}` : `${a}.${b}`;
  const c = block.content, correct = correctAnswer(block, answer), selfCheck = block.variant === 'short-answer' && c.selfCheck;
  const base = { id: block.id, weighting: block.assessment.graded ? block.assessment.points : 0, description: plain(c.prompt, 250), result: (selfCheck ? 'neutral' : correct ? 'correct' : 'incorrect') as Interaction['result'] };
  if ('selection' in answer) {
    if (block.variant === 'true-false') {
      const word = (i: number | undefined) => modern ? (i === 0 ? 'true' : 'false') : (i === 0 ? 't' : 'f');
      return { ...base, type: 'true-false', response: word(answer.selection[0]), pattern: word(c.correct[0]) };
    }
    return { ...base, type: 'choice', response: list([...answer.selection].sort((a, b) => a - b).map(letter)), pattern: list([...c.correct].sort((a, b) => a - b).map(letter)) };
  }
  if ('text' in answer) {
    if (block.variant === 'numeric') {
      const n = parseNumeric(answer.text, c.numeric.unit), q = c.numeric;
      const low = q.mode === 'range' ? q.min : q.value - q.tolerance, high = q.mode === 'range' ? q.max : q.value + q.tolerance;
      return { ...base, type: 'numeric', response: n === undefined ? '' : String(n), pattern: modern ? `${low}[:]${high}` : String(q.mode === 'range' ? q.min : q.value) };
    }
    if (selfCheck) return { ...base, type: modern ? 'long-fill-in' : 'fill-in', response: freeText(answer.text, modern ? 4000 : 255) };
    return { ...base, type: 'fill-in', response: freeText(answer.text, modern ? 250 : 255), ...(c.accepted[0] ? { pattern: freeText(c.accepted[0], modern ? 250 : 255) } : {}) };
  }
  if ('matches' in answer) return { ...base, type: 'matching', response: list(answer.matches.map((m, i) => pair(String(i + 1), letter(m)))), pattern: list(c.pairs.map((_, i) => pair(String(i + 1), letter(i)))) };
  if ('order' in answer) return { ...base, type: 'sequencing', response: list(answer.order.map(letter)), pattern: list(c.items.map((_, i) => letter(i))) };
  if ('groups' in answer) return { ...base, type: 'matching', response: list(answer.groups.map((g, i) => pair(String(i + 1), letter(g)))), pattern: list(c.placements.map((g, i) => pair(String(i + 1), letter(g)))) };
  return undefined;
}

function responseRecords(block: ResponseBlock, response: LearnerResponse, edition: Edition): Interaction[] {
  const modern = edition === '2004', long = modern ? 'long-fill-in' : 'fill-in', limit = modern ? 4000 : 255;
  const base = { result: 'neutral' as const, weighting: 0 };
  switch (block.type) {
    case 'reflection': return response.text ? [{ ...base, id: block.id, type: long, response: freeText(response.text, limit), description: plain(block.content.prompt, 250) }] : [];
    case 'activity': return [{ ...base, id: block.id, type: long, response: freeText(response.text ?? (response.done ? 'Done' : ''), limit), description: plain(block.content.title || 'Activity', 250) }];
    case 'checklist': return [{ ...base, id: block.id, type: 'choice', response: (response.ticks ?? []).map(letter).join(modern ? '[,]' : ','), description: plain(block.content.title || 'Checklist', 250) }];
    case 'self-assessment': {
      const result = selfAssessmentResult(block, response), ratings = (response.ratings ?? []).map(r => r === null ? '-' : String(r + 1)).join(' ');
      return [{ ...base, id: block.id, type: modern ? 'other' : 'fill-in', response: freeText(`${result.complete ? `Total ${result.total} of ${result.max}. ` : ''}Ratings ${ratings}`, limit), description: plain(block.content.title || 'Self-assessment', 250) }];
    }
    case 'scenario': {
      const r = scenarioResult(block, response);
      if (!r.ending) return [];
      return [{ id: block.id, type: modern ? 'other' : 'performance', weighting: 0, result: block.content.scoring ? (r.passed ? 'correct' : 'incorrect') : 'neutral', response: freeText(`${r.choices.map(c => c.text).join(' > ')} > ${richToPlain(r.ending.text)}${block.content.scoring ? ` (${r.points} points)` : ''}`, limit), description: plain(block.content.title || 'Scenario', 250) }];
    }
    case 'action-plan': {
      const text = (response.rows ?? []).filter(row => row.some(cell => cell.trim())).map(row => row.join(' | ')).join(' / ');
      return text ? [{ ...base, id: block.id, type: long, response: freeText(text, limit), description: plain(block.content.title || 'Action plan', 250) }] : [];
    }
    case 'software-practice': {
      if (!response.test && !response.done) return [];
      const right = response.test?.filter(Boolean).length ?? 0, all = response.test ? right === response.test.length : false;
      return [{ id: block.id, type: modern ? 'other' : 'performance', weighting: 0, result: response.test ? (all ? 'correct' : 'incorrect') : 'neutral', response: freeText(response.test ? `${right} of ${response.test.length} steps right the first time` : 'Practised every step', limit), description: plain(block.content.title || 'Software practice', 250) }];
    }
    case 'survey': return block.content.items.flatMap((item, i) => {
      const answer = response.answers?.[i] ?? null;
      if (answer === null) return [];
      const description = plain(item.prompt, 250);
      if (typeof answer === 'string') return [{ ...base, id: item.id, type: long, response: freeText(answer, limit), description }];
      if (item.kind === 'choice') return [{ ...base, id: item.id, type: 'choice', response: letter(answer), description }];
      return [{ ...base, id: item.id, type: 'likert', response: String(answer + 1), description }];
    });
  }
}

/** Every interaction to report for this learner state, in course order. */
export function interactionsFor(document: CourseDocument, state: LearnerSnapshot, edition: Edition): Interaction[] {
  const records: Interaction[] = [];
  for (const block of document.course.sections.flatMap(s => s.lessons).flatMap(l => l.blocks)) {
    const questions = isAssessment(block) ? [block] : block.type === 'bank-draw' ? (state.draws[block.id] ?? []).map(id => document.course.banks.flatMap(b => b.questions).find(q => q.id === id)).filter((q): q is AssessmentBlock => !!q) : [];
    for (const question of questions) { const last = state.assessments[question.id]?.last; const record = last ? questionRecord(question, last, edition) : undefined; if (record) records.push(record); }
    if (isAssessment(block) || block.type === 'bank-draw') continue;
    if (isResponseBlock(block)) { const response = state.responses[block.id]; if (response) records.push(...responseRecords(block, response, edition)); }
  }
  return records;
}
/** The interaction id in the edition's form: 2004 recommends a URN. */
export const interactionId = (id: string, edition: Edition) => edition === '2004' ? `urn:openscroll:${id}` : id;
export const signature = (record: Interaction) => JSON.stringify([record.type, record.response, record.result]);
