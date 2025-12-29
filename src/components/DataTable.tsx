import React from 'react';
import { createPortal } from 'react-dom';
import {
  ColumnDef,
  ColumnFiltersState,
  FilterFn,
  SortingState,
  SortingFn,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type { ColumnSpec, Row } from '../lib/types';
import type { BooleanFilter, ListFilter, NumberFilter } from '../lib/filters';
import { booleanMatches, includesText, listMatches, numberMatches } from '../lib/filters';
import { ColumnFilterMenu } from './ColumnFilterMenu';

type FilterValue = string | ListFilter | NumberFilter | BooleanFilter;

function isFilterActive(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (value === 'any') return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'object') {
    if ('values' in (value as any) && Array.isArray((value as any).values)) return (value as any).values.length > 0;
    if ('min' in (value as any) || 'max' in (value as any)) {
      const v = value as any;
      return typeof v.min === 'number' || typeof v.max === 'number';
    }
  }
  return true;
}

function filterIcon(kind: ColumnSpec['kind']) {
  // tiny inline SVGs (consistent stroke; no emoji)
  const common = {
    width: 16,
    height: 16,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };

  if (kind === 'boolean') {
    return (
      <svg {...common}>
        <path d="M7 12l3 3 7-7" />
        <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" strokeOpacity="0.35" />
      </svg>
    );
  }
  if (kind === 'number') {
    return (
      <svg {...common}>
        <path d="M8 3L6 21" />
        <path d="M18 3l-2 18" />
        <path d="M4 9h16" />
        <path d="M3 15h16" />
      </svg>
    );
  }
  if (kind === 'list') {
    return (
      <svg {...common}>
        <path d="M8 6h13" />
        <path d="M8 12h13" />
        <path d="M8 18h13" />
        <path d="M3 6h.01" />
        <path d="M3 12h.01" />
        <path d="M3 18h.01" />
      </svg>
    );
  }
  // string/country
  return (
    <svg {...common}>
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

const listFilterFn: FilterFn<Row> = (row, columnId, filterValue) => {
  const v = row.original[columnId];
  const f = filterValue as ListFilter;
  return listMatches(v, f);
};

const numberFilterFn: FilterFn<Row> = (row, columnId, filterValue) => {
  const v = row.original[columnId];
  const f = filterValue as NumberFilter;
  return numberMatches(v, f);
};

const booleanFilterFn: FilterFn<Row> = (row, columnId, filterValue) => {
  const v = row.original[columnId];
  const f = filterValue as BooleanFilter;
  return booleanMatches(v, f);
};

const textFilterFn: FilterFn<Row> = (row, columnId, filterValue) => {
  const v = row.original[columnId];
  const q = String(filterValue ?? '');
  return includesText(v, q);
};

const kindSorters: Record<string, SortingFn<Row>> = {
  boolean: (a, b, id) => {
    const av = a.original[id];
    const bv = b.original[id];
    const an = av === null ? 2 : av === false ? 0 : 1; // false < true < null
    const bn = bv === null ? 2 : bv === false ? 0 : 1;
    return an - bn;
  },
  number: (a, b, id) => {
    const av = a.original[id];
    const bv = b.original[id];
    const an = typeof av === 'number' ? av : av === null ? Number.POSITIVE_INFINITY : Number(av);
    const bn = typeof bv === 'number' ? bv : bv === null ? Number.POSITIVE_INFINITY : Number(bv);
    if (Number.isNaN(an) && Number.isNaN(bn)) return 0;
    if (Number.isNaN(an)) return 1;
    if (Number.isNaN(bn)) return -1;
    return an - bn;
  },
  list: (a, b, id) => {
    const av = a.original[id];
    const bv = b.original[id];
    const al = Array.isArray(av) ? av.length : av === null ? 0 : 1;
    const bl = Array.isArray(bv) ? bv.length : bv === null ? 0 : 1;
    if (al !== bl) return al - bl;
    const as = Array.isArray(av) ? av.join(',') : String(av ?? '');
    const bs = Array.isArray(bv) ? bv.join(',') : String(bv ?? '');
    return as.localeCompare(bs);
  },
  string: (a, b, id) => {
    const as = String(a.original[id] ?? '');
    const bs = String(b.original[id] ?? '');
    return as.localeCompare(bs);
  },
};

function renderCellValue(value: unknown): React.ReactNode {
  if (value === null || value === undefined) return <span className="tdMuted">—</span>;
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="tdMuted">[]</span>;
    return <span className="mono">{value.join(', ')}</span>;
  }
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return value.toLocaleString();
  return String(value);
}

export function DataTable({
  rows,
  columns,
  globalQuery,
  columnFilters,
  sorting,
  onSortingChange,
  onColumnFiltersChange,
  visible,
}: {
  rows: Row[];
  columns: ColumnSpec[];
  globalQuery: string;
  columnFilters: Record<string, FilterValue>;
  sorting: SortingState;
  onSortingChange: (s: SortingState) => void;
  onColumnFiltersChange: (next: Record<string, FilterValue>) => void;
  visible: Record<string, boolean>;
}) {
  const [openFilterFor, setOpenFilterFor] = React.useState<string | null>(null);
  const [anchorRect, setAnchorRect] = React.useState<DOMRect | null>(null);

  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenFilterFor(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      // Click outside closes popover; we rely on stopPropagation inside buttons/popovers
      setOpenFilterFor(null);
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  // Keep popover position correct on scroll/resize
  React.useEffect(() => {
    if (!openFilterFor) return;
    const update = () => {
      // nothing to do unless we have an anchor; caller sets it
      setAnchorRect((r) => (r ? r : null));
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [openFilterFor]);

  const groupedColDefs = React.useMemo<ColumnDef<Row>[]>(() => {
    // Build grouped headers like: Flags / Geography / ...
    // Only include groups that have at least one visible leaf.
    const leaves = columns.filter((c) => visible[c.key]);

    const groupOrder = ['Core', 'Flags', 'Geography', 'Economy', 'Politics', 'Sports', 'Facts', 'Other'];
    const byGroup = new Map<string, ColumnSpec[]>();
    for (const c of leaves) {
      const g = c.group ?? 'Other';
      if (!byGroup.has(g)) byGroup.set(g, []);
      byGroup.get(g)!.push(c);
    }

    const groups: Array<{ name: string; cols: ColumnSpec[] }> = [];
    for (const g of groupOrder) {
      const cols = byGroup.get(g);
      if (cols?.length) groups.push({ name: g, cols });
      byGroup.delete(g);
    }
    // Remaining groups (Other / misc)
    for (const [g, cols] of byGroup.entries()) groups.push({ name: g, cols });

    const buildLeaf = (c: ColumnSpec): ColumnDef<Row> => {
      const filterFn =
        c.kind === 'list'
          ? listFilterFn
          : c.kind === 'number'
            ? numberFilterFn
            : c.kind === 'boolean'
              ? booleanFilterFn
              : textFilterFn;

      if (c.key === 'Country') {
        return {
          id: c.key,
          accessorFn: (r) => r[c.key],
          header: c.label,
          cell: (ctx) => {
            const name = ctx.getValue() as string | null;
            const flag = ctx.row.original['flag_svg'];
            const code = ctx.row.original['code'];
            return (
              <div className="countryCell">
                {typeof flag === 'string' && flag ? (
                  <img className="flag" src={flag} alt={`Flag ${code ?? ''}`} loading="lazy" />
                ) : (
                  <div className="flag" />
                )}
                <div>
                  <div style={{ fontWeight: 600 }}>{name ?? '—'}</div>
                  <div className="small mono">{code ?? ''}</div>
                </div>
              </div>
            );
          },
          filterFn,
          sortingFn: kindSorters.string,
        };
      }

      return {
        id: c.key,
        accessorFn: (r) => r[c.key],
        header: c.label,
        cell: (ctx) => renderCellValue(ctx.getValue()),
        filterFn,
        sortingFn:
          c.kind === 'boolean'
            ? kindSorters.boolean
            : c.kind === 'number'
              ? kindSorters.number
              : c.kind === 'list'
                ? kindSorters.list
                : kindSorters.string,
      };
    };

    const defs: ColumnDef<Row>[] = [];
    for (const g of groups) {
      defs.push({
        id: `group:${g.name}`,
        header: g.name,
        columns: g.cols.map(buildLeaf),
      });
    }
    return defs;
  }, [columns, visible]);

  const tableColumnFilters = React.useMemo<ColumnFiltersState>(() => {
    const out: ColumnFiltersState = [];
    for (const [id, value] of Object.entries(columnFilters)) {
      // skip empty filters
      if (value === undefined || value === null) continue;
      if (typeof value === 'string' && value.trim() === '') continue;
      if (typeof value === 'object' && value && 'values' in value && Array.isArray((value as any).values)) {
        if ((value as any).values.length === 0) continue;
      }
      if (typeof value === 'object' && value && ('min' in value || 'max' in value)) {
        const v = value as NumberFilter;
        if (typeof v.min !== 'number' && typeof v.max !== 'number') continue;
      }
      if (value === 'any') continue;
      out.push({ id, value });
    }
    return out;
  }, [columnFilters]);

  const table = useReactTable({
    data: rows,
    columns: groupedColDefs,
    state: { sorting, columnFilters: tableColumnFilters, globalFilter: globalQuery },
    onSortingChange,
    onColumnFiltersChange: (next) => {
      // translate ColumnFiltersState -> Record
      const out: Record<string, FilterValue> = { ...columnFilters };
      // clear all current column filters, then reapply
      for (const k of Object.keys(out)) delete out[k];
      for (const f of next) out[f.id] = f.value as any;
      onColumnFiltersChange(out);
    },
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: (row, _columnId, filterValue) => {
      // global search: search across all visible columns
      const q = String(filterValue ?? '').trim();
      if (!q) return true;
      for (const c of columns) {
        if (!visible[c.key]) continue;
        if (includesText(row.original[c.key], q)) return true;
      }
      return false;
    },
    debugTable: false,
  });

  const rowModel = table.getRowModel();

  const specByKey = React.useMemo(() => {
    const m = new Map<string, ColumnSpec>();
    for (const c of columns) m.set(c.key, c);
    return m;
  }, [columns]);

  const leafGroupMeta = React.useMemo(() => {
    const leafIds = table.getAllLeafColumns().map((c) => c.id);
    const idToGroup = new Map<string, string>();
    for (const id of leafIds) {
      const g = specByKey.get(id)?.group ?? 'Other';
      idToGroup.set(id, g);
    }
    const boundaryLeft = new Set<string>();
    let prev: string | null = null;
    for (const id of leafIds) {
      const g = idToGroup.get(id) ?? 'Other';
      if (prev !== null && g !== prev) boundaryLeft.add(id);
      prev = g;
    }
    return { idToGroup, boundaryLeft };
  }, [table, specByKey]);

  return (
    <div className="panel tableWrap">
      <div className="tableToolbar">
        <div className="tableToolbarLeft">
          <div className="pill">
            Showing <b>{rowModel.rows.length}</b> / {rows.length}
          </div>
          <div className="pill">Sort: click headers</div>
        </div>
        <div className="pill">Dataset: ui_countries.csv</div>
      </div>

      <div
        style={{
          height: '70vh',
          overflow: 'auto',
          position: 'relative',
        }}
      >
        <table className="table">
          <thead>
            {table.getHeaderGroups().map((hg) => (
              <tr key={hg.id}>
                {hg.headers.map((h) => (
                  <th
                    key={h.id}
                    className={`th ${
                      !h.isPlaceholder &&
                      !h.column.columnDef.columns &&
                      leafGroupMeta.boundaryLeft.has(h.column.id)
                        ? 'thGroupBoundaryLeft'
                        : ''
                    }`}
                    colSpan={h.colSpan}
                  >
                    {h.isPlaceholder ? null : h.column.columnDef.columns ? (
                      <div className="thGroup">{flexRender(h.column.columnDef.header, h.getContext())}</div>
                    ) : (
                      <div className="thInner">
                        <div className="thLabel" onClick={h.column.getToggleSortingHandler()} title="Click to sort">
                          {flexRender(h.column.columnDef.header, h.getContext())}
                          {h.column.getIsSorted() === 'asc'
                            ? ' ▲'
                            : h.column.getIsSorted() === 'desc'
                              ? ' ▼'
                              : ''}
                        </div>
                        <button
                          className={`iconBtn ${isFilterActive((columnFilters as any)[h.column.id]) ? 'iconBtnActive' : ''}`}
                          title="Filter"
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                            setAnchorRect(rect);
                            setOpenFilterFor((cur) => (cur === h.column.id ? null : h.column.id));
                          }}
                        >
                          {filterIcon(specByKey.get(h.column.id)?.kind ?? 'string')}
                        </button>
                      </div>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {rowModel.rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    className={`td ${leafGroupMeta.boundaryLeft.has(cell.column.id) ? 'tdGroupBoundaryLeft' : ''}`}
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openFilterFor && anchorRect
        ? createPortal(
            (() => {
              const col = table.getAllLeafColumns().find((c) => c.id === openFilterFor);
              const spec = specByKey.get(openFilterFor) ?? { key: openFilterFor, label: openFilterFor, kind: 'string' as const };

              // position popover near button, clamp to viewport
              const pad = 10;
              const width = 380;
              const height = 520;
              const vw = window.innerWidth;
              const vh = window.innerHeight;

              let left = anchorRect.right - width;
              let top = anchorRect.bottom + 8;

              if (left < pad) left = pad;
              if (left + width > vw - pad) left = vw - pad - width;
              if (top + height > vh - pad) top = Math.max(pad, anchorRect.top - height - 8);

              return (
                <div
                  className="popoverPortal"
                  style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpenFilterFor(null);
                  }}
                >
                  <div
                    className="popover"
                    style={{ left, top, width, maxHeight: height, overflow: 'auto' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>{spec.group ? `${spec.group} · ${spec.label}` : spec.label}</div>
                      <button className="btn" onClick={() => setOpenFilterFor(null)}>
                        Close
                      </button>
                    </div>
                    <ColumnFilterMenu
                      column={spec}
                      rows={rows}
                      value={(columnFilters as any)[openFilterFor]}
                      onChange={(next) => onColumnFiltersChange({ ...(columnFilters as any), [openFilterFor]: next })}
                      onClear={() => {
                        const next = { ...(columnFilters as any) };
                        delete next[openFilterFor];
                        onColumnFiltersChange(next);
                      }}
                    />
                  </div>
                </div>
              );
            })(),
            document.body
          )
        : null}
    </div>
  );
}


