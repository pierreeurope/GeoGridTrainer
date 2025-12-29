import React from 'react';
import type { ColumnSpec, Row } from '../lib/types';
import type { BooleanFilter, ListFilter, NumberFilter } from '../lib/filters';
import { getUniqueListValues } from '../lib/filters';

type FilterState = Record<string, unknown>;

function asListFilter(v: unknown): ListFilter {
  if (v && typeof v === 'object' && 'values' in v && Array.isArray((v as any).values)) {
    const mode = (v as any).mode === 'all' ? 'all' : 'any';
    return { mode, values: (v as any).values.map(String) };
  }
  return { mode: 'any', values: [] };
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

export function FiltersPanel({
  columns,
  rows,
  globalQuery,
  onGlobalQuery,
  filters,
  onFilters,
  visible,
}: {
  columns: ColumnSpec[];
  rows: Row[];
  globalQuery: string;
  onGlobalQuery: (q: string) => void;
  filters: FilterState;
  onFilters: (next: FilterState) => void;
  visible: Record<string, boolean>;
}) {
  const listColumns = React.useMemo(() => columns.filter((c) => c.kind === 'list'), [columns]);
  const numberColumns = React.useMemo(() => columns.filter((c) => c.kind === 'number'), [columns]);
  const boolColumns = React.useMemo(() => columns.filter((c) => c.kind === 'boolean'), [columns]);

  return (
    <div className="panel">
      <div className="panelHeader">
        <h2>Filters</h2>
        <span className="pill">{rows.length} rows</span>
      </div>
      <div className="panelBody" style={{ display: 'grid', gap: 14 }}>
        <div>
          <div className="small" style={{ marginBottom: 6 }}>
            Search
          </div>
          <input
            className="input"
            placeholder="Type to search (country, rivers, time zones...)"
            value={globalQuery}
            onChange={(e) => onGlobalQuery(e.target.value)}
          />
        </div>

        <div className="btnRow">
          <button className="btn" onClick={() => onFilters({})}>
            Clear all filters
          </button>
          <button
            className="btn btnPrimary"
            onClick={() => {
              // a fun preset: blue in flag + olympic medals >= 50
              const next: FilterState = { ...filters };
              next['Flag - Colors on flag'] = { mode: 'any', values: ['blue'] };
              next['Sports - Olympic medals'] = { min: 50 };
              onFilters(next);
            }}
          >
            Preset: blue + medals ≥ 50
          </button>
        </div>

        <div className="hint">
          Tip: list filters match <span className="mono">any</span> selected value by default (switch to{' '}
          <span className="mono">all</span> when needed). Numeric filters accept min/max.
        </div>

        {listColumns.length > 0 && (
          <div className="panel" style={{ boxShadow: 'none' }}>
            <div className="panelHeader">
              <h2>List filters</h2>
            </div>
            <div className="panelBody" style={{ display: 'grid', gap: 12 }}>
              {listColumns.map((c) => {
                const lf = asListFilter(filters[c.key]);
                const options = getUniqueListValues(rows, c.key, 200);
                const shownHint = visible[c.key] ? '' : ' (hidden column)';
                return (
                  <div key={c.key}>
                    <div className="small" style={{ marginBottom: 6 }}>
                      {c.label}
                      {shownHint}
                    </div>
                    <div className="split">
                      <select
                        className="input"
                        value={lf.mode}
                        onChange={(e) =>
                          onFilters({
                            ...filters,
                            [c.key]: { ...lf, mode: e.target.value === 'all' ? 'all' : 'any' },
                          })
                        }
                      >
                        <option value="any">match ANY</option>
                        <option value="all">match ALL</option>
                      </select>
                      <select
                        className="input"
                        multiple
                        size={Math.min(8, Math.max(4, options.length))}
                        value={lf.values}
                        onChange={(e) => {
                          const selected = Array.from(e.target.selectedOptions).map((o) => o.value);
                          onFilters({ ...filters, [c.key]: { ...lf, values: selected } });
                        }}
                      >
                        {options.map((o) => (
                          <option key={o} value={o}>
                            {o}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {numberColumns.length > 0 && (
          <div className="panel" style={{ boxShadow: 'none' }}>
            <div className="panelHeader">
              <h2>Numeric filters</h2>
            </div>
            <div className="panelBody" style={{ display: 'grid', gap: 12 }}>
              {numberColumns.map((c) => {
                const nf = asNumberFilter(filters[c.key]);
                return (
                  <div key={c.key}>
                    <div className="small" style={{ marginBottom: 6 }}>
                      {c.label}
                    </div>
                    <div className="split">
                      <input
                        className="input"
                        placeholder="min"
                        inputMode="numeric"
                        value={nf.min ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          const min = v === '' ? undefined : Number(v);
                          onFilters({
                            ...filters,
                            [c.key]: { ...nf, min: min === undefined || Number.isNaN(min) ? undefined : min },
                          });
                        }}
                      />
                      <input
                        className="input"
                        placeholder="max"
                        inputMode="numeric"
                        value={nf.max ?? ''}
                        onChange={(e) => {
                          const v = e.target.value.trim();
                          const max = v === '' ? undefined : Number(v);
                          onFilters({
                            ...filters,
                            [c.key]: { ...nf, max: max === undefined || Number.isNaN(max) ? undefined : max },
                          });
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {boolColumns.length > 0 && (
          <div className="panel" style={{ boxShadow: 'none' }}>
            <div className="panelHeader">
              <h2>Boolean filters</h2>
            </div>
            <div className="panelBody" style={{ display: 'grid', gap: 12 }}>
              {boolColumns.map((c) => {
                const bf = asBooleanFilter(filters[c.key]);
                return (
                  <div key={c.key}>
                    <div className="small" style={{ marginBottom: 6 }}>
                      {c.label}
                    </div>
                    <select
                      className="input"
                      value={bf}
                      onChange={(e) => onFilters({ ...filters, [c.key]: e.target.value })}
                    >
                      <option value="any">any</option>
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


