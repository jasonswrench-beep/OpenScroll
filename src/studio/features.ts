/** Instance settings the studio needs to know about, from GET /api/features. */
export const features = { studio: true, externalVideo: false };
export async function loadFeatures() {
  try {
    const response = await fetch('/api/features', { credentials: 'same-origin' });
    if (response.ok) { const value = await response.json() as Partial<typeof features>; features.externalVideo = value.externalVideo === true; features.studio = value.studio !== false; }
  } catch { /* keep the safe defaults: no external video */ }
}
