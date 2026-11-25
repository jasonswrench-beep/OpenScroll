/**
 * Course resources (foundation F6): the course's glossary, question banks and certificate, each in its own tab.
 * Glossary terms and their definitions feed the glossary block and optional term links in lesson text; banks feed
 * the "Questions from a bank" block; the certificate is what the results block prints.
 */
import { ArrowLeft, Plus, Trash2, Upload, Pencil, ImagePlus } from 'lucide';
import { assetPath, type PortableProject, type Block } from '../shared/course.js';
import { newId } from '../shared/outline.js';
import { richToDom, RICH_TEXT_MAX } from '../shared/rich-text.js';
import { bindRich } from '../client/inline-text.js';
import { readImage } from '../client/images.js';
import { questionImportDialog } from '../client/question-import.js';
import { projects } from './api.js';
import { parseCsv } from '../shared/csv.js';
import { h, button, openDialog, confirmAction, toast, announce, pickFile } from './dom.js';

export type ResourceTab = 'glossary' | 'banks' | 'characters' | 'certificate';
export interface ResourcesHost { project: () => PortableProject; edit: (change: (project: PortableProject) => void, assetsChanged?: boolean) => boolean; assetSource: (assetId: string) => string; goTo: (place?: string) => void; redraw: () => void }
const TABS: [ResourceTab, string][] = [['glossary', 'Glossary'], ['banks', 'Question banks'], ['characters', 'Characters'], ['certificate', 'Certificate']];

export function resourcesView(host: ResourcesHost, tab: ResourceTab): { canvas: HTMLElement; side: HTMLElement[] } {
  const course = () => host.project().document.course;
  const tablist = h('div', { class: 'tabs res-tabs', attrs: { role: 'tablist', 'aria-label': 'Course resources' } });
  TABS.forEach(([key, label], index) => {
    const t = h('button', { class: 'tab', text: label, attrs: { type: 'button', role: 'tab', id: `res-tab-${key}`, 'aria-selected': String(key === tab), 'aria-controls': 'res-panel', tabindex: key === tab ? 0 : -1 } });
    t.addEventListener('click', () => host.goTo(`resources:${key}`));
    t.addEventListener('keydown', event => { const next = event.key === 'ArrowRight' ? (index + 1) % TABS.length : event.key === 'ArrowLeft' ? (index + TABS.length - 1) % TABS.length : -1; if (next >= 0) { event.preventDefault(); host.goTo(`resources:${TABS[next]![0]}`); } });
    tablist.append(t);
  });
  const panel = h('div', { class: 'res-panel', attrs: { role: 'tabpanel', id: 'res-panel', 'aria-labelledby': `res-tab-${tab}` } });
  panel.append(...(tab === 'glossary' ? glossaryTab(host) : tab === 'banks' ? banksTab(host) : tab === 'characters' ? charactersTab(host) : certificateTab(host)));
  const canvas = h('div', { class: 'lesson-pane res-pane' }, [
    h('div', { class: 'lesson-head' }, [button('Back to course', () => host.goTo(undefined), { icon: ArrowLeft, class: 'btn btn-ghost' }), h('h1', { class: 'res-title', text: 'Course resources', attrs: { id: 'lesson-title', tabindex: -1 } })]),
    h('section', { class: 'paper res-paper' }, [tablist, panel]),
  ]);
  const used = (type: Block['type']) => course().sections.flatMap(s => s.lessons).flatMap(l => l.blocks).filter(b => b.type === type).length;
  const side = [
    h('h2', { class: 'side-h', text: 'About course resources' }),
    h('p', { class: 'hint', text: 'Resources belong to the whole course. Blocks in any lesson can use them.' }),
    h('ul', { class: 'res-summary' }, [
      h('li', { text: `Glossary: ${course().glossary.length} ${course().glossary.length === 1 ? 'term' : 'terms'}; ${used('glossary')} glossary ${used('glossary') === 1 ? 'block' : 'blocks'}.` }),
      h('li', { text: `Question banks: ${course().banks.length}; ${used('bank-draw')} ${used('bank-draw') === 1 ? 'block draws' : 'blocks draw'} from them.` }),
      h('li', { text: `Certificate: ${course().certificate ? 'offered' : 'not offered'}; ${used('results')} results ${used('results') === 1 ? 'block' : 'blocks'}.` }),
    ]),
  ];
  return { canvas, side };
}

