import Papa from 'papaparse';
import type { CellValue, ColumnKind, ColumnSpec, Row } from './types';
import { prettyColumnLabel, splitGroupLabel } from './labels';

function tryParseJsonArray(value: string): unknown | null {
  const v = value.trim();
  if (!v.startsWith('[') || !v.endsWith(']')) return null;
  try {
    return JSON.parse(v);
  } catch {
    return null;
  }
}

function toPrimitive(v: unknown): string | number | boolean | null {
  if (v === null) return null;
  if (typeof v === 'string') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'boolean') return v;
  return String(v);
}

export function coerceCell(raw: string): CellValue {
  const s = raw.trim();
  if (s === '') return null;

  // JSON array (list-like categories) -> array of primitives
  const maybeArr = tryParseJsonArray(s);
  if (Array.isArray(maybeArr)) {
    return maybeArr.map(toPrimitive);
  }

  // boolean
  {
    const lower = s.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
  }

  // number (avoid turning codes into numbers; dataset has a dedicated code field anyway)
  const num = Number(s);
  if (!Number.isNaN(num) && s.match(/^-?\d+(\.\d+)?$/)) return num;

  return raw;
}

export async function loadCsv(url: string): Promise<{ rows: Row[]; headers: string[] }> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Failed to load dataset: ${res.status} ${res.statusText}`);
  const text = await res.text();

  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: true,
  });
  if (parsed.errors?.length) {
    // keep going but surface first error
    // eslint-disable-next-line no-console
    console.warn('CSV parse warnings:', parsed.errors.slice(0, 3));
  }

  const data = parsed.data ?? [];
  const headers = (parsed.meta.fields ?? []).filter(Boolean);
  const rows: Row[] = data.map((r) => {
    const out: Row = {};
    for (const h of headers) {
      out[h] = coerceCell(r[h] ?? '');
    }
    return out;
  });
  return { rows, headers };
}

export function inferColumnKind(values: CellValue[], key: string): ColumnKind {
  if (key === 'Country') return 'country';
  if (key === 'flag_svg') return 'string';
  if (key === 'code') return 'string';

  // pick the first non-null
  const v = values.find((x) => x !== null);
  if (v === undefined) return 'string';
  if (Array.isArray(v)) return 'list';
  if (typeof v === 'boolean') return 'boolean';
  if (typeof v === 'number') return 'number';
  return 'string';
}

export function defaultColumnSpecs(headers: string[], rows: Row[]): ColumnSpec[] {
  const byKey = new Map<string, ColumnSpec>();
  for (const h of headers) {
    const values = rows.slice(0, 80).map((r) => r[h]); // sample for inference
    const kind = inferColumnKind(values, h);
    let hiddenByDefault = false;
    if (h === 'code') hiddenByDefault = true;
    if (h === 'flag_svg') hiddenByDefault = true; // we render it inside Country
    const pretty = prettyColumnLabel(h);
    const { group, leaf } = splitGroupLabel(pretty);
    // Normalize groups to a stable set used by the UI
    const normalizeGroup = (g?: string): string => {
      if (!g) return 'Core';
      const gg = g.trim();
      if (gg === 'Flag') return 'Flags';
      if (gg === 'Flags') return 'Flags';
      return gg;
    };

    // Force key columns into Core
    let finalGroup = normalizeGroup(group);
    if (h === 'Country' || h === 'Rarity' || h === 'code' || h === 'flag_svg') finalGroup = 'Core';
    if (h === 'Continent codes' || h === 'Population' || h === 'Area km²') finalGroup = 'Core';

    byKey.set(h, { key: h, label: leaf, group: finalGroup, kind, hiddenByDefault });
  }
  return headers.map((h) => byKey.get(h)!);
}


