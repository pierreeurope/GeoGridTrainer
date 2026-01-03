import React from 'react';
import { loadCsv } from '../lib/csv';
import type { Row } from '../lib/types';
import { prettyColumnLabel } from '../lib/labels';

const DATA_URL = '/data/ui_countries.csv';
const HIDDEN_CATEGORIES = new Set(['code', 'flag_svg', 'Country', 'Continent codes', 'GDP per capita year']);

function normalizeString(s: unknown) {
  return String(s ?? '').trim();
}

function valueIsTruthy(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return !Number.isNaN(v);
  if (Array.isArray(v)) return v.some((x) => normalizeString(x).length > 0);
  const s = normalizeString(v).toLowerCase();
  if (!s) return false;
  if (s === 'false') return false;
  return true;
}

function rarityScore(row: Row): number {
  const val = row['Rarity'];
  if (typeof val === 'number') return val;
  const num = Number(val);
  return Number.isFinite(num) ? num : 0;
}

function isNumericCategory(rows: Row[], cat: string): boolean {
  if (isBooleanCategory(rows, cat)) return false;
  let numericCount = 0;
  let nonEmpty = 0;
  for (const r of rows) {
    const v = (r as any)[cat];
    if (v === null || v === undefined || v === '') continue;
    if (Array.isArray(v)) return false; // list column
    if (typeof v === 'boolean') return false;
    const s = normalizeString(v);
    if (!s) continue;
    nonEmpty++;
    // strict-ish numeric check
    if (/^-?\d+(\.\d+)?$/.test(s)) numericCount++;
  }
  if (nonEmpty === 0) return false;
  return numericCount / nonEmpty >= 0.8;
}

function isBooleanCategory(rows: Row[], cat: string): boolean {
  return rows.some(
    (r) =>
      typeof (r as any)[cat] === 'boolean' ||
      ['true', 'false'].includes(normalizeString((r as any)[cat]).toLowerCase())
  );
}

function collapseLabel(label: string): string {
  return label.replace(/\s+/g, ' ').trim();
}