/* ---------- glossary ---------- */
function glossaryTab(host: ResourcesHost): HTMLElement[] {
  const course = host.project().document.course, terms = [...course.glossary].sort((a, b) => a.term.localeCompare(b.term, course.language));
  const links = h('input', { attrs: { id: 'gl-links', type: 'checkbox' } }); links.checked = course.settings.glossaryLinks;
  links.addEventListener('change', () => host.edit(p => { p.document.course.settings.glossaryLinks = links.checked; }));
  const filter = h('input', { class: 'inp', attrs: { id: 'gl-filter', type: 'search', placeholder: 'Find a term', 'aria-label': 'Find a term' } });
  const list = h('ol', { class: 'items gl-list' });
  const edit = (id: string, change: (term: typeof course.glossary[number]) => void) => host.edit(p => { const term = p.document.course.glossary.find(t => t.id === id); if (term) change(term); });
  terms.forEach((term, index) => {
    const name = h('input', { class: 'inp', attrs: { id: `gl-term-${index}`, maxlength: 300, value: term.term } });
    name.addEventListener('input', () => edit(term.id, t => { t.term = name.value; }));
    const aliases = h('input', { class: 'inp', attrs: { id: `gl-alias-${index}`, maxlength: 600, value: term.aliases.join(', ') } });
    aliases.addEventListener('change', () => edit(term.id, t => { t.aliases = aliases.value.split(',').map(a => a.trim()).filter(Boolean).slice(0, 10).map(a => a.slice(0, 300)); }));
    const definition = h('div', { class: 'gl-definition os-rich', attrs: { id: `gl-def-${index}` } }, [richToDom(term.definition, document, { editable: true })]);
    bindRich(definition, { key: 'definition', label: `Definition of ${term.term || 'this term'}`, max: RICH_TEXT_MAX, multiline: true, rich: true }, html => edit(term.id, t => { t.definition = html; }), () => {});
    const item = h('li', { class: 'item gl-item', attrs: { 'data-term': `${term.term} ${term.aliases.join(' ')}`.toLowerCase() } }, [
      h('div', { class: 'item-head' }, [h('span', { class: 'item-name', text: term.term || '(no term yet)' }),
        button(`Remove ${term.term || 'this term'}`, async event => { if (!await confirmAction('Remove this term?', `“${term.term || 'This term'}” and its definition will be removed from the glossary.`, 'Remove term', event.currentTarget as HTMLElement, true)) return; if (host.edit(p => { p.document.course.glossary = p.document.course.glossary.filter(t => t.id !== term.id); })) { host.redraw(); announce('Term removed.'); } }, { iconOnly: true, icon: Trash2 })]),
      h('div', { class: 'row gl-row' }, [h('div', { class: 'fld' }, [h('label', { text: 'Term', attrs: { for: `gl-term-${index}` } }), name]), h('div', { class: 'fld' }, [h('label', { text: 'Also called (comma-separated)', attrs: { for: `gl-alias-${index}` } }), aliases])]),
      h('div', { class: 'fld' }, [h('span', { class: 'lbl', text: 'Definition' }), definition]),
    ]);
    list.append(item);
  });
  filter.addEventListener('input', () => { const q = filter.value.trim().toLowerCase(); for (const item of list.querySelectorAll<HTMLElement>('.gl-item')) item.hidden = !!q && !(item.dataset.term ?? '').includes(q); });
  const add = button('Add a term', () => { const id = newId(); if (host.edit(p => { p.document.course.glossary.push({ id, term: '', definition: '', aliases: [] }); })) { host.redraw(); document.querySelector<HTMLElement>('.gl-item input')?.focus(); } }, { icon: Plus, class: 'btn btn-sm', disabled: course.glossary.length >= 500 });
  const importer = button('Import terms from a CSV file', async () => {
    const file = await pickFile('.csv,text/csv'); if (!file) return;
    const rows = parseCsv(await file.text()), header = rows[0]?.map(c => c.trim().toLowerCase()) ?? [];
    const start = header.includes('term') ? 1 : 0, at = (name: string, fallback: number) => { const i = header.indexOf(name); return i >= 0 ? i : fallback; };
    const t = at('term', 0), d = at('definition', 1), a = at('aliases', 2);
    const incoming = rows.slice(start).map(r => ({ term: (r[t] ?? '').trim().slice(0, 300), definition: (r[d] ?? '').trim(), aliases: (r[a] ?? '').split(/[;|]/).map(x => x.trim()).filter(Boolean).slice(0, 10) })).filter(x => x.term);
    const existing = new Set(course.glossary.map(g => g.term.toLowerCase())), fresh = incoming.filter(x => !existing.has(x.term.toLowerCase())).slice(0, 500 - course.glossary.length);
    const { plainToRich } = await import('../shared/rich-text.js');
    if (fresh.length && host.edit(p => { p.document.course.glossary.push(...fresh.map(x => ({ id: newId(), term: x.term, definition: plainToRich(x.definition.slice(0, 20000)), aliases: x.aliases }))); })) { host.redraw(); toast(`${fresh.length} ${fresh.length === 1 ? 'term' : 'terms'} added${incoming.length > fresh.length ? `; ${incoming.length - fresh.length} already in the glossary or over the limit` : ''}.`); }
    else toast('No new terms found. Use columns term, definition and aliases (aliases separated by semicolons).');
  }, { icon: Upload, class: 'btn btn-sm' });
  return [
    h('p', { text: 'Define each term once. A glossary block lists them A to Z, and term links let learners open a definition from the lesson text.' }),
    h('div', { class: 'chk' }, [links, h('label', { attrs: { for: 'gl-links' } }, ['Link the first use of each term in every lesson', h('span', { class: 'hint', text: 'Learners select the term to show its definition. Works by keyboard and touch.' })])]),
    h('div', { class: 'row' }, [add, importer, filter]),
    terms.length ? list : h('p', { class: 'hint', text: 'No terms yet.' }),
  ];
}

