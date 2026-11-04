import { createHash } from 'node:crypto';
import type { RawRecord } from './types.js';

export function csvEscape(value: string | null): string {
  if (value === null) return '';
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(rows: RawRecord[], columns: string[]): string {
  const sorted = [...rows].sort((left, right) =>
    columns
      .map((column) => left[column] ?? '')
      .join('\u0000')
      .localeCompare(columns.map((column) => right[column] ?? '').join('\u0000')),
  );
  return `${columns.join(',')}\n${sorted.map((row) => columns.map((column) => csvEscape(row[column] ?? null)).join(',')).join('\n')}\n`;
}

export function parseCsv(input: string): RawRecord[] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index] as string;
    if (quoted) {
      if (character === '"' && input[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') quoted = false;
      else cell += character;
    } else if (character === '"') quoted = true;
    else if (character === ',') {
      row.push(cell);
      cell = '';
    } else if (character === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (character !== '\r') cell += character;
  }
  const [headers, ...data] = rows;
  if (!headers) return [];
  return data
    .filter((values) => values.length === headers.length)
    .map((values) =>
      Object.fromEntries(headers.map((header, index) => [header, values[index] || null])),
    );
}

export function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
