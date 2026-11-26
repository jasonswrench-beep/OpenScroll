import { applyInstanceLimits } from '../shared/limits.js';
/** Instance settings the studio needs to know about, from GET /api/features. */
export const features = { studio: true, externalVideo: true };
export async function loadFeatures() {
  try {
    const response = await fetch('/api/features', { credentials: 'same-origin' });
    if (response.ok) { const value = await response.json() as Partial<typeof features> & { limits?: unknown }; features.externalVideo = value.externalVideo !== false; features.studio = value.studio !== false; applyInstanceLimits(value.limits); }
  } catch { /* keep the defaults */ }
}
