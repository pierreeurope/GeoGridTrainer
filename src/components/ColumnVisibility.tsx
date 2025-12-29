import React from 'react';
import type { ColumnSpec } from '../lib/types';

export function ColumnVisibility({
  columns,
  visible,
  onChange,
}: {
  columns: ColumnSpec[];
  visible: Record<string, boolean>;
  onChange: (next: Record<string, boolean>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const shown = columns.filter((c) => visible[c.key]).length;

  return (
    <div style={{ position: 'relative' }}>
      <button className="btn" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        Columns ({shown}/{columns.length})
      </button>
      {open && (
        <div
          className="panel glassPanel"
          style={{
            position: 'absolute',
            right: 0,
            top: 'calc(100% + 10px)',
            width: 320,
            zIndex: 20,
          }}
        >
          <div className="panelHeader">
            <h2>Visible columns</h2>
            <button className="btn" onClick={() => setOpen(false)}>
              Close
            </button>
          </div>
          <div className="panelBody" style={{ maxHeight: 420, overflow: 'auto' }}>
            <div className="btnRow" style={{ marginBottom: 10 }}>
              <button
                className="btn"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  // Default is now "show everything"
                  for (const c of columns) next[c.key] = true;
                  onChange(next);
                }}
              >
                Reset defaults
              </button>
              <button
                className="btn"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  for (const c of columns) next[c.key] = true;
                  onChange(next);
                }}
              >
                Show all
              </button>
              <button
                className="btn"
                onClick={() => {
                  const next: Record<string, boolean> = {};
                  for (const c of columns) next[c.key] = false;
                  // keep Country visible
                  next['Country'] = true;
                  onChange(next);
                }}
              >
                Hide all
              </button>
            </div>
            <div style={{ display: 'grid', gap: 8 }}>
              {columns.map((c) => (
                <label key={c.key} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <input
                    type="checkbox"
                    checked={!!visible[c.key]}
                    onChange={(e) => onChange({ ...visible, [c.key]: e.target.checked })}
                  />
                  <span style={{ fontSize: 13 }}>
                    {c.group ? (
                      <>
                        <span className="small">{c.group}</span>
                        <span className="small"> · </span>
                      </>
                    ) : null}
                    {c.label}
                  </span>
                  <span className="small mono" style={{ marginLeft: 'auto' }}>
                    {c.kind}
                  </span>
                </label>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