/* ---------- question banks ---------- */
function banksTab(host: ResourcesHost): HTMLElement[] {
  const course = host.project().document.course;
  const usedBy = (id: string) => course.sections.flatMap(s => s.lessons).filter(l => l.blocks.some(b => b.type === 'bank-draw' && b.content.bankId === id)).length;
  const create = button('New question bank', () => { const id = newId(); if (host.edit(p => { p.document.course.banks.push({ id, name: 'New question bank', questions: [] }); })) host.goTo(`bank:${id}`); }, { icon: Plus, class: 'btn btn-sm btn-primary', disabled: course.banks.length >= 50 });
  const openassess = button('Import an OpenAssess bank', async event => {
    const opener = event.currentTarget as HTMLElement, file = await pickFile('.openassess');
    if (!file) return;
    try {
      const result = await projects.importOpenAssess(file);
      const r = result.report;
      openDialog({ title: `Import “${result.name}”`, opener, body: [
        h('p', { text: `${r.imported} of ${r.total} questions can be imported.` }),
        r.skipped.length ? h('div', {}, [h('h3', { class: 'insp-h', text: `Not imported (${r.skipped.length})` }), h('ul', { class: 'review-list' }, r.skipped.map(s => h('li', { text: `${s.title}: ${s.reason}` })))]) : null,
        ...r.notes.map(n => h('p', { class: 'hint', text: n })),
      ], actions: [
        { label: 'Cancel', run: () => true },
        { label: 'Add as a new bank', kind: 'primary', run: () => { const id = newId(); if (!result.questions.length) return true; if (host.edit(p => { p.document.course.banks.push({ id, name: result.name.slice(0, 300), questions: result.questions as never }); })) { toast(`Bank “${result.name}” added with ${result.questions.length} questions.`); host.goTo(`bank:${id}`); } return true; } },
      ] });
    } catch (error) { toast(error instanceof Error ? error.message : 'The bank could not be read.'); }
  }, { icon: Upload, class: 'btn btn-sm' });
  const list = h('ul', { class: 'items bank-list' }, course.banks.map((bank, index) => {
    const used = usedBy(bank.id), graded = bank.questions.filter(q => q.assessment.graded).length;
    const spreadsheet = button(`Import spreadsheet questions into ${bank.name || `bank ${index + 1}`}`, event => questionImportDialog(event.currentTarget as HTMLElement, () => true, blocks => {
      if (!host.edit(p => { const target = p.document.course.banks.find(b => b.id === bank.id); if (!target) throw new Error('The bank is no longer available.'); if (target.questions.length + blocks.length > 500) throw new Error('A bank holds up to 500 questions.'); target.questions.push(...blocks as never[]); })) throw new Error('The questions could not be added.');
      host.redraw(); toast(`${blocks.length} questions added to “${bank.name}”.`);
    }), { iconOnly: true, icon: Upload });
    return h('li', { class: 'item' }, [
      h('div', { class: 'item-head' }, [h('span', { class: 'item-name', text: `${bank.name || 'Untitled bank'} · ${bank.questions.length} ${bank.questions.length === 1 ? 'question' : 'questions'} (${graded} scored) · ${used ? `used in ${used} ${used === 1 ? 'lesson' : 'lessons'}` : 'not used yet'}` }),
        button(`Edit questions in ${bank.name || `bank ${index + 1}`}`, () => host.goTo(`bank:${bank.id}`), { iconOnly: true, icon: Pencil }), spreadsheet,
        button(`Delete ${bank.name || `bank ${index + 1}`}`, async event => {
          if (!await confirmAction('Delete this question bank?', `“${bank.name || 'Untitled bank'}” and its ${bank.questions.length} questions will be removed.${used ? ` ${used} ${used === 1 ? 'lesson draws' : 'lessons draw'} from it; those blocks will ask for another bank.` : ''} Undo is not available for this.`, 'Delete bank', event.currentTarget as HTMLElement, true)) return;
          if (host.edit(p => { p.document.course.banks = p.document.course.banks.filter(b => b.id !== bank.id); })) { host.redraw(); announce('Bank deleted.'); }
        }, { iconOnly: true, icon: Trash2 })]),
    ]);
  }));
  return [
    h('p', { text: 'A bank holds questions that a "Questions from a bank" block draws at random. Each learner keeps the set they were given when they come back.' }),
    h('div', { class: 'row' }, [create, openassess]),
    course.banks.length ? list : h('p', { class: 'hint', text: 'No question banks yet.' }),
    h('p', { class: 'hint', text: 'OpenAssess banks (.openassess, format 1) keep each question\'s choices, answer key, points and feedback. Questions OpenScroll cannot show are listed before anything is added. Spreadsheets use the same columns as lesson question import.' }),
  ];
}

