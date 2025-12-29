import React from 'react';
import type { SortingState } from '@tanstack/react-table';
import { loadCsv, defaultColumnSpecs } from './lib/csv';
import type { ColumnSpec, Row } from './lib/types';
import { ColumnVisibility } from './components/ColumnVisibility';
import { DataTable } from './components/DataTable';

const DATA_URL = '/data/ui_countries.csv';

type FilterState = Record<string, unknown>;

export function App() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [headers, setHeaders] = React.useState<string[]>([]);
  const [columns, setColumns] = React.useState<ColumnSpec[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [globalQuery, setGlobalQuery] = React.useState('');
  const [filters, setFilters] = React.useState<FilterState>({});
  const [sorting, setSorting] = React.useState<SortingState>([
    { id: 'Country', desc: false },
  ]);

  const [visible, setVisible] = React.useState<Record<string, boolean>>({});

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadCsv(DATA_URL)
      .then(({ rows, headers }) => {
        if (cancelled) return;
        setRows(rows);
        setHeaders(headers);
        const specs = defaultColumnSpecs(headers, rows).map((c) => ({
          ...c,
          // Keep for the "Reset defaults" button (we now default to showing everything).
          hiddenByDefault: c.key === 'flag_svg',
        }));
        setColumns(specs);

        const nextVisible: Record<string, boolean> = {};
        // Default: show all columns (user preference)
        for (const c of specs) nextVisible[c.key] = true;
        setVisible(nextVisible);

        // If present, make Rarity the default sort (most rare first).
        if (headers.includes('Rarity')) {
          setSorting([{ id: 'Rarity', desc: true }]);
        }
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="container">
      <div className="topbar">
        <div className="brand">
          <h1>GeoGridTrainer</h1>
          <p>Click a column header’s filter button to filter. Click the header text to sort.</p>
        </div>
      </div>

      {loading && (
        <div className="panel">
          <div className="panelHeader">
            <h2>Loading dataset…</h2>
          </div>
          <div className="panelBody">
            <div className="hint">Fetching {DATA_URL} and parsing CSV in the browser.</div>
          </div>
        </div>
      )}

      {error && (
        <div className="panel">
          <div className="panelHeader">
            <h2 style={{ color: 'var(--danger)' }}>Error</h2>
          </div>
          <div className="panelBody">
            <div className="mono">{error}</div>
            <div className="hint" style={{ marginTop: 10 }}>
              Make sure <span className="mono">public/data/ui_countries.csv</span> exists.
            </div>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="panel">
          <div className="panelHeader">
            <h2>Countries</h2>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
              <input
                className="input"
                style={{ width: 320 }}
                placeholder="Search…"
                value={globalQuery}
                onChange={(e) => setGlobalQuery(e.target.value)}
              />
              <button className="btn" onClick={() => setFilters({})}>
                Clear filters
              </button>
              <ColumnVisibility columns={columns} visible={visible} onChange={setVisible} />
            </div>
          </div>
          <div className="panelBody" style={{ padding: 0 }}>
            <DataTable
              rows={rows}
              columns={columns}
              globalQuery={globalQuery}
              columnFilters={filters}
              sorting={sorting}
              onSortingChange={setSorting}
              onColumnFiltersChange={setFilters}
              visible={visible}
            />
          </div>
        </div>
      )}

      <div style={{ marginTop: 14 }} className="hint">
        Dataset columns: {headers.length}.
      </div>
    </div>
  );
}


