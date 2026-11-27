/**
 * The scenario player: a conversation column. Each line shows the speaker's pose and name, choices are buttons, and
 * focus moves to the newest line. At an ending, "Your path" lists the choices made with their feedback. The path is
 * kept as a learner response, so it resumes where the learner left off.
 */
import type { Block, PortableProject } from '../shared/course.js';
import { richToDom, richIsEmpty } from '../shared/rich-text.js';
import { scenarioResult } from '../shared/responses.js';
import type { CourseFlow } from './state.js';

type Scenario = Extract<Block, { type: 'scenario' }>;
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
const rich = (value: string, cls = '') => { const div = node('div', undefined, `os-rich ${cls}`.trim()); div.append(richToDom(value)); return div; };
const OUTCOME = { positive: 'A good outcome', neutral: 'An outcome', negative: 'A poor outcome' } as const;

export function renderScenario(block: Scenario, flow: CourseFlow, persist: () => void, refresh: () => void, project: PortableProject, url: (assetId: string) => string): HTMLElement {
  const c = block.content, steps = new Map(c.scenes.flatMap(s => s.nodes).map(n => [n.id, n])), sceneOf = new Map(c.scenes.flatMap(s => s.nodes.map(n => [n.id, s] as const)));
  const characters = project.document.course.characters;
  const root = node('div', undefined, 'scenario');
  const saved = flow.response(block.id);
  let trail = saved?.trail ? [...saved.trail] : [c.start], picks = saved?.picks ? [...saved.picks] : [];
  const log = node('ol', undefined, 'scenario-log'); log.setAttribute('aria-label', 'Conversation');
  const controls = node('div', undefined, 'scenario-controls');
  const backdrop = node('div', undefined, 'scenario-scene');
  root.append(node('h3', c.title || 'Scenario'));
  if (!richIsEmpty(c.intro)) root.append(rich(c.intro));
  root.append(backdrop, log, controls);

  const keep = () => { if (flow.respond(block.id, { trail, picks })) { persist(); refresh(); } };
  const speaker = (characterId: string | null, poseId: string | null) => {
    const character = characters.find(ch => ch.id === characterId);
    if (!character) return undefined;
    const pose = character.poses.find(p => p.id === poseId) ?? character.poses[0];
    return { name: character.name || 'Someone', role: character.role, pose };
  };
  const bubble = (n: NonNullable<ReturnType<typeof steps.get>>) => {
    const li = node('li', undefined, `scenario-line scenario-${n.kind}`);
    const who = n.kind === 'narration' ? undefined : speaker(n.characterId, n.poseId);
    if (who) {
      if (who.pose) { const img = node('img', undefined, 'scenario-pose'); img.src = url(who.pose.imageId); img.alt = who.pose.alt; li.append(img); }
      li.append(node('p', who.role ? `${who.name}, ${who.role}` : who.name, 'scenario-speaker'));
    }
    if (n.kind === 'ending') li.append(node('p', OUTCOME[n.outcome], 'scenario-outcome'));
    li.append(rich(n.text));
    return li;
  };
  function draw(focusNewest = false) {
    log.replaceChildren(); controls.replaceChildren();
    let pick = 0;
    for (const [index, id] of trail.entries()) {
      const n = steps.get(id); if (!n) continue;
      log.append(bubble(n));
      if (n.kind === 'choice' && index < trail.length - 1) {
        const choice = n.choices[picks[pick++] ?? -1];
        if (choice) {
          const mine = node('li', undefined, 'scenario-line scenario-mine'); mine.append(node('p', 'You', 'scenario-speaker'), node('p', choice.text));
          if (!richIsEmpty(choice.feedback)) mine.append(rich(choice.feedback, 'scenario-feedback'));
          log.append(mine);
        }
      }
    }
    const current = steps.get(trail.at(-1)!), scene = current ? sceneOf.get(current.id) : undefined;
    backdrop.replaceChildren();
    if (scene?.backgroundId) { const img = node('img'); img.src = url(scene.backgroundId); img.alt = ''; backdrop.append(img); }
    if (scene?.title) backdrop.append(node('p', scene.title, 'scenario-scene-title'));
    backdrop.hidden = !backdrop.childElementCount;
    if (!current) { controls.append(node('p', 'This scenario cannot continue from here.')); return; }
    if (current.kind === 'choice') {
      const group = node('div', undefined, 'scenario-choices'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', 'Your choices');
      current.choices.forEach((choice, i) => {
        const b = node('button', choice.text); b.type = 'button'; b.disabled = !choice.next || !steps.has(choice.next);
        b.addEventListener('click', () => { if (!choice.next) return; picks.push(i); trail.push(choice.next); keep(); draw(true); });
        group.append(b);
      });
      controls.append(group);
    } else if (current.kind === 'ending') {
      const result = scenarioResult(block, { trail, picks });
      if (c.showPathReview && result.choices.length) {
        const review = node('section', undefined, 'scenario-review'); review.setAttribute('aria-label', 'Your path');
        review.append(node('h4', 'Your path'));
        const list = node('ol');
        for (const choice of result.choices) { const li = node('li'); li.append(node('p', choice.text, 'scenario-choice-made')); if (!richIsEmpty(choice.feedback)) li.append(rich(choice.feedback)); list.append(li); }
        review.append(list);
        if (c.scoring) review.append(node('p', `Points: ${result.points}${result.passed ? '' : ` (aim for ${c.passPoints} or more)`}.`, 'scenario-points'));
        controls.append(review);
      }
      const again = node('button', 'Start the scenario again'); again.type = 'button';
      again.addEventListener('click', () => { trail = [c.start]; picks = []; keep(); draw(true); });
      controls.append(again);
    } else {
      const next = node('button', 'Continue'); next.type = 'button'; next.disabled = !current.next || !steps.has(current.next);
      next.addEventListener('click', () => { if (!current.next) return; trail.push(current.next); keep(); draw(true); });
      controls.append(next);
    }
    if (c.allowTakeBack && picks.length && current.kind !== 'ending') {
      const back = node('button', 'Take back my last choice'); back.type = 'button';
      back.addEventListener('click', () => { const lastChoice = trail.map(id => steps.get(id)).findLastIndex((n, i) => n?.kind === 'choice' && i < trail.length - 1); if (lastChoice < 0) return; trail = trail.slice(0, lastChoice + 1); picks.pop(); keep(); draw(true); });
      controls.append(back);
    } else if (c.allowTakeBack && current.kind === 'ending' && picks.length) {
      const back = node('button', 'Go back to my last choice'); back.type = 'button';
      back.addEventListener('click', () => { const lastChoice = trail.map(id => steps.get(id)).findLastIndex(n => n?.kind === 'choice'); if (lastChoice < 0) return; trail = trail.slice(0, lastChoice + 1); picks.pop(); keep(); draw(true); });
      controls.append(back);
    }
    if (focusNewest) { const newest = log.lastElementChild as HTMLElement | null; if (newest) { newest.tabIndex = -1; newest.focus(); } }
  }
  draw();
  return root;
}