/* ---------- characters ---------- */
function charactersTab(host: ResourcesHost): HTMLElement[] {
  const course = host.project().document.course;
  const uses = (id: string) => course.sections.flatMap(s => s.lessons).flatMap(l => l.blocks).flatMap(b => b.type === 'scenario' ? b.content.scenes.flatMap(s => s.nodes) : []).filter(n => n.characterId === id).length;
  const set = (id: string, change: (character: typeof course.characters[number]) => void, assets = false) => host.edit(p => { const target = p.document.course.characters.find(c => c.id === id); if (target) change(target); }, assets);
  const addPose = async (id: string, poseId?: string) => {
    const file = await pickFile('.png,.jpg,.jpeg,.webp'); if (!file) return;
    try {
      const { asset, data } = await readImage(file, host.project());
      if (host.edit(p => { p.document.assets.push(asset); p.files[assetPath(asset)] = data; const target = p.document.course.characters.find(c => c.id === id); if (!target) return; const pose = poseId ? target.poses.find(x => x.id === poseId) : undefined; if (pose) pose.imageId = asset.id; else target.poses.push({ id: newId(), name: `Pose ${target.poses.length + 1}`, imageId: asset.id, alt: '' }); }, true)) { host.redraw(); toast(poseId ? 'Picture replaced.' : 'Pose added. Describe it for screen reader users.'); }
    } catch (error) { toast(error instanceof Error ? error.message : 'The picture could not be added.'); }
  };
  const list = h('ul', { class: 'items char-list' }, course.characters.map((character, index) => {
    const name = h('input', { class: 'inp', attrs: { id: `ch-name-${index}`, maxlength: 300, value: character.name } }); name.addEventListener('input', () => set(character.id, c => { c.name = name.value; })); name.addEventListener('change', () => { host.redraw(); document.getElementById(`ch-role-${index}`)?.focus(); });
    const role = h('input', { class: 'inp', attrs: { id: `ch-role-${index}`, maxlength: 300, value: character.role } }); role.addEventListener('input', () => set(character.id, c => { c.role = role.value; }));
    const poses = h('ul', { class: 'pose-list' }, character.poses.map((pose, p) => {
      const poseName = h('input', { class: 'inp', attrs: { maxlength: 300, value: pose.name, 'aria-label': `${character.name || 'Character'}, pose ${p + 1} name` } }); poseName.addEventListener('input', () => set(character.id, c => { const x = c.poses.find(y => y.id === pose.id); if (x) x.name = poseName.value; }));
      const alt = h('textarea', { class: 'inp', attrs: { rows: 2, maxlength: 2000, 'aria-label': `${character.name || 'Character'}, pose ${p + 1} description` } }); alt.value = pose.alt; alt.addEventListener('input', () => set(character.id, c => { const x = c.poses.find(y => y.id === pose.id); if (x) x.alt = alt.value; }));
      return h('li', { class: 'pose' }, [h('img', { attrs: { src: host.assetSource(pose.imageId), alt: '' } }), h('div', { class: 'pose-fields' }, [poseName, alt,
        h('div', { class: 'row' }, [button(`Replace the picture for pose ${p + 1}`, () => void addPose(character.id, pose.id), { iconOnly: true, icon: ImagePlus }),
          button(`Remove pose ${p + 1}`, () => { if (set(character.id, c => { c.poses = c.poses.filter(x => x.id !== pose.id); })) host.redraw(); }, { iconOnly: true, icon: Trash2 })])])]);
    }));
    const used = uses(character.id);
    return h('li', { class: 'item' }, [
      h('div', { class: 'item-head' }, [h('span', { class: 'item-name', text: `${character.name || 'Unnamed character'}${used ? ` · speaks in ${used} ${used === 1 ? 'step' : 'steps'}` : ''}` }),
        button(`Remove ${character.name || 'this character'}`, async event => {
          if (!await confirmAction('Remove this character?', `${character.name || 'This character'} and their poses will be removed.${used ? ` ${used} scenario ${used === 1 ? 'step needs' : 'steps need'} another speaker afterwards.` : ''}`, 'Remove character', event.currentTarget as HTMLElement, true)) return;
          if (host.edit(p => { p.document.course.characters = p.document.course.characters.filter(c => c.id !== character.id); })) host.redraw();
        }, { iconOnly: true, icon: Trash2 })]),
      h('div', { class: 'row gl-row' }, [h('div', { class: 'fld' }, [h('label', { text: 'Name', attrs: { for: `ch-name-${index}` } }), name]), h('div', { class: 'fld' }, [h('label', { text: 'Role (optional)', attrs: { for: `ch-role-${index}` } }), role])]),
      poses,
      button(`Add a pose for ${character.name || 'this character'}`, () => void addPose(character.id), { icon: ImagePlus, class: 'btn btn-sm', disabled: character.poses.length >= 20 }),
    ]);
  }));
  return [
    h('p', { text: 'Characters speak in scenarios. Each has poses: pictures you upload, such as calm, pleased or worried. Describe every pose; screen readers read the description when the character speaks.' }),
    h('div', { class: 'row' }, [button('Add a character', () => { if (host.edit(p => { p.document.course.characters.push({ id: newId(), name: 'New character', role: '', poses: [] }); })) host.redraw(); }, { icon: Plus, class: 'btn btn-sm btn-primary', disabled: course.characters.length >= 30 })]),
    course.characters.length ? list : h('p', { class: 'hint', text: 'No characters yet.' }),
  ];
}

