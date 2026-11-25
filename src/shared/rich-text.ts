/**
 * Rich text for schema 4: a small, canonical HTML subset.
 *
 * Grammar of a canonical value:
 *   ''                         empty
 *   Inline+                    one paragraph, stored without a <p> wrapper (so plain text stays plain)
 *   Block+                     anything else
 *   Block  := <p>Inline+</p> | <h3>Inline+</h3> | <h4>Inline+</h4> | List
 *   List   := <ul>Item+</ul> | <ol>Item+</ol> | <ol start="N">Item+</ol>   (N >= 2)
 *   Item   := <li>Inline* List?</li>                                       (lists nest at most 3 deep)
 *   Inline := text | <strong>Inline+</strong> | <em>Inline+</em> | <a href="https://…">Inline+</a> | <br>
 *
 * Text escapes only &, < and >; attribute values also escape ". Whitespace runs collapse to one space.
 * `sanitizeRich` accepts arbitrary HTML (pasted or imported) and returns the canonical form; a stored value is
 * valid only when it is already canonical. Rendering never uses innerHTML: `richToDom` builds elements.
 */
import { safeLink } from './links.js';

export const RICH_TEXT_MAX = 100_000;
type Mark = 'strong' | 'em';
export type InlineNode = { kind: 'text'; text: string } | { kind: 'br' } | { kind: Mark; children: InlineNode[] } | { kind: 'a'; href: string; children: InlineNode[] };
export type ListNode = { kind: 'ul' | 'ol'; start?: number; items: ItemNode[] };
export type ItemNode = { inline: InlineNode[]; list?: ListNode };
export type TextBlockNode = { kind: 'p' | 'h3' | 'h4'; children: InlineNode[] };
export type BlockNode = TextBlockNode | ListNode;
const isList = (block: BlockNode): block is ListNode => block.kind === 'ul' || block.kind === 'ol';

