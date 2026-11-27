/**
 * Builds software practice steps from an OpenStage Capture take (openstage-core specs/capture): the screen
 * recording and its interaction log. Each left click becomes a step with a frame grabbed just before the click,
 * a target around the click, and an instruction from the clicked item's accessible name. Keys typed before the next
 * click become the step's typed text. Everything happens in this browser; window titles from the log are never used,
 * because they can hold private information.
 */
import type { Asset, PortableProject } from '../shared/course.js';
import { assetPath } from '../shared/course.js';
import { newId } from '../shared/outline.js';
import { readImage } from '../client/images.js';

export interface ImportedStep { id: string; imageId: string; alt: string; instruction: string; target: { x: number; y: number; w: number; h: number }; typed: string; hint: string }
interface Click { t: number; x: number; y: number; name?: string; role?: string; typed: string }
const MAX_STEPS = 60;
/** Plain words for the Windows accessibility roles the log records. */
const ROLE_WORDS: Record<string, string> = { edit: 'box', 'push button': 'button', 'check box': 'checkbox', 'combo box': 'list', 'list item': 'item', 'menu item': 'menu item', 'tab item': 'tab', 'radio button': 'option', text: 'text', hyperlink: 'link' };

/** Finds the newest finished take among the chosen files (a take folder or a whole .capture folder). */
async function chooseTake(files: File[]) {
  const takes = files.filter(f => /(^|\/)take\.json$/.test(f.webkitRelativePath || f.name));
  const parsed: { folder: string; take: Record<string, unknown> }[] = [];
  for (const file of takes) {
    try { parsed.push({ folder: (file.webkitRelativePath || file.name).replace(/take\.json$/, ''), take: JSON.parse(await file.text()) as Record<string, unknown> }); } catch { /* skip unreadable takes */ }
  }
  const usable = parsed.filter(p => ['complete', 'recovered'].includes(String(p.take.state)) && Array.isArray(p.take.media)).sort((a, b) => Number(b.take.id) - Number(a.take.id));
  if (!usable.length) throw new Error('Choose a Capture take folder (it holds take.json, screen.mp4 and events.jsonl) from a finished recording.');
  return usable[0]!;
}

export async function importCaptureTake(files: File[], project: PortableProject): Promise<{ steps: ImportedStep[]; assets: { asset: Asset; data: string }[]; notes: string[] }> {
  const { folder, take } = await chooseTake(files);
  const media = take.media as { file: string; kind: string; region?: { x: number; y: number } }[];
  const screen = media.find(m => m.kind === 'screen'), log = media.find(m => m.kind === 'interactions');
  const find = (name: string) => files.find(f => (f.webkitRelativePath || f.name) === `${folder}${name}` || f.name === name);
  if (!screen || !find(screen.file)) throw new Error('This take has no screen recording to take pictures from.');
  if (!log || !find(log.file)) throw new Error('This take was recorded without the interaction log. Turn on interaction recording in Capture to make practice steps.');
  const offset = screen.region ?? { x: 0, y: 0 };
  const clicks: Click[] = [];
  for (const line of (await find(log.file)!.text()).split('\n')) {
    let event: Record<string, unknown>;
    try { event = JSON.parse(line) as Record<string, unknown>; } catch { continue; }
    if (event.type === 'click' && event.button === 'left' && Number.isFinite(event.t) && Number.isFinite(event.x) && Number.isFinite(event.y)) clicks.push({ t: Number(event.t), x: Number(event.x) - offset.x, y: Number(event.y) - offset.y, typed: '' });
    else if (event.type === 'element' && clicks.at(-1)?.t === event.t) { const last = clicks.at(-1)!; last.name = String(event.name ?? '').slice(0, 120); last.role = String(event.role ?? '').slice(0, 40); }
    else if (event.type === 'key' && clicks.length) {
      const key = String(event.key ?? ''), modifiers = Array.isArray(event.modifiers) ? event.modifiers as string[] : [];
      if (modifiers.some(m => m !== 'shift')) continue;
      const char = key === 'space' ? ' ' : /^[a-z0-9]$/.test(key) ? (modifiers.includes('shift') ? key.toUpperCase() : key) : key === 'backspace' ? '\b' : '';
      const last = clicks.at(-1)!; last.typed = char === '\b' ? last.typed.slice(0, -1) : (last.typed + char).slice(0, 300);
    }
  }
  if (!clicks.length) throw new Error('The interaction log has no clicks to turn into steps.');
  const notes: string[] = [];
  if (clicks.length > MAX_STEPS) notes.push(`The recording has ${clicks.length} clicks; the first ${MAX_STEPS} became steps.`);
  const used = clicks.slice(0, MAX_STEPS);

  const video = document.createElement('video'), source = URL.createObjectURL(find(screen.file)!);
  video.muted = true; video.preload = 'auto'; video.src = source;
  try {
    await new Promise<void>((resolve, reject) => { video.onloadedmetadata = () => resolve(); video.onerror = () => reject(new Error('This browser cannot open the screen recording.')); });
    const width = video.videoWidth, height = video.videoHeight, scale = Math.min(1, 1600 / width);
    const canvas = document.createElement('canvas'); canvas.width = Math.round(width * scale); canvas.height = Math.round(height * scale);
    const context = canvas.getContext('2d')!;
    const shadow: PortableProject = { document: structuredClone(project.document), files: { ...project.files } };
    const steps: ImportedStep[] = [], assets: { asset: Asset; data: string }[] = [];
    for (const [index, click] of used.entries()) {
      video.currentTime = Math.max(0, click.t / 1000 - 0.15);
      await new Promise<void>(resolve => { video.onseeked = () => resolve(); });
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('A frame could not be saved.')), 'image/webp', 0.82));
      const image = await readImage(new File([blob], `step-${index + 1}.webp`, { type: 'image/webp' }), shadow);
      shadow.document.assets.push(image.asset); shadow.files[assetPath(image.asset)] = image.data; assets.push(image);
      const w = 8, h = 8 * width / height, x = Math.min(100 - w, Math.max(0, click.x / width * 100 - w / 2)), y = Math.min(100 - h, Math.max(0, click.y / height * 100 - h / 2));
      const role = click.role ? ROLE_WORDS[click.role] ?? click.role : '';
      const what = click.name ? (role ? `the ${click.name} ${role}` : `“${click.name}”`) : 'the highlighted place';
      steps.push({ id: newId(), imageId: image.asset.id, alt: `Screenshot for step ${index + 1}.`, instruction: `Select ${what}.`.slice(0, 300), target: { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10, w, h: Math.round(Math.min(h, 100) * 10) / 10 }, typed: click.typed.trim(), hint: click.name ? `Look for ${what}.`.slice(0, 300) : '' });
    }
    notes.push('Check each instruction and describe each screenshot: the recording names what was clicked but not why.');
    return { steps, assets, notes };
  } finally { URL.revokeObjectURL(source); }
}
