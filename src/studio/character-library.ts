/**
 * The character and background packs from OpenStage Author, served from public/character-packs (owner decision of
 * 2026-11-26: reuse Author's packs). Choosing a person or a background copies its pictures into the course like an
 * upload, so a published course needs nothing from the library. Each pose keeps the pack's description for screen
 * readers; authors can edit it afterwards like any other.
 */
import { assetPath, type Asset, type PortableProject } from '../shared/course.js';
import { newId } from '../shared/outline.js';
import { readImage } from '../client/images.js';
import { h, button, openDialog } from './dom.js';

const ROOT = '/character-packs/';
const PEOPLE = 'openstage-people-1', PLACES = 'openstage-offices-1';
/** The most poses one character can have (course format). */
const MAX_POSES = 20;
export const LIBRARY_CREDIT = 'Pictures by Jason S. Wrench, made with an AI picture service from written descriptions. Apache License 2.0.';

interface PackPose { id: string; file: string; label: string; alt: string }
interface PackPerson { id: string; name: string; role: string; alt: string; head: string; poses: PackPose[] }
interface PackPlace { id: string; name: string; group: string; alt: string; file: string }
export interface LibraryCharacter { name: string; role: string; poses: { name: string; alt: string; asset: Asset; data: string }[] }

const text = (value: unknown, max: number) => typeof value === 'string' && value.length <= max ? value : undefined;
const picturePath = (value: unknown) => typeof value === 'string' && /^[a-z0-9-]+(\/[a-z0-9-]+)*\.webp$/.test(value) ? value : undefined;

