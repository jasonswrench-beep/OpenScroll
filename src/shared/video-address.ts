/** Reads a YouTube or Vimeo address (watch, short, embed or shorts links) into a provider and video id. */
export function parseVideoAddress(value: string): { provider: 'youtube' | 'vimeo'; id: string; start?: number } | undefined {
  let url: URL;
  try { url = new URL(value.trim()); } catch { return undefined; }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return undefined;
  const host = url.hostname.replace(/^www\.|^m\./, ''), start = Number(url.searchParams.get('t') ?? url.searchParams.get('start') ?? '') || undefined;
  if (host === 'youtu.be') { const id = url.pathname.slice(1); return /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: 'youtube', id, ...(start ? { start } : {}) } : undefined; }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const id = url.searchParams.get('v') ?? /^\/(?:embed|shorts|live)\/([A-Za-z0-9_-]{11})/.exec(url.pathname)?.[1] ?? '';
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: 'youtube', id, ...(start ? { start } : {}) } : undefined;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') { const id = /(\d{5,12})(?:\/|$)/.exec(url.pathname)?.[1]; return id ? { provider: 'vimeo', id } : undefined; }
  return undefined;
}
