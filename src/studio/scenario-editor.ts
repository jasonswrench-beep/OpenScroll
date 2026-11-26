/**
 * The scenario editor: scenes, the steps of the selected scene as cards, and a route check. Every link is chosen
 * from a menu of step numbers, so authoring never needs dragging. Changes save like every other edit and have their
 * own undo.
 */
import { ArrowLeft, ArrowUp, ArrowDown, Trash2, Plus, Undo2, Redo2, Flag, ImagePlus, Images, Users } from 'lucide';
import { assetPath, type Block, type PortableProject } from '../shared/course.js';
import { newId } from '../shared/outline.js';
import { richToDom, richToPlain, plainToRich, RICH_TEXT_MAX } from '../shared/rich-text.js';
import { LessonHistory } from '../shared/lesson-history.js';
import { courseChecks } from '../project/checks.js';
import { bindRich } from '../client/inline-text.js';
import { readImage } from '../client/images.js';
import { h, icon, button, toast, confirmAction, pickFile } from './dom.js';
import { chooseLibraryBackground } from './character-library.js';

type Scenario = Extract<Block, { type: 'scenario' }>;
type Step = Scenario['content']['scenes'][number]['nodes'][number];
export interface ScenarioHost { project: () => PortableProject; edit: (change: (project: PortableProject) => void, assetsChanged?: boolean) => boolean; assetSource: (assetId: string) => string; goTo: (place?: string) => void; themeVars: (element: HTMLElement) => void }
const KINDS: [Step['kind'], string][] = [['line', 'A character speaks'], ['narration', 'Narration'], ['choice', 'The learner chooses'], ['ending', 'An ending']];
let counter = 0;

function locate(project: PortableProject, id: string) {
  for (const lesson of project.document.course.sections.flatMap(s => s.lessons)) { const block = lesson.blocks.find((b): b is Scenario => b.id === id && b.type === 'scenario'); if (block) return { lesson, block }; }
  return undefined;
}

