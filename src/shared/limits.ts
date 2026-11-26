/**
 * Size limits for course files. Each instance sets its own within SIZE_RANGES (OPENSCROLL_MAX_FILE_MIB and
 * OPENSCROLL_MAX_COURSE_MIB on the server), and the server reports them at /api/features so both editors check uploads
 * against the same numbers. A course is saved and exported as one request that carries every file, so the ceilings stay
 * where the server and the author's browser can still hold a whole course in memory. Long video belongs on YouTube or
 * Vimeo (the embedded video block), not inside the course.
 */
export const MiB = 1024 * 1024;
/** Owner decision of 2026-11-26: raised from 16 MiB per file and 64 MiB per course. */
export const SIZE_DEFAULTS = { fileMiB: 64, courseMiB: 160 } as const;
export const SIZE_RANGES = { fileMiB: [16, 256], courseMiB: [64, 320] } as const;
/** The largest single file any instance can accept, which is also the course format's own ceiling. */
export const FILE_CEILING = SIZE_RANGES.fileMiB[1] * MiB;

export interface SizeLimits { /** One picture, sound, video or attachment. */ fileBytes: number; /** All of a course's files plus its document. */ courseBytes: number }

export function sizeLimits(fileMiB: number, courseMiB: number): SizeLimits {
  const [fileMin, fileMax] = SIZE_RANGES.fileMiB, [courseMin, courseMax] = SIZE_RANGES.courseMiB;
  if (!Number.isInteger(fileMiB) || fileMiB < fileMin || fileMiB > fileMax) throw new Error(`The file size limit must be a whole number of MiB from ${fileMin} to ${fileMax}.`);
  if (!Number.isInteger(courseMiB) || courseMiB < courseMin || courseMiB > courseMax) throw new Error(`The course size limit must be a whole number of MiB from ${courseMin} to ${courseMax}.`);
  if (fileMiB > courseMiB) throw new Error('The file size limit cannot be larger than the course size limit.');
  return { fileBytes: fileMiB * MiB, courseBytes: courseMiB * MiB };
}
export const DEFAULT_LIMITS: SizeLimits = sizeLimits(SIZE_DEFAULTS.fileMiB, SIZE_DEFAULTS.courseMiB);

/** A ZIP of the course: its files hardly compress, plus room for the player, the manifest and the ZIP structure. */
export const packageBytes = (limits: SizeLimits) => limits.courseBytes + 16 * MiB;
/** A Rise web export: the course's files plus Rise's own player (about 10 MiB), and never less than the 64 MiB it always allowed. */
export const riseUploadBytes = (limits: SizeLimits) => Math.max(64 * MiB, packageBytes(limits) + 16 * MiB);
/** A request that carries a whole course as JSON: every file in base64 plus the document and its wrapper. */
export const requestBytes = (limits: SizeLimits) => Math.ceil(limits.courseBytes / 3) * 4 + 8 * MiB;
/** "64 MiB", for messages. */
export const sizeLabel = (bytes: number) => `${Math.round(bytes / MiB)} MiB`;
/** Time to allow a request that sends `bytes`: the base, plus a second for every 512 KiB (an upload of about 4 Mbit/s). */
export const transferTimeout = (bytes: number, base = 30_000) => base + Math.ceil(bytes / (512 * 1024)) * 1000;

/**
 * Time to allow an export or download of a whole course: its files go up in base64 and a ZIP of them comes back.
 * Counted from the file sizes in the course, so the course is not converted to text twice.
 */
export function courseTimeout(project: { document: { assets: { byteLength: number }[] } }, base = 60_000) {
  const files = project.document.assets.reduce((total, asset) => total + asset.byteLength, 0);
  return transferTimeout(2 * (Math.ceil(files / 3) * 4 + 2 * MiB), base);
}

/** The limits this page checks against: the defaults until the server's own arrive from /api/features. */
export const instanceLimits: SizeLimits = { ...DEFAULT_LIMITS };
export function applyInstanceLimits(value: unknown) {
  const limits = value as Partial<SizeLimits> | undefined;
  if (!limits || typeof limits.fileBytes !== 'number' || typeof limits.courseBytes !== 'number') return;
  try { Object.assign(instanceLimits, sizeLimits(limits.fileBytes / MiB, limits.courseBytes / MiB)); } catch { /* keep the defaults */ }
}
