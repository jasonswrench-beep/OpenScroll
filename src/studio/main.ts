/** OpenScroll Studio entry: checks authoring access, then routes between the library and course pages. */
import './studio.css';
import '../shared/blocks.css';
import '../client/block-editor.css';
import logo from '../assets/openscroll.svg';
import { Library, CircleQuestionMark, PanelsTopLeft } from 'lucide';
import { loadSession, account, hasAuthoringAccess, api, setAccount } from '../client/account-api.js';
import { libraryView } from './library.js';
import { courseView } from './course.js';
import { h, icon, openMenu, button } from './dom.js';

interface View { id?: string | undefined; leave: () => Promise<boolean>; update: (route: { lessonId?: string }) => void; }
type Route = { kind: 'library' } | { kind: 'course'; id: string; lessonId?: string };
const root = document.getElementById('studio')!;
let view: View | undefined, shownHash = '', changing = false;

function parse(hash: string): Route {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const id = params.get('course');
  if (id && /^[0-9a-f-]{36}$/i.test(id)) return { kind: 'course', id, ...(params.get('lesson') ? { lessonId: params.get('lesson')! } : {}) };
  return { kind: 'library' };
}
const hashFor = (route: Route) => route.kind === 'library' ? '#library' : `#course=${route.id}${route.lessonId ? `&lesson=${encodeURIComponent(route.lessonId)}` : ''}`;
function go(route: Route) { const next = hashFor(route); if (location.hash !== next) location.hash = next; else void show(); }

function rail(): HTMLElement {
  const initials = (account?.name ?? '?').split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase();
  const me: HTMLButtonElement = h('button', { class: 'avatar', text: initials, attrs: { type: 'button', 'aria-label': `Account: ${account?.name ?? ''}`, 'aria-haspopup': 'menu', title: account?.name ?? 'Account' }, on: { click: () => openMenu(me, [
    { label: 'Manage account', run: () => { location.assign('/account/'); } },
    { label: 'Classic workspace', run: () => { location.assign('/app/'); } },
    { label: 'Sign out', run: () => void signOut() },
  ]) } });
  return h('nav', { class: 'apprail', attrs: { 'aria-label': 'OpenScroll' } }, [
    h('button', { class: 'logo', attrs: { type: 'button', 'aria-label': 'OpenScroll library' }, on: { click: () => go({ kind: 'library' }) } }, [h('img', { attrs: { src: logo, alt: '' } })]),
    h('a', { class: 'rnav', attrs: { href: '#library', 'aria-current': 'page' } }, [icon(Library), 'Library']),
    h('a', { class: 'rnav', attrs: { href: '/app/', title: 'The classic workspace keeps every current tool' } }, [icon(PanelsTopLeft), 'Classic']),
    h('a', { class: 'rnav', attrs: { href: 'https://github.com/jasonswrench-beep/OpenScroll/tree/main/docs', target: '_blank', rel: 'noopener noreferrer', title: 'Guides (opens in a new tab)' } }, [icon(CircleQuestionMark), 'Help']),
    h('span', { class: 'grow' }),
    me,
  ]);
}
async function signOut() {
  if (view && !await view.leave()) return;
  try { await api('/api/account/logout', 'POST', {}); } catch { /* the account page shows the current state */ }
  setAccount(null, null); location.assign('/account/');
}

async function show() {
  if (changing) return;
  const route = parse(location.hash);
  if (!account) return;
  // Moving within one course keeps its open project, saving, and undo history.
  if (route.kind === 'course' && view?.id === route.id) { view.update({ ...(route.lessonId ? { lessonId: route.lessonId } : {}) }); shownHash = location.hash; return; }
  changing = true;
  try {
    if (view && !await view.leave()) { history.replaceState(null, '', shownHash || '#library'); return; }
    shownHash = location.hash;
    window.scrollTo(0, 0);
    view = route.kind === 'library'
      ? libraryView(root, { account, open: (id, lessonId) => go({ kind: 'course', id, ...(lessonId ? { lessonId } : {}) }), rail })
      : courseView(root, { account, id: route.id, ...(route.lessonId ? { lessonId: route.lessonId } : {}), toLibrary: () => go({ kind: 'library' }), go: lessonId => go({ kind: 'course', id: route.id, ...(lessonId ? { lessonId } : {}) }) });
    document.title = route.kind === 'library' ? 'Library · OpenScroll Studio' : 'Course · OpenScroll Studio';
  } finally { changing = false; root.removeAttribute('aria-busy'); }
}

window.addEventListener('hashchange', () => void show());
// Template creation in the shared dialogs announces the new course this way.
window.addEventListener('openscroll:edit-course', event => { const detail = (event as CustomEvent<{ id: string }>).detail; if (detail?.id) go({ kind: 'course', id: detail.id }); });
window.addEventListener('openscroll:library-refresh', () => { if (view && !view.id) void (view as unknown as { refresh?: () => Promise<void> }).refresh?.(); });
window.addEventListener('openscroll:account', event => { if (!(event as CustomEvent).detail && shownHash) location.replace('/account/'); });

async function start() {
  document.body.classList.add('studio');
  try {
    await loadSession();
    if (!hasAuthoringAccess(account)) { location.replace('/account/'); return; }
    await show();
  } catch {
    root.replaceChildren(h('div', { class: 'studio-error', attrs: { role: 'alert' } }, [h('p', { text: 'Your authoring access could not be checked.' }), button('Try again', () => location.reload(), { class: 'btn btn-primary' })]));
  }
}
void start();