const packs = new Map<string, Promise<unknown>>();
function loadPack(pack: string) {
  let loading = packs.get(pack);
  if (!loading) {
    loading = fetch(`${ROOT}${pack}/pack.json`, { credentials: 'same-origin' }).then(response => { if (!response.ok) throw new Error(); return response.json(); });
    loading.catch(() => packs.delete(pack));
    packs.set(pack, loading);
  }
  return loading.catch(() => { throw new Error('The picture library could not be loaded. Check your connection and try again.'); });
}
async function people(): Promise<PackPerson[]> {
  const pack = await loadPack(PEOPLE) as { people?: unknown[] };
  return (pack.people ?? []).flatMap(value => {
    const p = value as Record<string, unknown>, id = text(p.id, 64), name = text(p.name, 300), head = picturePath(p.head);
    if (!id || !name || !head || !Array.isArray(p.poses)) return [];
    const poses = p.poses.flatMap(v => { const pose = v as Record<string, unknown>, file = picturePath(pose.file), poseId = text(pose.id, 64), label = text(pose.label, 300), alt = text(pose.alt, 2000); return file && poseId && label && alt ? [{ id: poseId, file, label, alt }] : []; });
    return poses.length ? [{ id, name, role: text(p.role, 300) ?? '', alt: text(p.alt, 2000) ?? '', head, poses }] : [];
  });
}
async function places(): Promise<PackPlace[]> {
  const pack = await loadPack(PLACES) as { backgrounds?: unknown[] };
  return (pack.backgrounds ?? []).flatMap(value => {
    const b = value as Record<string, unknown>, id = text(b.id, 64), name = text(b.name, 300), group = text(b.group, 300), alt = text(b.alt, 2000), file = picturePath(b.file);
    return id && name && group && alt && file ? [{ id, name, group, alt, file }] : [];
  });
}
/** Reads a library picture into a course asset, checked like an upload against the course with `added` already in it. */
async function picture(project: PortableProject, pack: string, file: string, name: string, added: Asset[]) {
  const response = await fetch(`${ROOT}${pack}/${file}`, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('A picture from the library could not be loaded. Try again.');
  const pending = { ...project, document: { ...project.document, assets: [...project.document.assets, ...added] } };
  return readImage(new File([await response.blob()], name, { type: 'image/webp' }), pending);
}
/** The poses offered first: one of each kind (no numbered variants), up to the format's limit. */
const firstChoice = (person: PackPerson) => new Set(person.poses.filter(p => !/-\d+$/.test(p.id)).slice(0, MAX_POSES).map(p => p.id));

/** Choose a person and their poses. Resolves with the pictures read as course assets, or undefined if cancelled. */
export function chooseLibraryCharacter(project: () => PortableProject, opener: HTMLElement): Promise<LibraryCharacter | undefined> {
  return new Promise(resolve => {
    let settled = false, person: PackPerson | undefined, chosen = new Set<string>();
    const finish = (value?: LibraryCharacter) => { if (!settled) { settled = true; resolve(value); } };
    const area = h('div', { class: 'lib-area' });
    const view = openDialog({ title: 'Choose a character from the library', opener, wide: true, body: [
      h('p', { text: 'People in everyday work clothes, each in many poses. Choose a person, then the poses you need. The pictures are copied into this course, with a description of each pose for screen readers.' }),
      h('p', { class: 'hint', text: LIBRARY_CREDIT }),
      area,
    ], onClose: () => finish() });
    const showPeople = async () => {
      area.replaceChildren(h('p', { class: 'hint', text: 'Loading the library…' }));
      try {
        const list = await people();
        area.replaceChildren(h('ul', { class: 'lib-grid lib-people', attrs: { 'aria-label': 'People' } }, list.map(p => {
          const pick = button(`${p.name}, ${p.poses.length} poses`, () => showPoses(p), { class: 'lib-pick' });
          pick.prepend(h('img', { attrs: { src: `${ROOT}${PEOPLE}/${p.head}`, alt: '', loading: 'lazy', width: 96, height: 96 } }));
          return h('li', {}, [pick]);
        })));
        area.querySelector<HTMLButtonElement>('.lib-pick')?.focus();
      } catch (error) { area.replaceChildren(h('p', { class: 'hint', text: (error as Error).message })); }
    };
    const showPoses = (p: PackPerson) => {
      person = p; chosen = firstChoice(p);
      const count = h('p', { class: 'hint', attrs: { 'aria-live': 'polite' } });
      const add = button('', () => void addChosen(), { class: 'btn btn-primary' });
      const boxes: HTMLInputElement[] = [];
      const refresh = () => {
        count.textContent = `${chosen.size} of ${Math.min(MAX_POSES, p.poses.length)} poses chosen${p.poses.length > MAX_POSES ? ` (a character can have up to ${MAX_POSES})` : ''}.`;
        add.textContent = chosen.size ? `Add ${p.name} with ${chosen.size} ${chosen.size === 1 ? 'pose' : 'poses'}` : 'Choose at least one pose';
        add.disabled = !chosen.size;
        for (const box of boxes) box.disabled = !box.checked && chosen.size >= MAX_POSES;
      };
      const poses = h('ul', { class: 'lib-grid lib-poses' }, p.poses.map(pose => {
        const box = h('input', { attrs: { type: 'checkbox', id: `lib-pose-${pose.id}` } }) as HTMLInputElement; box.checked = chosen.has(pose.id); boxes.push(box);
        box.addEventListener('change', () => { if (box.checked) chosen.add(pose.id); else chosen.delete(pose.id); refresh(); });
        return h('li', {}, [h('label', { class: 'lib-pose', attrs: { for: box.id } }, [box, h('img', { attrs: { src: `${ROOT}${PEOPLE}/${pose.file}`, alt: '', loading: 'lazy', width: 96, height: 128 } }), h('span', { text: pose.label })])]);
      }));
      area.replaceChildren(
        h('h3', { class: 'lib-name', text: p.name, attrs: { tabindex: -1 } }),
        h('p', { class: 'hint', text: p.alt }),
        h('fieldset', { class: 'lib-set' }, [h('legend', { text: `Poses for ${p.name}` }), poses]),
        count,
        h('div', { class: 'row' }, [button('Back to all people', () => void showPeople(), { class: 'btn' }), add]),
      );
      refresh();
      area.querySelector<HTMLElement>('.lib-name')?.focus();
    };
    const addChosen = async () => {
      if (!person || !chosen.size) return;
      const target = person, picked = target.poses.filter(pose => chosen.has(pose.id)), added: Asset[] = [], result: LibraryCharacter = { name: target.name, role: target.role, poses: [] };
      view.status.textContent = `Adding ${target.name}…`;
      area.querySelectorAll<HTMLButtonElement | HTMLInputElement>('button, input').forEach(control => { control.disabled = true; });
      try {
        for (const pose of picked) {
          const { asset, data } = await picture(project(), PEOPLE, pose.file, `${target.id}-${pose.id}.webp`, added);
          added.push(asset); result.poses.push({ name: pose.label, alt: pose.alt, asset, data });
        }
        finish(result); view.close();
      } catch (error) {
        view.status.textContent = error instanceof Error ? error.message : 'The pictures could not be added.';
        showPoses(target);
      }
    };
    void showPeople();
  });
}

/** Choose a background for a scenario scene. Resolves with the picture read as a course asset, or undefined if cancelled. */
export function chooseLibraryBackground(project: () => PortableProject, opener: HTMLElement): Promise<{ asset: Asset; data: string } | undefined> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (value?: { asset: Asset; data: string }) => { if (!settled) { settled = true; resolve(value); } };
    const area = h('div', { class: 'lib-area' }, [h('p', { class: 'hint', text: 'Loading the library…' })]);
    const view = openDialog({ title: 'Choose a background from the library', opener, wide: true, body: [
      h('p', { text: 'Empty offices and workplaces, ready for the characters to stand in. The picture is copied into this course.' }),
      h('p', { class: 'hint', text: LIBRARY_CREDIT }),
      area,
    ], onClose: () => finish() });
    void (async () => {
      try {
        const list = await places(), groups = [...new Set(list.map(p => p.group))];
        area.replaceChildren(...groups.map(group => h('section', { class: 'lib-group' }, [
          h('h3', { text: group }),
          h('ul', { class: 'lib-grid lib-places' }, list.filter(p => p.group === group).map(place => {
            const pick = button(place.name, async () => {
              area.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = true; });
              view.status.textContent = `Adding ${place.name}…`;
              try { finish(await picture(project(), PLACES, place.file, `${place.id}.webp`, [])); view.close(); }
              catch (error) { view.status.textContent = error instanceof Error ? error.message : 'The picture could not be added.'; area.querySelectorAll<HTMLButtonElement>('button').forEach(b => { b.disabled = false; }); pick.focus(); }
            }, { class: 'lib-pick' });
            pick.prepend(h('img', { attrs: { src: `${ROOT}${PLACES}/${place.file}`, alt: '', loading: 'lazy', width: 160, height: 90 } }));
            return h('li', {}, [pick]);
          })),
        ])));
        area.querySelector<HTMLButtonElement>('.lib-pick')?.focus();
      } catch (error) { area.replaceChildren(h('p', { class: 'hint', text: (error as Error).message })); }
    })();
  });
}

/** Adds a chosen library character to the course: its pictures as assets, its poses with the pack's descriptions. */
export function addLibraryCharacter(project: PortableProject, character: LibraryCharacter) {
  for (const pose of character.poses) { project.document.assets.push(pose.asset); project.files[assetPath(pose.asset)] = pose.data; }
  project.document.course.characters.push({ id: newId(), name: character.name, role: character.role, poses: character.poses.map(pose => ({ id: newId(), name: pose.name, imageId: pose.asset.id, alt: pose.alt })) });
}
