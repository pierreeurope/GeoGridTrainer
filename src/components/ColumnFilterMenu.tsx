import React from 'react';
import type { ColumnSpec, Row } from '../lib/types';
import type { BooleanFilter, ListFilter, NumberFilter } from '../lib/filters';
import { getUniqueListValues } from '../lib/filters';

type FilterValue = string | ListFilter | NumberFilter | BooleanFilter | undefined;

function asListFilter(v: unknown): ListFilter {
  if (v && typeof v === 'object' && 'values' in v && Array.isArray((v as any).values)) {
    const mode = (v as any).mode === 'any' ? 'any' : 'all';
    return { mode, values: (v as any).values.map(String) };
  }
  // default to ALL for list filters so "blue + red" is natural
  return { mode: 'all', values: [] };
}

function asNumberFilter(v: unknown): NumberFilter {
  if (!v || typeof v !== 'object') return {};
  const min = (v as any).min;
  const max = (v as any).max;
  return {
    min: typeof min === 'number' ? min : undefined,
    max: typeof max === 'number' ? max : undefined,
  };
}

function asBooleanFilter(v: unknown): BooleanFilter {
  if (v === 'true' || v === 'false' || v === 'any') return v;
  return 'any';
}

export function ColumnFilterMenu({
  column,
  rows,
  value,
  onChange,
  onClear,
}: {
  column: ColumnSpec;
  rows: Row[];
  value: FilterValue;
  onChange: (next: FilterValue) => void;
  onClear: () => void;
}) {
  const [search, setSearch] = React.useState('');

  if (column.kind === 'list') {
    const lf = asListFilter(value);
    const optionsAll = React.useMemo(() => getUniqueListValues(rows, column.key, 500), [rows, column.key]);
    const options = optionsAll.filter((o) => o.toLowerCase().includes(search.toLowerCase()));
    const selected = new Set(lf.values.map((v) => v.toLowerCase()));

    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="small">Match</div>
        <div className="btnRow">
          <button className={`btn ${lf.mode === 'all' ? 'btnPrimary' : ''}`} onClick={() => onChange({ ...lf, mode: 'all' })}>
            ALL selected
          </button>
          <button className={`btn ${lf.mode === 'any' ? 'btnPrimary' : ''}`} onClick={() => onChange({ ...lf, mode: 'any' })}>
            ANY selected
          </button>
          <button className="btn" onClick={onClear}>
            Clear
          </button>
        </div>

        <input className="input" placeholder="Search values…" value={search} onChange={(e) => setSearch(e.target.value)} />

        <div style={{ maxHeight: 320, overflow: 'auto', border: '1px solid var(--border)', borderRadius: 12, padding: 10 }}>
          <div style={{ display: 'grid', gap: 8 }}>
            {options.map((o) => {
              const checked = selected.has(o.toLowerCase());
              return (
                <label key={o} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => {
                      const next = new Set(lf.values);
                      if (e.target.checked) next.add(o);
                      else next.delete(o);
                      onChange({ ...lf, values: Array.from(next) });
                    }}
                  />
                  <span style={{ fontSize: 13 }}>{o}</span>
                </label>
              );
            })}
            {options.length === 0 && <div className="hint">No matches.</div>}
          </div>
        </div>
        <div className="hint">
          Selected: <span className="mono">{lf.values.length}</span>
        </div>
      </div>
    );
  }

  if (column.kind === 'number') {
    const nf = asNumberFilter(value);
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="small">Range</div>
        <div className="split">
          <input
            className="input"
            placeholder="min"
            inputMode="numeric"
            value={nf.min ?? ''}
            onChange={(e) => {
              const s = e.target.value.trim();
              const n = s === '' ? undefined : Number(s);
              onChange({ ...nf, min: n === undefined || Number.isNaN(n) ? undefined : n });
            }}
          />
          <input
            className="input"
            placeholder="max"
            inputMode="numeric"
            value={nf.max ?? ''}
            onChange={(e) => {
              const s = e.target.value.trim();
              const n = s === '' ? undefined : Number(s);
              onChange({ ...nf, max: n === undefined || Number.isNaN(n) ? undefined : n });
            }}
          />
        </div>
        <div className="btnRow">
          <button className="btn" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
    );
  }

  if (column.kind === 'boolean') {
    const bf = asBooleanFilter(value);
    return (
      <div style={{ display: 'grid', gap: 10 }}>
        <div className="small">Value</div>
        <div className="btnRow">
          <button className={`btn ${bf === 'any' ? 'btnPrimary' : ''}`} onClick={() => onChange('any')}>
            Any
          </button>
          <button className={`btn ${bf === 'true' ? 'btnPrimary' : ''}`} onClick={() => onChange('true')}>
            True
          </button>
          <button className={`btn ${bf === 'false' ? 'btnPrimary' : ''}`} onClick={() => onChange('false')}>
            False
          </button>
        </div>
        <div className="btnRow">
          <button className="btn" onClick={onClear}>
            Clear
          </button>
        </div>
      </div>
    );
  }

  // string
  const text = typeof value === 'string' ? value : '';
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      <div className="small">Contains</div>
      <input className="input" placeholder="Type to filter…" value={text} onChange={(e) => onChange(e.target.value)} />
      <div className="btnRow">
        <button className="btn" onClick={onClear}>
          Clear
        </button>
      </div>
    </div>
  );
}


