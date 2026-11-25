/** Per-author conveniences kept in this browser only: never part of the course or the portable project. */
export interface LastOpened { id: string; title: string; lessonId?: string; lessonTitle?: string; at: string; }
const key = (owner: string) => `openscroll-studio:last:${owner}`;
export function lastOpened(owner: string): LastOpened | undefined {
  try {
    const value = JSON.parse(localStorage.getItem(key(owner)) ?? 'null') as LastOpened | null;
    return value && typeof value.id === 'string' ? value : undefined;
  } catch { return undefined; }
}
export function rememberOpened(owner: string, value: Omit<LastOpened, 'at'>) {
  try { localStorage.setItem(key(owner), JSON.stringify({ ...value, at: new Date().toISOString() })); } catch { /* storage may be unavailable */ }
}
export function forgetLastOpened(owner: string, id: string) {
  try { if (lastOpened(owner)?.id === id) localStorage.removeItem(key(owner)); } catch { /* storage may be unavailable */ }
}
