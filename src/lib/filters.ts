import type { CellValue, Row } from './types';

export type ListFilter = {
  mode: 'any' | 'all';
  values: string[];
};

export type NumberFilter = {
  min?: number;
  max?: number;
};

export type BooleanFilter = 'any' | 'true' | 'false';

export type ColumnFilterValue = string | ListFilter | NumberFilter | BooleanFilter;

export function includesText(value: CellValue, q: string): boolean {
  if (!q) return true;
  const query = q.toLowerCase();
  if (value === null) return false;
  if (Array.isArray(value)) return value.some((x) => String(x ?? '').toLowerCase().includes(query));
  return String(value).toLowerCase().includes(query);
}

export function listMatches(value: CellValue, f: ListFilter): boolean {
  if (!f.values.length) return true;
  if (!Array.isArray(value)) return false;
  const set = new Set(value.map((x) => String(x).toLowerCase()));
  if (f.mode === 'all') return f.values.every((v) => set.has(v.toLowerCase()));
  return f.values.some((v) => set.has(v.toLowerCase()));
}

export function numberMatches(value: CellValue, f: NumberFilter): boolean {
  if (value === null) return false;
  const num = typeof value === 'number' ? value : Number(value);
  if (Number.isNaN(num)) return false;
  if (typeof f.min === 'number' && num < f.min) return false;
  if (typeof f.max === 'number' && num > f.max) return false;
  return true;
}

export function booleanMatches(value: CellValue, f: BooleanFilter): boolean {
  if (f === 'any') return true;
  const want = f === 'true';
  return value === want;
}

export function getUniqueListValues(rows: Row[], key: string, limit = 200): string[] {
  const set = new Set<string>();
  for (const r of rows) {
    const v = r[key];
    if (Array.isArray(v)) {
      for (const it of v) {
        if (it === null) continue;
        const s = String(it);
        if (s) set.add(s);
        if (set.size >= limit) break;
      }
    }
    if (set.size >= limit) break;
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}


