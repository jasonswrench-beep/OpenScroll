/**
 * Learner controls for video: audio description (a described version and timed description text read through a
 * polite live region), chapters, checkpoints that pause for a question or a note, and no skipping ahead. Also the
 * click-to-load facade for embedded YouTube and Vimeo video, which loads nothing from the host until play.
 */
import type { Block } from '../shared/course.js';
import { richToDom, richIsEmpty } from '../shared/rich-text.js';
import { clock } from '../shared/wave-a-renderer.js';
import type { CourseFlow } from './state.js';

type Video = Extract<Block, { type: 'video' }>;
type Embed = Extract<Block, { type: 'embed-video' }>;
function node<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (cls) el.className = cls;
  return el;
}
function toggle(label: string, on: boolean, change: (on: boolean) => void) {
  const b = node('button', label, 'media-toggle'); b.type = 'button'; b.setAttribute('aria-pressed', String(on));
  b.addEventListener('click', () => { const next = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(next)); change(next); });
  return b;
}

export function enhanceVideo(block: Video, root: HTMLElement, flow: CourseFlow, url: (assetId: string) => string, focusQuestion: (id: string) => void) {
  const video = root.querySelector<HTMLVideoElement>('video');
  if (!video) return;
  const c = block.content, tools = node('div', undefined, 'media-tools'), panel = node('div', undefined, 'media-panel');
  panel.setAttribute('role', 'status'); panel.setAttribute('aria-live', 'polite');
  const say = (...children: (Node | string)[]) => { panel.replaceChildren(...children); panel.hidden = !children.length; };
  panel.hidden = true;
  video.after(tools, panel);

  // Described version: swaps the source and keeps the place.
  if (c.describedAssetId) tools.append(toggle('Audio described version', false, on => {
    const time = video.currentTime, playing = !video.paused;
    video.src = url(on ? c.describedAssetId! : c.assetId!); video.currentTime = time;
    if (playing) void video.play().catch(() => undefined);
    say(on ? 'Playing the audio described version.' : 'Playing the standard version.');
  }));

  // Timed descriptions, announced politely; optionally the video waits while they are read.
  let describe = false, lastCue = -1;
  if (c.descriptions.length) tools.append(toggle('Read descriptions', false, on => { describe = on; lastCue = -1; say(on ? 'Descriptions will appear and be announced as the video plays.' : ''); }));

  // No skipping ahead: learners can go back, but not beyond the furthest point they have watched.
  let furthest = 0;
  if (c.noSkipAhead) {
    video.addEventListener('timeupdate', () => { if (!video.seeking) furthest = Math.max(furthest, video.currentTime); });
    video.addEventListener('seeking', () => { if (video.currentTime > furthest + 0.75) { video.currentTime = furthest; say('This video does not allow skipping ahead.'); } });
  }

  // Chapters and checkpoints, also listed for learners who don't use the video controls.
  const passed = new Set<string>();
  const seek = (time: number) => { video.currentTime = c.noSkipAhead ? Math.min(time, furthest) : time; video.focus(); };
  const marks = root.querySelector<HTMLElement>(`[data-marks="${block.id}"]`);
  if (marks) {
    marks.replaceChildren();
    const items = [...c.chapters.map(chapter => ({ time: chapter.time, label: `Chapter: ${chapter.title}`, go: () => seek(chapter.time) })),
      ...c.checkpoints.map(point => ({ time: point.time, label: point.kind === 'question' ? 'Question' : `Note: ${point.title}`, go: () => point.kind === 'question' && point.questionId ? focusQuestion(point.questionId) : seek(point.time) }))].sort((a, b) => a.time - b.time);
    for (const item of items) { const li = node('li'), b = node('button', `${clock(item.time)} ${item.label}`); b.type = 'button'; b.addEventListener('click', item.go); li.append(b); marks.append(li); }
  }
  const resume = () => { const b = node('button', 'Continue the video'); b.type = 'button'; b.addEventListener('click', () => { say(); void video.play().catch(() => undefined); video.focus(); }); return b; };

  video.addEventListener('timeupdate', () => {
    const now = video.currentTime;
    if (describe) {
      const index = c.descriptions.findIndex(cue => now >= cue.start && now < cue.end);
      if (index >= 0 && index !== lastCue) {
        lastCue = index; const text = node('p', c.descriptions[index]!.text, 'media-description');
        if (c.pauseForDescriptions) { video.pause(); say(text, resume()); } else say(text);
      }
    }
    for (const point of c.checkpoints) {
      if (passed.has(point.id) || now < point.time || now > point.time + 1.5) continue;
      passed.add(point.id);
      if (point.kind === 'question') {
        if (!point.questionId || flow.record(point.questionId)?.last) continue; // already answered
        video.pause();
        const go = node('button', 'Go to the question'); go.type = 'button'; go.addEventListener('click', () => focusQuestion(point.questionId!));
        say(node('p', 'Checkpoint: answer the question below the video, then continue the video.'), go, resume());
        go.focus();
      } else {
        video.pause();
        const note = node('div', undefined, 'os-rich'); if (!richIsEmpty(point.note)) note.append(richToDom(point.note));
        const heading = node('h4', point.title || 'Note');
        const next = resume(); say(heading, note, next); next.focus();
      }
    }
  });
}

/** The embedded-video facade: a button that loads the privacy-enhanced player only when pressed. */
export function enhanceEmbed(block: Embed, root: HTMLElement, preview: boolean) {
  const facade = root.querySelector<HTMLElement>(`[data-embed="${block.id}"]`), c = block.content;
  if (!facade || !c.videoId) return;
  const host = c.provider === 'youtube' ? 'YouTube' : 'Vimeo';
  if (preview) { facade.replaceChildren(node('p', `This video plays from ${host} in the exported course. The preview does not load outside services.`, 'os-embed-note')); return; }
  const play = node('button', `Play “${c.title || 'the video'}” from ${host}`, 'media-play'); play.type = 'button';
  const note = node('p', `${host} may set cookies and record that you watched once the video loads. Read the transcript below instead if you prefer.`, 'os-embed-note');
  play.addEventListener('click', () => {
    const frame = node('iframe');
    frame.title = c.title || `Video from ${host}`;
    frame.allow = 'autoplay; fullscreen; picture-in-picture';
    frame.referrerPolicy = 'strict-origin-when-cross-origin';
    frame.src = c.provider === 'youtube'
      ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(c.videoId)}?autoplay=1&rel=0${c.start ? `&start=${c.start}` : ''}`
      : `https://player.vimeo.com/video/${encodeURIComponent(c.videoId)}?autoplay=1&dnt=1${c.start ? `#t=${c.start}s` : ''}`;
    const box = node('div', undefined, 'media-embed'); box.append(frame);
    facade.replaceChildren(box); frame.focus();
  });
  facade.replaceChildren(play, note);
}
