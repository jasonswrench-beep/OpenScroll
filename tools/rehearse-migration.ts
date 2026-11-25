/**
 * Migration rehearsal for the schema 4 release. Reads every stored course, snapshot and reusable item from
 * DATABASE_URL inside a READ ONLY transaction and checks that each opens as schema 4, exactly as the server does on
 * read. Nothing is written: stored rows keep their version until an author saves. The report names row ids and
 * schema versions only, never course content.
 *
 * Run it against a restored copy of production before the cutover:
 *   DATABASE_URL=postgres://… npm run db:rehearse
 */
import pg from 'pg';
import { parseCourse } from '../src/shared/course.js';

export interface RehearsalRow { id: string; document: unknown }
export interface RehearsalReport { total: number; byVersion: Record<string, number>; opened: number; failed: { id: string; message: string }[] }

export function rehearse(rows: RehearsalRow[]): RehearsalReport {
  const report: RehearsalReport = { total: rows.length, byVersion: {}, opened: 0, failed: [] };
  for (const row of rows) {
    const version = row.document && typeof row.document === 'object' && 'schemaVersion' in row.document ? String((row.document as { schemaVersion: unknown }).schemaVersion) : 'missing';
    report.byVersion[version] = (report.byVersion[version] ?? 0) + 1;
    try { parseCourse(row.document); report.opened++; }
    catch (error) { report.failed.push({ id: row.id, message: error instanceof Error ? error.message.slice(0, 300) : 'Could not be read.' }); }
  }
  return report;
}

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('Set DATABASE_URL to a restored copy of the production database.');
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const courses = rehearse((await client.query<{ id: string; document: unknown }>('SELECT id, document FROM courses ORDER BY id')).rows);
    const snapshots = rehearse((await client.query<{ id: string; project: { document?: unknown } }>('SELECT id, project FROM course_snapshots ORDER BY id')).rows.map(r => ({ id: r.id, document: r.project?.document })));
    const reusable = rehearse((await client.query<{ id: string; project: { document?: unknown } }>("SELECT id, project FROM reusable_items ORDER BY id")).rows.map(r => ({ id: r.id, document: r.project?.document })));
    await client.query('ROLLBACK');
    const result = { courses, snapshots, reusable, ok: !courses.failed.length && !snapshots.failed.length && !reusable.failed.length };
    console.log(JSON.stringify(result, null, 2));
    if (!result.ok) process.exitCode = 1;
  } finally { await client.end(); }
}
if (process.argv[1]?.replace(/\\/g, '/').endsWith('tools/rehearse-migration.ts')) await main();