/* ---------- certificate ---------- */
function certificateTab(host: ResourcesHost): HTMLElement[] {
  const course = host.project().document.course, c = course.certificate;
  const offer = h('input', { attrs: { id: 'cert-on', type: 'checkbox' } }); offer.checked = !!c;
  offer.addEventListener('change', () => { if (host.edit(p => { p.document.course.certificate = offer.checked ? { title: 'Certificate of completion', issuer: p.document.course.author, signerName: '', signerTitle: '', logoId: null, signatureId: null, showScore: false } : null; })) host.redraw(); });
  const out: HTMLElement[] = [
    h('p', { text: 'A results block can print a certificate once a learner has finished every lesson (and passed, when the course is scored). It is printed from the learner\'s browser and is not verified by any service.' }),
    h('div', { class: 'chk' }, [offer, h('label', { text: 'Offer a certificate', attrs: { for: 'cert-on' } })]),
  ];
  if (!c) return out;
  const set = (change: (cert: NonNullable<typeof c>) => void, assets = false) => host.edit(p => { if (p.document.course.certificate) change(p.document.course.certificate); }, assets);
  const text = (id: string, label: string, value: string, apply: (cert: NonNullable<typeof c>, v: string) => void) => { const input = h('input', { class: 'inp', attrs: { id, maxlength: 300, value } }); input.addEventListener('input', () => { set(cert => apply(cert, input.value)); }); input.addEventListener('change', () => host.redraw()); return h('div', { class: 'fld' }, [h('label', { text: label, attrs: { for: id } }), input]); };
  const score = h('input', { attrs: { id: 'cert-score', type: 'checkbox' } }); score.checked = c.showScore; score.addEventListener('change', () => { set(cert => { cert.showScore = score.checked; }); host.redraw(); });
  const image = (label: string, current: string | null, apply: (cert: NonNullable<typeof c>, id: string | null) => void) => h('div', { class: 'fld' }, [h('span', { class: 'lbl', text: label }),
    current ? h('img', { class: 'insp-thumb', attrs: { src: host.assetSource(current), alt: '' } }) : null,
    h('div', { class: 'row' }, [button(current ? `Replace the ${label.toLowerCase()}` : `Upload a ${label.toLowerCase()}`, async () => { const file = await pickFile('.png,.jpg,.jpeg,.webp'); if (!file) return; try { const { asset, data } = await readImage(file, host.project()); if (host.edit(p => { p.document.assets.push(asset); p.files[assetPath(asset)] = data; if (p.document.course.certificate) apply(p.document.course.certificate, asset.id); }, true)) host.redraw(); } catch (error) { toast(error instanceof Error ? error.message : 'The image could not be added.'); } }, { icon: ImagePlus, class: 'btn btn-sm' }),
      current ? button(`Remove the ${label.toLowerCase()}`, () => { if (set(cert => apply(cert, null))) host.redraw(); }, { icon: Trash2, class: 'btn btn-sm' }) : null])]);
  const preview = h('div', { class: 'cert-preview', attrs: { 'aria-label': 'Certificate preview', role: 'img' } }, [
    c.logoId ? h('img', { attrs: { src: host.assetSource(c.logoId), alt: '' } }) : null,
    h('p', { class: 'cert-t', text: c.title || 'Certificate of completion' }), h('p', { text: 'This certifies that' }), h('p', { class: 'cert-n', text: 'Learner name' }),
    h('p', { text: 'has completed' }), h('p', { class: 'cert-c', text: course.title || 'the course' }), c.showScore ? h('p', { text: 'with a score of 90%' }) : null,
    c.signatureId ? h('img', { attrs: { src: host.assetSource(c.signatureId), alt: '' } }) : null,
    h('p', { class: 'cert-s', text: [c.signerName, c.signerTitle, c.issuer].filter(Boolean).join(' · ') }),
  ]);
  out.push(h('div', { class: 'cert-grid' }, [h('div', { class: 'cert-fields' }, [
    text('cert-title', 'Title', c.title, (cert, v) => { cert.title = v; }),
    text('cert-issuer', 'Issued by', c.issuer, (cert, v) => { cert.issuer = v; }),
    text('cert-signer', 'Signed by', c.signerName, (cert, v) => { cert.signerName = v; }),
    text('cert-signer-title', 'Signer\'s title', c.signerTitle, (cert, v) => { cert.signerTitle = v; }),
    h('div', { class: 'chk' }, [score, h('label', { text: 'Show the learner\'s score', attrs: { for: 'cert-score' } })]),
    image('Logo', c.logoId, (cert, id) => { cert.logoId = id; }),
    image('Signature image', c.signatureId, (cert, id) => { cert.signatureId = id; }),
  ]), preview]));
  return out;
}
