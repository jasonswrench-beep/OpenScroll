import type { OBJECTIVE_LEVELS } from './course.js';

/** Names for the thinking levels (revised Bloom's taxonomy) an author can attach to an objective. */
export const OBJECTIVE_LEVEL_NAMES: Record<(typeof OBJECTIVE_LEVELS)[number], string> = {
  remember: 'Remember',
  understand: 'Understand',
  apply: 'Apply',
  analyze: 'Analyze',
  evaluate: 'Evaluate',
  create: 'Create',
};
