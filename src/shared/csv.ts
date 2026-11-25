/** A small CSV reader for glossary imports: commas or semicolons, quoted fields, doubled quotes. */
export function parseCsv(text: string): string[][] {
  const delimiter = (text.split('\n')[0] ?? '').split(';').length > (text.split('\n')[0] ?? '').split(',').length ? ';' : ',';
  const rows: string[][] = []; let row: string[] = [], field = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) { if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch; continue; }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(field); field = ''; if (row.some(c => c.trim())) rows.push(row); row = []; }
    else field += ch;
  }
  row.push(field); if (row.some(c => c.trim())) rows.push(row);
  return rows;
}
