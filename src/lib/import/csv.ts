/**
 * Strict RFC 4180-style CSV tokenizer.
 * Handles a UTF-8 BOM, CRLF/LF/CR line endings, quoted commas, escaped quotes ("")
 * and newlines inside quoted fields. Structural problems (bad quoting, no header)
 * are fatal for the whole file because row boundaries can no longer be trusted.
 */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
export const MAX_DATA_ROWS = 20_000;

export class CsvStructureError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CsvStructureError';
  }
}

export interface CsvRow {
  /** 1-based line number in the file where the row starts (header is line 1). */
  line: number;
  cells: string[];
}

export interface ParsedCsv {
  headers: string[];
  rows: CsvRow[];
}

export function byteLength(text: string): number {
  return new TextEncoder().encode(text).length;
}

export function parseCsv(input: string): ParsedCsv {
  if (byteLength(input) > MAX_FILE_BYTES) throw new CsvStructureError('The file is larger than 5 MB. Split the export into smaller date ranges.');
  const text = input.replace(/^﻿/, '');
  const table: CsvRow[] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  let closed = false; // a quoted field just ended; only a delimiter or newline may follow
  let line = 1;
  let rowLine = 1;

  const endField = () => {
    row.push(closed ? field : field.trim());
    field = '';
    closed = false;
  };
  const endRow = () => {
    endField();
    if (row.some((c) => c !== '')) table.push({ line: rowLine, cells: row });
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          quoted = false;
          closed = true;
        }
      } else {
        if (c === '\n') line++;
        field += c;
      }
    } else if (c === ',') {
      endField();
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      endRow();
      line++;
      rowLine = line;
    } else if (c === '"' && field.trim() === '' && !closed) {
      field = '';
      quoted = true;
    } else {
      if (closed && c.trim() === '') continue; // tolerate spaces after a closing quote
      if (closed || c === '"') throw new CsvStructureError(`Line ${line}: a quote appears in the middle of a value. Quote the whole value and double any quotes inside it.`);
      field += c;
    }
  }
  if (quoted) throw new CsvStructureError(`Line ${rowLine}: a quoted value is never closed.`);
  if (field !== '' || row.length || closed) endRow();

  const header = table[0];
  if (!header) throw new CsvStructureError('The file is empty.');
  const headers = header.cells.map((h) => h.trim());
  if (headers.some((h) => h === '')) throw new CsvStructureError('The header row has an empty column name.');
  const seen = new Set<string>();
  for (const h of headers) {
    const k = h.toLowerCase();
    if (seen.has(k)) throw new CsvStructureError(`The header "${h}" appears more than once.`);
    seen.add(k);
  }
  const rows = table.slice(1);
  if (!rows.length) throw new CsvStructureError('The file has a header row but no data rows.');
  if (rows.length > MAX_DATA_ROWS) throw new CsvStructureError(`The file has ${rows.length.toLocaleString('en-US')} data rows; the limit is ${MAX_DATA_ROWS.toLocaleString('en-US')}. Split the export into smaller date ranges.`);
  return { headers, rows };
}