/* ---------- lenient tokenizer and tree builder ---------- */
interface RawElement { tag: string; attrs: Record<string, string>; children: RawNode[]; }
type RawNode = RawElement | string;
const VOID = new Set(['br', 'hr', 'img', 'input', 'meta', 'link', 'col', 'area', 'base', 'wbr', 'source', 'track', 'embed', 'param']);
const SKIP_CONTENT = new Set(['script', 'style', 'template', 'noscript', 'iframe', 'object', 'svg', 'math', 'title', 'textarea', 'select', 'button']);
const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', mdash: '—', ndash: '–', hellip: '…', rsquo: '’', lsquo: '‘',
  rdquo: '”', ldquo: '“', copy: '©', reg: '®', trade: '™', bull: '•', middot: '·', laquo: '«', raquo: '»', shy: '',
  times: '×', divide: '÷', deg: '°', eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', ntilde: 'ñ', uuml: 'ü', ouml: 'ö', auml: 'ä', ccedil: 'ç', iacute: 'í', oacute: 'ó', uacute: 'ú',
};
export function decodeEntities(value: string) {
  return value.replace(/&(#x[0-9a-f]{1,6}|#[0-9]{1,7}|[a-z][a-z0-9]{1,31});/gi, (match, body: string) => {
    if (body[0] === '#') {
      const code = body[1] === 'x' || body[1] === 'X' ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff || (code >= 0xd800 && code <= 0xdfff)) return '�';
      return String.fromCodePoint(code);
    }
    const named = ENTITIES[body.toLowerCase()];
    return named === undefined ? match : named;
  });
}
function parseAttributes(source: string) {
  const attrs: Record<string, string> = {};
  const pattern = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source))) {
    const name = match[1]!.toLowerCase();
    if (!(name in attrs)) attrs[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return attrs;
}
const CLOSE_TAG = /<\/([a-zA-Z][a-zA-Z0-9-]*)\s*>/y;
const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'<>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*(\/?)>/y;
function buildTree(html: string): RawElement {
  const root: RawElement = { tag: '#root', attrs: {}, children: [] };
  const stack: RawElement[] = [root];
  const top = () => stack[stack.length - 1]!;
  const lower = html.toLowerCase();
  let i = 0;
  while (i < html.length) {
    const lt = html.indexOf('<', i);
    if (lt === -1) { top().children.push(decodeEntities(html.slice(i))); break; }
    if (lt > i) top().children.push(decodeEntities(html.slice(i, lt)));
    if (html.startsWith('<!--', lt)) { const end = html.indexOf('-->', lt + 4); i = end === -1 ? html.length : end + 3; continue; }
    if (html.startsWith('<![CDATA[', lt) || html.startsWith('<!', lt) || html.startsWith('<?', lt)) { const end = html.indexOf('>', lt + 2); i = end === -1 ? html.length : end + 1; continue; }
    CLOSE_TAG.lastIndex = lt;
    const close = CLOSE_TAG.exec(html);
    if (close) {
      const tag = close[1]!.toLowerCase();
      const at = stack.map(e => e.tag).lastIndexOf(tag);
      if (at > 0) stack.length = at;
      i = lt + close[0].length;
      continue;
    }
    OPEN_TAG.lastIndex = lt;
    const open = OPEN_TAG.exec(html);
    if (open) {
      const tag = open[1]!.toLowerCase();
      i = lt + open[0].length;
      if (SKIP_CONTENT.has(tag)) {
        const end = lower.indexOf(`</${tag}`, i);
        if (end === -1) { i = html.length; continue; }
        const gt = html.indexOf('>', end);
        i = gt === -1 ? html.length : gt + 1;
        continue;
      }
      if (tag === 'p' || /^h[1-6]$/.test(tag)) {
        const at = stack.map(e => e.tag).lastIndexOf('p');
        if (at > 0) stack.length = at;
      }
      if (tag === 'li') {
        const at = stack.map(e => e.tag).lastIndexOf('li');
        const list = Math.max(stack.map(e => e.tag).lastIndexOf('ul'), stack.map(e => e.tag).lastIndexOf('ol'));
        if (at > 0 && at > list) stack.length = at;
      }
      const element: RawElement = { tag, attrs: parseAttributes(open[2] ?? ''), children: [] };
      top().children.push(element);
      if (!VOID.has(tag) && !open[3]) stack.push(element);
      continue;
    }
    top().children.push('<');
    i = lt + 1;
  }
  return root;
}

/* ---------- normalization to the canonical tree ---------- */
const BLOCKISH = new Set(['p', 'div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'blockquote', 'figure', 'figcaption', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'dl', 'dt', 'dd', 'pre', 'address', 'hr', 'nav', 'details', 'summary', 'center', 'form', 'fieldset']);
const MAX_LIST_DEPTH = 3;
function headingKind(tag: string): 'h3' | 'h4' | undefined {
  if (tag === 'h1' || tag === 'h2' || tag === 'h3') return 'h3';
  if (tag === 'h4' || tag === 'h5' || tag === 'h6') return 'h4';
  return undefined;
}
function markOf(tag: string): Mark | undefined {
  if (tag === 'strong' || tag === 'b') return 'strong';
  if (tag === 'em' || tag === 'i') return 'em';
  return undefined;
}
function inlineFrom(nodes: RawNode[], marks: Set<Mark>, inLink: boolean): InlineNode[] {
  const out: InlineNode[] = [];
  for (const node of nodes) {
    if (typeof node === 'string') { out.push({ kind: 'text', text: node }); continue; }
    if (node.tag === 'br') { out.push({ kind: 'br' }); continue; }
    const mark = markOf(node.tag);
    if (mark) {
      if (marks.has(mark)) { out.push(...inlineFrom(node.children, marks, inLink)); continue; }
      const children = inlineFrom(node.children, new Set([...marks, mark]), inLink);
      out.push({ kind: mark, children });
      continue;
    }
    if (node.tag === 'a') {
      const href = (node.attrs.href ?? '').trim();
      const children = inlineFrom(node.children, marks, true);
      if (!inLink && safeLink(href) && href !== '') out.push({ kind: 'a', href, children });
      else out.push(...children);
      continue;
    }
    if (node.tag === 'img' || node.tag === 'hr') continue;
    // Any other element (span, u, code, block elements met inside inline content) contributes its content.
    const inner = inlineFrom(node.children, marks, inLink);
    if (BLOCKISH.has(node.tag) && out.length) out.push({ kind: 'text', text: ' ' });
    out.push(...inner);
    if (BLOCKISH.has(node.tag)) out.push({ kind: 'text', text: ' ' });
  }
  return out;
}
/** Collapse whitespace, drop empty marks, merge neighbors, and trim the edges of one inline run. */
function tidyInline(nodes: InlineNode[]): InlineNode[] {
  const walk = (list: InlineNode[]): InlineNode[] => {
    const result: InlineNode[] = [];
    for (const node of list) {
      if (node.kind === 'text') {
        const text = node.text.replace(/[\u0000-\u0008\u000b\u000e-\u001f\u007f]/g, '').replace(/[ \t\n\r\f]+/g, ' ');
        if (!text) continue;
        const last = result[result.length - 1];
        if (last?.kind === 'text') last.text += text; else result.push({ kind: 'text', text });
        continue;
      }
      if (node.kind === 'br') { result.push(node); continue; }
      const children = walk(node.children);
      if (!children.length) continue;
      const last = result[result.length - 1];
      if (last && last.kind === node.kind && (node.kind !== 'a' || (last as { href: string }).href === (node as { href: string }).href)) {
        (last as { children: InlineNode[] }).children = walk([...(last as { children: InlineNode[] }).children, ...children]);
        continue;
      }
      result.push({ ...node, children } as InlineNode);
    }
    return result;
  };
  let result = walk(nodes);
  // Spaces never collapse across element boundaries in our canonical form: a space ending one text node and
  // starting the next becomes one space.
  const flatten = (list: InlineNode[], previous: { last: string }) => {
    for (const node of list) {
      if (node.kind === 'text') {
        if (previous.last === ' ' && node.text.startsWith(' ')) node.text = node.text.slice(1);
        if (node.text) previous.last = node.text.slice(-1);
      } else if (node.kind === 'br') previous.last = ' ';
      else flatten(node.children, previous);
    }
  };
  flatten(result, { last: ' ' });
  result = walk(result);
  const trimEdge = (list: InlineNode[], end: boolean): InlineNode[] => {
    const copy = [...list];
    while (copy.length) {
      const node = end ? copy[copy.length - 1]! : copy[0]!;
      if (node.kind === 'br') { if (end) copy.pop(); else copy.shift(); continue; }
      if (node.kind === 'text') {
        const text = end ? node.text.replace(/ +$/, '') : node.text.replace(/^ +/, '');
        if (!text) { if (end) copy.pop(); else copy.shift(); continue; }
        if (end) copy[copy.length - 1] = { kind: 'text', text }; else copy[0] = { kind: 'text', text };
        break;
      }
      const children = trimEdge(node.children, end);
      if (!children.length) { if (end) copy.pop(); else copy.shift(); continue; }
      if (end) copy[copy.length - 1] = { ...node, children } as InlineNode; else copy[0] = { ...node, children } as InlineNode;
      break;
    }
    return copy;
  };
  // Remove spaces directly before or after a line break.
  const aroundBreaks = (list: InlineNode[]) => {
    for (let i = 0; i < list.length; i++) {
      const node = list[i]!;
      if (node.kind === 'br') {
        const before = list[i - 1], after = list[i + 1];
        if (before?.kind === 'text') before.text = before.text.replace(/ +$/, '');
        if (after?.kind === 'text') after.text = after.text.replace(/^ +/, '');
      } else if (node.kind !== 'text') aroundBreaks(node.children);
    }
  };
  aroundBreaks(result);
  result = walk(result);
  return trimEdge(trimEdge(result, false), true);
}
function listFrom(node: RawElement, depth: number): ListNode | undefined {
  const kind = node.tag === 'ol' ? 'ol' : 'ul';
  const items: ItemNode[] = [];
  const looseInline: RawNode[] = [];
  const flushLoose = () => { if (looseInline.length) { const inline = tidyInline(inlineFrom(looseInline.splice(0), new Set(), false)); if (inline.length) items.push({ inline }); } };
  for (const child of node.children) {
    if (typeof child !== 'string' && child.tag === 'li') { flushLoose(); const item = itemFrom(child, depth); if (item) items.push(item); }
    else if (typeof child !== 'string' && (child.tag === 'ul' || child.tag === 'ol')) {
      flushLoose();
      const nested = depth < MAX_LIST_DEPTH ? listFrom(child, depth + 1) : undefined;
      if (nested && items.length && !items[items.length - 1]!.list) items[items.length - 1]!.list = nested;
      else if (nested) items.push(...nested.items);
    } else looseInline.push(child);
  }
  flushLoose();
  if (!items.length) return undefined;
  const start = kind === 'ol' ? Number.parseInt(node.attrs.start ?? '', 10) : NaN;
  return Number.isInteger(start) && start >= 2 && start <= 1_000_000 ? { kind, start, items } : { kind, items };
}
function itemFrom(node: RawElement, depth: number): ItemNode | undefined {
  const inlineParts: RawNode[] = [];
  let list: ListNode | undefined;
  const collect = (children: RawNode[]) => {
    for (const child of children) {
      if (typeof child !== 'string' && (child.tag === 'ul' || child.tag === 'ol')) {
        const nested = depth < MAX_LIST_DEPTH ? listFrom(child, depth + 1) : undefined;
        if (nested && !list) list = nested;
        else if (nested) list!.items.push(...nested.items);
        else inlineParts.push(...child.children);
      } else if (typeof child !== 'string' && (child.tag === 'p' || child.tag === 'div' || headingKind(child.tag))) {
        if (inlineParts.length) inlineParts.push({ tag: 'br', attrs: {}, children: [] });
        collect(child.children);
      } else inlineParts.push(child);
    }
  };
  collect(node.children);
  const inline = tidyInline(inlineFrom(inlineParts, new Set(), false));
  if (!inline.length && !list) return undefined;
  return list ? { inline, list } : { inline };
}
function blocksFrom(nodes: RawNode[], depth: number): BlockNode[] {
  const blocks: BlockNode[] = [];
  let run: RawNode[] = [];
  const flush = () => {
    if (!run.length) return;
    const children = tidyInline(inlineFrom(run, new Set(), false));
    run = [];
    if (children.length) blocks.push({ kind: 'p', children });
  };
  for (const node of nodes) {
    if (typeof node === 'string') { run.push(node); continue; }
    const heading = headingKind(node.tag);
    if (node.tag === 'p' || heading) {
      flush();
      const children = tidyInline(inlineFrom(node.children, new Set(), false));
      if (children.length) blocks.push({ kind: heading ?? 'p', children });
      continue;
    }
    if (node.tag === 'ul' || node.tag === 'ol') { flush(); const list = listFrom(node, 1); if (list) blocks.push(list); continue; }
    if (node.tag === 'li') { flush(); const item = itemFrom(node, 1); if (item) blocks.push({ kind: 'ul', items: [item] }); continue; }
    if (node.tag === 'hr' || node.tag === 'img') { flush(); continue; }
    if (BLOCKISH.has(node.tag)) { flush(); if (depth < 64) blocks.push(...blocksFrom(node.children, depth + 1)); continue; }
    run.push(node);
  }
  flush();
  return blocks;
}

/* ---------- serialization ---------- */
const escapeText = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttribute = (value: string) => escapeText(value).replace(/"/g, '&quot;');
function inlineHtml(nodes: InlineNode[]): string {
  return nodes.map(node => {
    if (node.kind === 'text') return escapeText(node.text);
    if (node.kind === 'br') return '<br>';
    if (node.kind === 'a') return `<a href="${escapeAttribute(node.href)}">${inlineHtml(node.children)}</a>`;
    return `<${node.kind}>${inlineHtml(node.children)}</${node.kind}>`;
  }).join('');
}
function listHtml(list: ListNode): string {
  const open = list.kind === 'ol' && list.start ? `<ol start="${list.start}">` : `<${list.kind}>`;
  return `${open}${list.items.map(item => `<li>${inlineHtml(item.inline)}${item.list ? listHtml(item.list) : ''}</li>`).join('')}</${list.kind}>`;
}
function blocksHtml(blocks: BlockNode[]): string {
  const only = blocks.length === 1 ? blocks[0]! : undefined;
  if (only && only.kind === 'p') return inlineHtml(only.children);
  return blocks.map(block => isList(block) ? listHtml(block) : `<${block.kind}>${inlineHtml(block.children)}</${block.kind}>`).join('');
}

/* ---------- public API ---------- */
/** Parse any HTML into the canonical tree. Inline-only input becomes one paragraph. */
export function richBlocks(html: string): BlockNode[] { return blocksFrom(buildTree(html).children, 0); }
/** Convert arbitrary HTML (imported, pasted or contenteditable output) to canonical rich text. */
export function sanitizeRich(html: string): string { return blocksHtml(richBlocks(html)); }
/** A stored value must already be canonical; anything else is rejected rather than silently rewritten. */
export function isCanonicalRich(value: string): boolean { return value.length <= RICH_TEXT_MAX && sanitizeRich(value) === value; }
/** Plain text to rich text: blank lines separate paragraphs, single newlines become line breaks. */
export function plainToRich(text: string): string {
  const paragraphs = text.replace(/\r\n?/g, '\n').split(/\n[ \t]*\n+/).map(part => part.trim()).filter(Boolean);
  if (!paragraphs.length) return '';
  const html = paragraphs.map(part => `<p>${part.split('\n').map(line => escapeText(line.trim())).filter((line, i, all) => line || (i > 0 && i < all.length - 1)).join('<br>')}</p>`).join('');
  return sanitizeRich(html);
}
/** Readable plain text: paragraphs separated by blank lines, list items prefixed. */
export function richToPlain(value: string): string {
  const inline = (nodes: InlineNode[]): string => nodes.map(node => node.kind === 'text' ? node.text : node.kind === 'br' ? '\n' : inline(node.children)).join('');
  const list = (node: ListNode, indent: string): string => node.items.map((item, i) => `${indent}${node.kind === 'ol' ? `${(node.start ?? 1) + i}.` : '•'} ${inline(item.inline)}${item.list ? '\n' + list(item.list, indent + '  ') : ''}`).join('\n');
  return richBlocks(value).map(block => isList(block) ? list(block, '') : inline(block.children)).join('\n\n');
}
/** True when the value has no visible text. */
export function richIsEmpty(value: string) { return !richToPlain(value).trim(); }
/** Canonical HTML for trusted string-building outputs (PDF, static HTML). External links gain rel attributes. */
export function richHtml(value: string, options: { paragraphTag?: 'p' | 'span' } = {}): string {
  const blocks = richBlocks(value);
  const linkify = (nodes: InlineNode[]): string => nodes.map(node => {
    if (node.kind === 'text') return escapeText(node.text);
    if (node.kind === 'br') return '<br>';
    if (node.kind === 'a') return `<a href="${escapeAttribute(node.href)}" rel="noopener noreferrer">${linkify(node.children)}</a>`;
    return `<${node.kind}>${linkify(node.children)}</${node.kind}>`;
  }).join('');
  const list = (node: ListNode): string => `${node.kind === 'ol' && node.start ? `<ol start="${node.start}">` : `<${node.kind}>`}${node.items.map(item => `<li>${linkify(item.inline)}${item.list ? list(item.list) : ''}</li>`).join('')}</${node.kind}>`;
  const only = blocks.length === 1 ? blocks[0]! : undefined;
  if (options.paragraphTag === 'span' && only && only.kind === 'p') return linkify(only.children);
  return blocks.map(block => isList(block) ? list(block) : `<${block.kind}>${linkify(block.children)}</${block.kind}>`).join('');
}
/**
 * Build DOM nodes without innerHTML. For learners, links open in a new tab and say so to screen readers; editable
 * output leaves links plain so the hint never becomes part of the authored text.
 */
export function richToDom(value: string, doc: Document = document, options: { editable?: boolean } = {}): DocumentFragment {
  const fragment = doc.createDocumentFragment();
  const inline = (parent: Node, nodes: InlineNode[]) => {
    for (const node of nodes) {
      if (node.kind === 'text') parent.appendChild(doc.createTextNode(node.text));
      else if (node.kind === 'br') parent.appendChild(doc.createElement('br'));
      else if (node.kind === 'a') {
        const link = doc.createElement('a');
        link.href = node.href;
        inline(link, node.children);
        if (!options.editable) {
          link.target = '_blank'; link.rel = 'noopener noreferrer';
          const hint = doc.createElement('span'); hint.className = 'os-sr-only'; hint.textContent = ' (opens in a new tab)';
          link.appendChild(hint);
        }
        parent.appendChild(link);
      } else { const element = doc.createElement(node.kind); inline(element, node.children); parent.appendChild(element); }
    }
  };
  const list = (parent: Node, node: ListNode) => {
    const element = doc.createElement(node.kind);
    if (node.kind === 'ol' && node.start) (element as HTMLOListElement).start = node.start;
    for (const item of node.items) { const li = doc.createElement('li'); inline(li, item.inline); if (item.list) list(li, item.list); element.appendChild(li); }
    parent.appendChild(element);
  };
  for (const block of richBlocks(value)) {
    if (isList(block)) list(fragment, block);
    else { const element = doc.createElement(block.kind); inline(element, block.children); fragment.appendChild(element); }
  }
  return fragment;
}