export function LearningCategoryPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [categories, setCategories] = React.useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = React.useState<string>('');
  const [revealed, setRevealed] = React.useState<Set<string>>(new Set());
  const [query, setQuery] = React.useState('');
  const [errorBlink, setErrorBlink] = React.useState(false);
  const [numOp, setNumOp] = React.useState<'below' | 'above'>('below');
  const [numValue, setNumValue] = React.useState<string>('');
  const [colorMode, setColorMode] = React.useState<'any' | 'all'>('any');
  const [selectedColors, setSelectedColors] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    let cancelled = false;
    loadCsv(DATA_URL)
      .then(({ rows, headers }) => {
        if (cancelled) return;
        const cats = headers.filter((h) => !HIDDEN_CATEGORIES.has(h));
        setRows(rows);
        setCategories(cats);
        if (cats.length) {
          const pick = cats[Math.floor(Math.random() * cats.length)];
          setSelectedCategory(pick);
        }
      })
      .catch(() => {
        /* swallow for now */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedIsBool = React.useMemo(() => isBooleanCategory(rows, selectedCategory), [rows, selectedCategory]);
  const selectedIsNum = React.useMemo(() => isNumericCategory(rows, selectedCategory), [rows, selectedCategory]);
  const selectedIsList = React.useMemo(
    () => rows.some((r) => Array.isArray((r as any)[selectedCategory])),
    [rows, selectedCategory]
  );
  const selectedIsFlagColors = React.useMemo(() => {
    const pretty = prettyColumnLabel(selectedCategory).toLowerCase();
    return pretty.includes('flag colors') || pretty.includes('colors on flag');
  }, [selectedCategory]);

  const targetRows = React.useMemo(() => {
    if (!selectedCategory) return [];
    const numVal = Number(numValue);
    return rows
      .filter((r) => {
        const v = (r as any)[selectedCategory];
        if (selectedIsBool) {
          return v === true || normalizeString(v).toLowerCase() === 'true';
        }
        if (selectedIsFlagColors && Array.isArray(v)) {
          const colors = Array.isArray(v) ? v.map((x) => normalizeString(x).toLowerCase()) : [];
          if (!selectedColors.size) return true;
          if (colorMode === 'all') return Array.from(selectedColors).every((c) => colors.includes(c));
          return Array.from(selectedColors).some((c) => colors.includes(c));
        }
        if (selectedIsNum && numValue.trim()) {
          const n = Number(v);
          if (Number.isNaN(n) || Number.isNaN(numVal)) return false;
          return numOp === 'below' ? n <= numVal : n >= numVal;
        }
        return valueIsTruthy(v);
      })
      .sort((a, b) => rarityScore(b) - rarityScore(a));
  }, [rows, selectedCategory, numOp, numValue, selectedColors, colorMode, selectedIsBool, selectedIsNum, selectedIsFlagColors]);

  const targetCodes = React.useMemo(() => new Set(targetRows.map((r) => String((r as any).code ?? '').toUpperCase())), [targetRows]);

  const suggestions = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return rows
      .filter((r) => String(r.Country || '').toLowerCase().includes(q))
      .slice(0, 8)
      .map((r) => ({ name: String(r.Country || ''), code: String((r as any).code || '').toUpperCase() }));
  }, [rows, query]);

  const colorOptions = React.useMemo(() => {
    const set = new Set<string>();
    rows.forEach((r) => {
      const c = (r as any)[selectedCategory];
      if (Array.isArray(c)) c.forEach((col) => set.add(normalizeString(col).toLowerCase()));
    });
    return Array.from(set).filter(Boolean).sort();
  }, [rows, selectedCategory]);

  const handleGuess = (code: string) => {
    if (!code) return;
    if (targetCodes.has(code)) {
      setRevealed((prev) => new Set(prev).add(code));
      setQuery('');
    } else {
      setErrorBlink(true);
      setTimeout(() => setErrorBlink(false), 300);
    }
  };

  const revealAll = () => {
    setRevealed(new Set(targetCodes));
  };

  const changeCategory = (cat: string) => {
    setSelectedCategory(cat);
    setRevealed(new Set());
    setQuery('');
    setNumValue('');
    setSelectedColors(new Set());
  };

  const pickRandom = () => {
    if (!categories.length) return;
    const pick = categories[Math.floor(Math.random() * categories.length)];
    changeCategory(pick);
  };

  return (
    <div className="container">
      <div className="panel">
        <div className="panelHeader">
          <h2>Learning a Category</h2>
          <div className="btnRow" style={{ alignItems: 'center' }}>
            <select
              className="input"
              style={{ width: 220 }}
              value={selectedCategory}
              onChange={(e) => changeCategory(e.target.value)}
            >
              {categories.map((c) => (
                <option key={c} value={c}>
                  {collapseLabel(prettyColumnLabel(c))}
                </option>
              ))}
            </select>
            {selectedIsNum && !selectedIsBool && (
              <div className="btnRow" style={{ alignItems: 'center' }}>
                <select className="input" style={{ width: 120 }} value={numOp} onChange={(e) => setNumOp(e.target.value === 'above' ? 'above' : 'below')}>
                  <option value="below">≤</option>
                  <option value="above">≥</option>
                </select>
                <input
                  className="input"
                  style={{ width: 160 }}
                  placeholder="Enter number…"
                  value={numValue}
                  onChange={(e) => setNumValue(e.target.value)}
                  inputMode="decimal"
                />
              </div>
            )}
            {selectedIsFlagColors && selectedIsList && (
              <div className="btnRow" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                <div className="btnRow">
                  <label className="small">
                    <input
                      type="radio"
                      name="colormode"
                      checked={colorMode === 'any'}
                      onChange={() => setColorMode('any')}
                    />{' '}
                    Any
                  </label>
                  <label className="small">
                    <input
                      type="radio"
                      name="colormode"
                      checked={colorMode === 'all'}
                      onChange={() => setColorMode('all')}
                    />{' '}
                    All
                  </label>
                </div>
                <div className="btnRow" style={{ flexWrap: 'wrap' }}>
                  {colorOptions.map((c) => (
                    <button
                      key={c}
                      className={`btn ${selectedColors.has(c) ? 'btnPrimary' : ''}`}
                      onClick={() => {
                        const next = new Set(selectedColors);
                        if (next.has(c)) next.delete(c);
                        else next.add(c);
                        setSelectedColors(next);
                      }}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </div>
            )}
            <button className="btn" onClick={pickRandom} disabled={!categories.length}>
              Random
            </button>
            <button className="btn btnPrimary" onClick={revealAll} disabled={!targetRows.length}>
              Reveal all
            </button>
          </div>
        </div>
        <div className="panelBody" style={{ display: 'grid', gap: 16 }}>
          <div className="btnRow" style={{ alignItems: 'center' }}>
            <div style={{ flex: 1, position: 'relative' }}>
              <input
                className={`input ${errorBlink ? 'inputError' : ''}`}
                placeholder="Type to find a country (e.g., “bah” → Bahamas)…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && suggestions.length) {
                    handleGuess(suggestions[0].code);
                  }
                }}
              />
              {query && suggestions.length > 0 && (
                <div className="suggestions">
                  {suggestions.map((s) => (
                    <button
                      key={s.code}
                      className="suggestionItem"
                      onClick={() => handleGuess(s.code)}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="pill">Countries in category: {targetRows.length}</div>
            <div className="pill">Found: {revealed.size}</div>
          </div>

          <div className="flagGrid">
            {targetRows.map((r) => {
              const code = String((r as any).code || '').toUpperCase();
              const revealedFlag = revealed.has(code);
              const flagUrl = (r as any).flag_svg as string | undefined;
              const name = revealedFlag ? (r.Country ?? code) : '???';
              return (
                <div key={code} className="flagCard">
                  <div className={`flagCardInner ${revealedFlag ? '' : 'flagHidden'}`}>
                    {flagUrl && revealedFlag ? <img className="flag" src={flagUrl} alt={`Flag ${r.Country ?? code}`} /> : <div className="flagPlaceholder" />}
                  </div>
                  <div className={`flagName ${revealedFlag ? '' : 'flagNameHidden'}`}>{name}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}


