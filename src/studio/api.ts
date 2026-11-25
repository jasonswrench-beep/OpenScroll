/** The studio's calls into this instance's existing API. Every request goes through the shared session and CSRF headers. */
import { api, authorizedFetch } from '../client/account-api.js';
import type { PortableProject } from '../shared/course.js';
import type { SaveAck, SavePayload } from '../client/save-controller.js';
import type { RiseReport } from '../project/rise-import.js';

export interface CourseSummary {
  id: string; revision: number; title: string; created_at: string; updated_at: string;
  sections: number; lessons?: number; blocks?: number; cover_asset?: string | null; accent?: string | null;
}
export type SortKey = 'updated' | 'created' | 'title';
async function failure(response: Response): Promise<never> {
  const body: unknown = await response.json().catch(() => null);
  throw new Error(body && typeof body === 'object' && 'error' in body && typeof body.error === 'string' ? body.error : 'The request failed. Try again.');
}
export const library = {
  list: (search: string, sort: SortKey) => api<{ courses: CourseSummary[] }>(`/api/library/courses?search=${encodeURIComponent(search)}&sort=${sort}`),
  create: (title: string) => api<{ id: string; title: string }>('/api/library/courses', 'POST', { title }),
  importProject: (project: PortableProject) => api<{ id: string; title: string }>('/api/library/courses/import', 'POST', project),
  rename: (id: string, title: string, revision: number) => api<{ revision: number }>(`/api/library/courses/${id}`, 'PATCH', { title, revision }),
  duplicate: (id: string) => api<{ id: string; title: string }>(`/api/library/courses/${id}/duplicate`, 'POST'),
  remove: (id: string, revision: number) => api<{ message: string }>(`/api/library/courses/${id}`, 'DELETE', { revision }),
  edit: (id: string) => api<{ project: PortableProject; revision: number; lastMutationId: string | null }>(`/api/library/courses/${id}/edit`),
  save: (id: string, payload: SavePayload) => api<SaveAck>(`/api/library/courses/${id}/document`, 'PUT', payload),
  assetUrl: (id: string, assetId: string) => `/api/library/courses/${encodeURIComponent(id)}/assets/${encodeURIComponent(assetId)}`,
  async download(id: string) {
    const response = await authorizedFetch(`/api/library/courses/${id}/download`, { signal: AbortSignal.timeout(60_000) });
    if (!response.ok) await failure(response);
    return response.blob();
  },
};
export const projects = {
  async open(file: Blob) {
    const response = await authorizedFetch('/api/projects/import', { method: 'POST', headers: { 'Content-Type': 'application/x-openscroll-project' }, body: file, signal: AbortSignal.timeout(60_000) });
    if (!response.ok) await failure(response);
    return response.json() as Promise<PortableProject>;
  },
  async importRise(file: Blob) {
    const response = await authorizedFetch('/api/projects/import-rise', { method: 'POST', headers: { 'Content-Type': 'application/zip' }, body: file, signal: AbortSignal.timeout(120_000) });
    if (!response.ok) await failure(response);
    return response.json() as Promise<{ project: PortableProject; report: RiseReport }>;
  },
  async export(project: PortableProject) {
    const response = await authorizedFetch('/api/projects/export', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(project), signal: AbortSignal.timeout(60_000) });
    if (!response.ok) await failure(response);
    return response.blob();
  },
};
export const fileName = (title: string, extension: string) => `${(title || 'course').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'course'}${extension}`;