export class ScenarioEditor {
  readonly canvas = h('div', { class: 'lesson-pane scn-pane' });
  readonly panel = h('div', { class: 'lesson-side' });
  private blockId = '';
  private scene = 0;
  private histories = new Map<string, LessonHistory>();
  private status = h('p', { class: 'sr-only', attrs: { role: 'status' } });
  private undoButton = button('Undo', () => this.travel('undo'), { iconOnly: true, icon: Undo2, label: 'Undo scenario change' });
  private redoButton = button('Redo', () => this.travel('redo'), { iconOnly: true, icon: Redo2, label: 'Redo scenario change' });
  constructor(private host: ScenarioHost) {
    this.canvas.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && !(event.target as HTMLElement).matches('input, textarea, select')) { const key = event.key.toLowerCase(); if (key === 'z' || key === 'y') { event.preventDefault(); this.travel(key === 'y' || event.shiftKey ? 'redo' : 'undo'); } } });
  }
  private get found() { return locate(this.host.project(), this.blockId); }
  private history() { let value = this.histories.get(this.blockId); if (!value) { value = new LessonHistory(); this.histories.set(this.blockId, value); } return value; }
  private say(message: string) { this.status.textContent = ''; window.setTimeout(() => { this.status.textContent = message; }, 30); }
  show(blockId: string) { if (blockId !== this.blockId) this.scene = 0; this.blockId = blockId; this.render(); }

  /** Applies a change to the scenario block, with undo. `group` merges typing into one undo step. */
  private change(mutate: (block: Scenario, project: PortableProject) => void, group?: string, redraw = true, assets = false) {
    const before = this.found?.block; if (!before) return false;
    const snapshot = structuredClone(before), id = this.blockId;
    const applied = this.host.edit(project => { const target = locate(project, id)?.block; if (!target) throw new Error('This scenario is no longer available.'); mutate(target, project); }, assets);
    if (applied) { this.history().record([snapshot], [structuredClone(this.found!.block)], group); this.paintHistory(); if (redraw) this.render(); }
    return applied;
  }
  private travel(direction: 'undo' | 'redo') {
    const current = this.found?.block; if (!current) return;
    const id = this.blockId;
    const value = this.history()[direction]([current], blocks => this.host.edit(project => { const found = locate(project, id); if (!found) throw new Error('This scenario is no longer available.'); const at = found.lesson.blocks.indexOf(found.block); found.lesson.blocks[at] = blocks[0]!; }));
    if (value) { this.render(); this.say(direction === 'undo' ? 'Change undone.' : 'Change redone.'); (direction === 'undo' ? this.undoButton : this.redoButton).focus(); }
  }
  private paintHistory() { this.undoButton.disabled = !this.history().canUndo; this.redoButton.disabled = !this.history().canRedo; }

  private render(focus?: string) {
    const found = this.found;
    if (!found) { this.canvas.replaceChildren(h('p', { text: 'This scenario is no longer available.' })); return; }
    const { lesson, block } = found, c = block.content, project = this.host.project();
    this.scene = Math.min(this.scene, c.scenes.length - 1);
    const steps = c.scenes.flatMap(s => s.nodes), number = new Map(steps.map((n, i) => [n.id, i + 1]));
    const summary = (n: Step) => `${number.get(n.id)}. ${n.kind === 'choice' ? 'Choice' : n.kind === 'ending' ? 'Ending' : n.kind === 'narration' ? 'Narration' : (project.document.course.characters.find(ch => ch.id === n.characterId)?.name ?? 'Line')}: ${richToPlain(n.text).replace(/\s+/g, ' ').slice(0, 44)}`;
    const targetSelect = (label: string, value: string | null, apply: (id: string | null) => void) => {
      const id = `scn-sel-${++counter}`, select = h('select', { class: 'inp', attrs: { id } });
      select.add(new Option('(nowhere yet)', '', false, !value));
      for (const n of steps) select.add(new Option(summary(n), n.id, false, n.id === value));
      select.addEventListener('change', () => apply(select.value || null));
      return h('div', { class: 'fld' }, [h('label', { text: label, attrs: { for: id } }), select]);
    };
    const title = h('input', { class: 'inp lesson-title-input', attrs: { id: 'lesson-title', value: c.title, maxlength: 300, 'aria-label': 'Scenario title' } });
    title.addEventListener('input', () => this.change(b => { b.content.title = title.value; }, 'title', false));
    const head = h('div', { class: 'lesson-head' }, [
      button(`Back to ${lesson.title || 'the lesson'}`, () => this.host.goTo(lesson.id), { icon: ArrowLeft, class: 'btn btn-ghost' }), title,
      h('div', { class: 'lesson-tools' }, [this.undoButton, this.redoButton]),
    ]);
    // Scenes
    const scenes = h('nav', { class: 'scn-scenes', attrs: { 'aria-label': 'Scenes' } }, [h('h2', { class: 'insp-h', text: 'Scenes' }),
      h('ol', {}, c.scenes.map((scene, i) => h('li', {}, [h('button', { class: `scn-scene${i === this.scene ? ' is-current' : ''}`, text: `${i + 1}. ${scene.title || 'Untitled scene'} (${scene.nodes.length})`, attrs: { type: 'button', 'aria-current': i === this.scene ? 'true' : null, 'data-focus': `scene-${i}` }, on: { click: () => { this.scene = i; this.render(`scene-${i}`); } } })]))),
      button('Add a scene', () => { if (this.change(b => { b.content.scenes.push({ id: newId(), title: 'New scene', backgroundId: null, nodes: [] }); })) { this.scene = this.found!.block.content.scenes.length - 1; this.render(`scene-${this.scene}`); } }, { icon: Plus, class: 'btn btn-sm', disabled: c.scenes.length >= 20 }),
    ]);
    const scene = c.scenes[this.scene]!;
    const sceneTitle = h('input', { class: 'inp', attrs: { id: 'scn-scene-title', value: scene.title, maxlength: 300 } });
    sceneTitle.addEventListener('input', () => this.change(b => { b.content.scenes[this.scene]!.title = sceneTitle.value; }, `scene-title-${scene.id}`, false));
    const background = button(scene.backgroundId ? 'Replace the background' : 'Add a background picture', async () => {
      const file = await pickFile('.png,.jpg,.jpeg,.webp'); if (!file) return;
      try { const { asset, data } = await readImage(file, this.host.project()); const sceneIndex = this.scene; this.change((b, p) => { p.document.assets.push(asset); p.files[assetPath(asset)] = data; b.content.scenes[sceneIndex]!.backgroundId = asset.id; }, undefined, true, true); }
      catch (error) { toast(error instanceof Error ? error.message : 'The picture could not be added.'); }
    }, { icon: ImagePlus, class: 'btn btn-sm' });
    const library = button('Choose a background from the library', async event => {
      const picked = await chooseLibraryBackground(this.host.project, event.currentTarget as HTMLElement); if (!picked) return;
      const sceneIndex = this.scene; this.change((b, p) => { p.document.assets.push(picked.asset); p.files[assetPath(picked.asset)] = picked.data; b.content.scenes[sceneIndex]!.backgroundId = picked.asset.id; }, undefined, true, true);
    }, { icon: Images, class: 'btn btn-sm' });
    const sceneBar = h('div', { class: 'scn-scene-bar' }, [
      h('div', { class: 'fld' }, [h('label', { text: 'Scene title', attrs: { for: 'scn-scene-title' } }), sceneTitle]),
      h('div', { class: 'row' }, [library, background,
        scene.backgroundId ? button('Remove the background', () => this.change(b => { b.content.scenes[this.scene]!.backgroundId = null; }), { icon: Trash2, class: 'btn btn-sm' }) : null,
        button('Move scene earlier', () => this.change(b => { const s = b.content.scenes; const i = this.scene; if (i > 0) { [s[i - 1], s[i]] = [s[i]!, s[i - 1]!]; this.scene = i - 1; } }), { iconOnly: true, icon: ArrowUp, disabled: this.scene === 0 }),
        button('Move scene later', () => this.change(b => { const s = b.content.scenes; const i = this.scene; if (i < s.length - 1) { [s[i + 1], s[i]] = [s[i]!, s[i + 1]!]; this.scene = i + 1; } }), { iconOnly: true, icon: ArrowDown, disabled: this.scene === c.scenes.length - 1 }),
        button('Delete scene', async event => {
          if (c.scenes.length <= 1) { toast('A scenario needs at least one scene.'); return; }
          if (scene.nodes.length && !await confirmAction('Delete this scene?', `“${scene.title || 'Untitled scene'}” and its ${scene.nodes.length} steps will be removed. Links to them will lead nowhere until you change them. Undo can bring them back.`, 'Delete scene', event.currentTarget as HTMLElement, true)) return;
          const index = this.scene; this.scene = Math.max(0, index - 1); this.change(b => { b.content.scenes.splice(index, 1); });
        }, { iconOnly: true, icon: Trash2, disabled: c.scenes.length <= 1 })]),
    ]);
    const cards = h('ol', { class: 'scn-steps', attrs: { 'aria-label': `Steps in ${scene.title || 'this scene'}` } });
    scene.nodes.forEach((n, i) => cards.append(this.card(block, n, i, scene.nodes.length, number.get(n.id)!, targetSelect)));
    const addStep = button('Add a step', () => { const id = newId(); if (this.change(b => { const nodes = b.content.scenes[this.scene]!.nodes; const last = nodes.at(-1); nodes.push({ id, kind: 'line', characterId: project.document.course.characters[0]?.id ?? null, poseId: project.document.course.characters[0]?.poses[0]?.id ?? null, text: '', next: null, choices: [], outcome: 'neutral' }); if (last && last.kind !== 'choice' && last.kind !== 'ending' && !last.next) last.next = id; if (!b.content.scenes.flatMap(s => s.nodes).some(x => x.id === b.content.start)) b.content.start = id; })) this.focusStep(id); }, { icon: Plus, class: 'btn', attrs: { 'data-focus': 'add-step' } });
    const paper = h('article', { class: 'paper lesson-paper scn-paper', attrs: { 'aria-label': 'Scenario editor' } });
    this.host.themeVars(paper);
    paper.append(h('div', { class: 'scn-grid' }, [scenes, h('section', { class: 'scn-main', attrs: { 'aria-labelledby': 'scn-scene-heading' } }, [h('h2', { class: 'scn-h', text: `Scene ${this.scene + 1}`, attrs: { id: 'scn-scene-heading' } }), sceneBar, scene.nodes.length ? cards : h('p', { class: 'hint', text: 'This scene has no steps yet.' }), addStep])]));
    this.canvas.replaceChildren(head, this.status, paper);
    this.drawPanel(block);
    this.paintHistory();
    if (focus) this.canvas.querySelector<HTMLElement>(`[data-focus="${focus}"]`)?.focus();
  }
  private focusStep(id: string) { this.canvas.querySelector<HTMLElement>(`[data-step="${id}"] [contenteditable]`)?.focus(); }
  private card(block: Scenario, n: Step, index: number, count: number, number: number, targetSelect: (label: string, value: string | null, apply: (id: string | null) => void) => HTMLElement) {
    const c = block.content, project = this.host.project(), characters = project.document.course.characters;
    const at = (b: Scenario) => b.content.scenes.flatMap(s => s.nodes).find(x => x.id === n.id)!;
    const isStart = c.start === n.id;
    const kind = h('select', { class: 'inp', attrs: { id: `scn-kind-${n.id}`, 'aria-label': `Step ${number} kind` } });
    for (const [key, label] of KINDS) kind.add(new Option(label, key, false, key === n.kind));
    kind.addEventListener('change', () => this.change(b => { const step = at(b); step.kind = kind.value as Step['kind']; if (step.kind === 'choice' && !step.choices.length) step.choices = [{ text: 'One option', next: null, feedback: '', points: 0 }, { text: 'Another option', next: null, feedback: '', points: 0 }]; if (step.kind === 'narration') { step.characterId = null; step.poseId = null; } }));
    const text = h('div', { class: 'scn-text os-rich', attrs: { 'data-step': n.id } }, [richToDom(n.text, document, { editable: true })]);
    bindRich(text, { key: 'text', label: `Step ${number} ${n.kind === 'choice' ? 'question (optional)' : 'text'}`, max: RICH_TEXT_MAX, multiline: true, rich: true }, html => this.change(b => { at(b).text = html; }, `text-${n.id}`, false), () => {});
    const body: (HTMLElement | null)[] = [];
    if (n.kind === 'line' || n.kind === 'ending') {
      const who = h('select', { class: 'inp', attrs: { 'aria-label': `Step ${number} speaker` } });
      who.add(new Option(n.kind === 'ending' ? 'No speaker' : 'Choose a character', '', false, !n.characterId));
      for (const ch of characters) who.add(new Option(ch.name || 'Unnamed character', ch.id, false, ch.id === n.characterId));
      who.addEventListener('change', () => this.change(b => { const step = at(b); step.characterId = who.value || null; step.poseId = characters.find(ch => ch.id === who.value)?.poses[0]?.id ?? null; }));
      const character = characters.find(ch => ch.id === n.characterId);
      const pose = h('select', { class: 'inp', attrs: { 'aria-label': `Step ${number} pose`, disabled: !character?.poses.length } });
      for (const p of character?.poses ?? []) pose.add(new Option(p.name || 'Pose', p.id, false, p.id === n.poseId));
      pose.addEventListener('change', () => this.change(b => { at(b).poseId = pose.value || null; }));
      const shown = character?.poses.find(p => p.id === n.poseId) ?? character?.poses[0];
      body.push(h('div', { class: 'row scn-speaker' }, [shown ? h('img', { class: 'scn-pose', attrs: { src: this.host.assetSource(shown.imageId), alt: '' } }) : null, who, pose]));
      if (!characters.length) body.push(h('p', { class: 'hint', text: 'Add characters in Course resources to give lines a speaker.' }));
    }
    body.push(text);
    if (n.kind === 'line' || n.kind === 'narration') body.push(targetSelect(`After step ${number}, go to`, n.next, id => this.change(b => { at(b).next = id; })));
    if (n.kind === 'ending') {
      const outcome = h('select', { class: 'inp', attrs: { 'aria-label': `Step ${number} outcome` } });
      for (const [key, label] of [['positive', 'A good outcome'], ['neutral', 'A neutral outcome'], ['negative', 'A poor outcome']] as const) outcome.add(new Option(label, key, false, key === n.outcome));
      outcome.addEventListener('change', () => this.change(b => { at(b).outcome = outcome.value as Step['outcome']; }));
      body.push(outcome);
    }
    if (n.kind === 'choice') {
      const options = h('ol', { class: 'items scn-options' }, n.choices.map((choice, i) => {
        const label = h('input', { class: 'inp', attrs: { maxlength: 300, value: choice.text, 'aria-label': `Step ${number}, option ${i + 1}` } });
        label.addEventListener('input', () => this.change(b => { at(b).choices[i]!.text = label.value; }, `option-${n.id}-${i}`, false));
        const feedback = h('textarea', { class: 'inp', attrs: { rows: 2, maxlength: 2000, 'aria-label': `Step ${number}, option ${i + 1} feedback` } }); feedback.value = richToPlain(choice.feedback);
        feedback.addEventListener('input', () => this.change(b => { at(b).choices[i]!.feedback = plainToRich(feedback.value); }, `feedback-${n.id}-${i}`, false));
        const points = h('input', { class: 'inp', attrs: { type: 'number', min: -100, max: 100, value: choice.points, 'aria-label': `Step ${number}, option ${i + 1} points` } });
        points.addEventListener('change', () => { const v = Math.round(Number(points.value)); if (Number.isFinite(v)) this.change(b => { at(b).choices[i]!.points = Math.max(-100, Math.min(100, v)); }); });
        return h('li', { class: 'item' }, [h('div', { class: 'item-head' }, [h('span', { class: 'item-name', text: `Option ${i + 1}` }),
          button(`Remove option ${i + 1} from step ${number}`, () => this.change(b => { at(b).choices.splice(i, 1); }), { iconOnly: true, icon: Trash2, disabled: n.choices.length <= 1 })]),
          label, targetSelect(`If chosen, go to`, choice.next, id => this.change(b => { at(b).choices[i]!.next = id; })),
          h('div', { class: 'fld' }, [h('span', { class: 'lbl', text: 'Feedback shown after this choice' }), feedback]),
          c.scoring ? h('div', { class: 'fld fld-num' }, [h('span', { class: 'lbl', text: 'Points' }), points]) : null]);
      }));
      body.push(options, button(`Add an option to step ${number}`, () => this.change(b => { at(b).choices.push({ text: 'Another option', next: null, feedback: '', points: 0 }); }), { icon: Plus, class: 'btn btn-sm', disabled: n.choices.length >= 6 }));
    }
    return h('li', { class: `item scn-step${isStart ? ' is-start' : ''}`, attrs: { 'data-step-card': n.id } }, [
      h('div', { class: 'item-head' }, [h('span', { class: 'item-name', text: `Step ${number}${isStart ? ' · Start' : ''}` }), kind,
        button(isStart ? `Step ${number} is the start` : `Start the scenario at step ${number}`, () => this.change(b => { b.content.start = n.id; }), { iconOnly: true, icon: Flag, attrs: { 'aria-pressed': String(isStart) } }),
        button(`Move step ${number} up`, () => this.change(b => { const list = b.content.scenes[this.scene]!.nodes; [list[index - 1], list[index]] = [list[index]!, list[index - 1]!]; }), { iconOnly: true, icon: ArrowUp, disabled: index === 0 }),
        button(`Move step ${number} down`, () => this.change(b => { const list = b.content.scenes[this.scene]!.nodes; [list[index + 1], list[index]] = [list[index]!, list[index + 1]!]; }), { iconOnly: true, icon: ArrowDown, disabled: index === count - 1 }),
        button(`Delete step ${number}`, () => { if (this.change(b => { b.content.scenes[this.scene]!.nodes.splice(index, 1); })) toast(`Step ${number} deleted. Undo (Ctrl+Z) brings it back.`); }, { iconOnly: true, icon: Trash2 })]),
      ...body,
    ]);
  }
  private drawPanel(block: Scenario) {
    const project = this.host.project(), lesson = locate(project, block.id)!.lesson;
    const issues = courseChecks(project).filter(i => i.blockId === block.id && i.code.startsWith('scenario'));
    const steps = block.content.scenes.flatMap(s => s.nodes), endings = steps.filter(n => n.kind === 'ending').length;
    this.panel.replaceChildren(
      h('h2', { class: 'side-h', text: 'Route check', attrs: { id: 'lesson-panel-heading', tabindex: -1 } }),
      h('p', { class: 'hint', text: `${steps.length} steps in ${block.content.scenes.length} ${block.content.scenes.length === 1 ? 'scene' : 'scenes'}, ${endings} ${endings === 1 ? 'ending' : 'endings'}.` }),
      issues.length ? h('ul', { class: 'scn-issues' }, issues.map(i => h('li', { class: i.effect === 'blocks' ? 'warn-note' : 'hint', text: i.message }))) : h('p', { class: 'hint', text: 'Every step leads somewhere, and an ending can be reached.' }),
      h('section', { class: 'insp-sec' }, [h('h3', { class: 'insp-h', text: 'Characters' }), h('p', { class: 'hint', text: `${project.document.course.characters.length} in this course. Each has poses, from the library or uploaded, each with a description.` }), button('Manage characters', () => this.host.goTo('resources:characters'), { icon: Users, class: 'btn btn-sm' })]),
      h('section', { class: 'insp-sec' }, [h('h3', { class: 'insp-h', text: 'Try it' }), h('p', { class: 'hint', text: `Preview the lesson “${lesson.title || 'Untitled lesson'}” to play the scenario as a learner.` })]),
    );
    void icon;
  }
}
