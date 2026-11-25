/**
 * The region editor (foundation F4): places points or rectangles on an image. Every region is a real button that
 * can be dragged with a pointer or moved with the arrow keys (Shift moves further; Alt with arrows resizes a
 * rectangle), and the selected region also has number fields. Positions are percentages of the image, so they
 * survive any display size. Changes are reported once a move ends, so each move is one undo step.
 */
import { h } from './dom.js';

export interface Region { x: number; y: number; w?: number; h?: number; label: string }
export interface RegionEditorOptions {
  src: string; alt: string; regions: Region[]; shape: 'point' | 'rect'; selected: number; name: string;
  change: (index: number, region: Region) => void; select: (index: number) => void;
}
const clamp = (value: number, min = 0, max = 100) => Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;

export function regionEditor(options: RegionEditorOptions): HTMLElement {
  const regions = options.regions.map(r => ({ ...r }));
  let selected = Math.min(Math.max(0, options.selected), regions.length - 1);
  const image = h('img', { attrs: { src: options.src, alt: options.alt || '', draggable: 'false' } });
  const stage = h('div', { class: 'region-stage' }, [image]);
  const fields = h('div', { class: 'region-fields' });
  const help = h('p', { class: 'hint', attrs: { id: `region-help-${options.name}` }, text: options.shape === 'rect' ? 'Drag an area, or select it and use the arrow keys to move it. Hold Shift to move further, Alt to change its size.' : 'Drag a marker, or select it and use the arrow keys to move it. Hold Shift to move further.' });
  const status = h('p', { class: 'sr-only', attrs: { role: 'status' } });
  const handles: HTMLButtonElement[] = [];

  const place = (index: number) => {
    const r = regions[index]!, handle = handles[index]!;
    handle.style.left = `${r.x}%`; handle.style.top = `${r.y}%`;
    if (options.shape === 'rect') { handle.style.width = `${r.w ?? 10}%`; handle.style.height = `${r.h ?? 10}%`; }
    handle.setAttribute('aria-label', `${options.shape === 'rect' ? 'Area' : 'Marker'} ${index + 1}: ${r.label || 'no label'}. ${describe(r)}`);
  };
  const describe = (r: Region) => options.shape === 'rect' ? `Left ${r.x}%, top ${r.y}%, width ${r.w ?? 10}%, height ${r.h ?? 10}%.` : `${r.x}% across, ${r.y}% down.`;
  const commit = (index: number) => { options.change(index, { ...regions[index]! }); status.textContent = describe(regions[index]!); drawFields(); };
  const choose = (index: number, focus = false) => {
    selected = index;
    handles.forEach((handle, i) => { handle.classList.toggle('is-selected', i === index); handle.setAttribute('aria-pressed', String(i === index)); });
    drawFields(); options.select(index);
    if (focus) handles[index]?.focus();
  };
  const fit = (r: Region) => {
    if (options.shape === 'rect') { r.w = clamp(r.w ?? 10, 2, 100); r.h = clamp(r.h ?? 10, 2, 100); r.x = clamp(r.x, 0, 100 - r.w); r.y = clamp(r.y, 0, 100 - r.h); }
    else { r.x = clamp(r.x); r.y = clamp(r.y); }
  };

  regions.forEach((region, index) => {
    const handle = h('button', { class: `region region-${options.shape}`, attrs: { type: 'button', 'aria-describedby': help.id }, text: String(index + 1) });
    handles.push(handle);
    handle.addEventListener('click', () => choose(index));
    handle.addEventListener('keydown', event => {
      const step = event.shiftKey ? 5 : 1, r = regions[index]!;
      const dx = event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, dy = event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0;
      if (!dx && !dy) return;
      event.preventDefault();
      if (event.altKey && options.shape === 'rect') { r.w = (r.w ?? 10) + dx; r.h = (r.h ?? 10) + dy; } else { r.x += dx; r.y += dy; }
      fit(r); place(index); if (selected !== index) choose(index); commit(index);
    });
    handle.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault(); choose(index); handle.focus(); handle.setPointerCapture(event.pointerId);
      const box = stage.getBoundingClientRect(), r = regions[index]!, startX = event.clientX, startY = event.clientY, fromX = r.x, fromY = r.y;
      const resizing = options.shape === 'rect' && (event.target as HTMLElement).classList.contains('region-grip');
      const fromW = r.w ?? 10, fromH = r.h ?? 10;
      let moved = false;
      const move = (e: PointerEvent) => {
        const dx = (e.clientX - startX) / box.width * 100, dy = (e.clientY - startY) / box.height * 100;
        if (Math.abs(dx) + Math.abs(dy) > 0.2) moved = true;
        if (resizing) { r.w = fromW + dx; r.h = fromH + dy; } else { r.x = fromX + dx; r.y = fromY + dy; }
        fit(r); place(index);
      };
      const end = () => { handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', end); handle.removeEventListener('pointercancel', end); if (moved) commit(index); };
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', end); handle.addEventListener('pointercancel', end);
    });
    if (options.shape === 'rect') handle.append(h('span', { class: 'region-grip', attrs: { 'aria-hidden': 'true' } }));
    stage.append(handle); place(index);
  });

  function drawFields() {
    const r = regions[selected];
    if (!r) { fields.replaceChildren(); return; }
    const number = (label: string, key: 'x' | 'y' | 'w' | 'h') => {
      const input = h('input', { class: 'inp', attrs: { type: 'number', min: 0, max: 100, step: 0.5, value: r[key] ?? 10, inputmode: 'decimal' } });
      input.addEventListener('change', () => { const value = Number(input.value); if (!Number.isFinite(value)) return; r[key] = value; fit(r); place(selected); commit(selected); });
      return h('label', { class: 'fld fld-num' }, [h('span', { text: label }), input]);
    };
    fields.replaceChildren(h('p', { class: 'region-which', text: `${options.shape === 'rect' ? 'Area' : 'Marker'} ${selected + 1}${r.label ? `: ${r.label}` : ''}` }),
      number(options.shape === 'rect' ? 'Left (%)' : 'Across (%)', 'x'), number(options.shape === 'rect' ? 'Top (%)' : 'Down (%)', 'y'),
      ...(options.shape === 'rect' ? [number('Width (%)', 'w'), number('Height (%)', 'h')] : []));
  }
  choose(selected);
  return h('div', { class: 'region-editor' }, [stage, help, fields, status]);
}
