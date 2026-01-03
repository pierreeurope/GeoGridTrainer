import React from 'react';
import { loadCsv } from '../lib/csv';
import type { Row } from '../lib/types';
import { prettyColumnLabel, splitGroupLabel } from '../lib/labels';

const DATA_URL = '/data/ui_countries.csv';

// Order by perceived usefulness for grid questions (rarer first, geography heavy)
const PRIORITY_KEYS = [
  'Rarity',
  'Population',
  'Area km²',
  'Flag colors',
  'Has star',
  'Has coat of arms',
  'Has animal',
  'Landlocked',
  'Island nation',
  'Coastline length',
  'Coastline',
  'Touching sahara',
  'Rivers',
  'Touches eurasian steppe',
  'Touches equator',
  'Border count',
  // 'Border country codes' removed per request
  'HDI',
  'GDP per capita',
  'GDP per capita year',
  'Top20 wheat production',
  'Top20 oil production',
  'Top20 renewable electricity production',
  'Producing nuclear power',
  'Is monarchy',
  'In EU',
  'Has nuclear weapons',
  'Was USSR',
  'In commonwealth',
  'Time zones',
  // 'Observes DST' removed per request
  'Same sex marriage legal',
  // 'Same sex activities illegal' removed per request
  'CPI',
  // 'Is territory' removed per request
  'Olympic medals',
  'Hosted olympics',
  'Hosted mens world cup',
  'Played mens world cup',
  'Won mens world cup',
  'Drives left',
  'Has alcohol ban',
  'Has 50 skyscrapers',
  'Top20 obesity rate',
  'Top20 chocolate consumption',
  'Top20 alcohol consumption',
  'Top20 population density',
  'Bottom20 population density',
  'Top20 tourism rate',
  'Top20 rail size',
  'Top20 world heritage sites',
  'Air pollution',
  'CO2 emissions',
];

function makeFacts(row: Row): Array<{ key: string; label: string; value: string }> {
  const skip = new Set([
    'Country',
    'code',
    'flag_svg',
    'Continent codes',
    'Border country codes',
    'Is territory',
    'Same sex activities illegal',
    'Observes DST',
  ]);
  const facts: Array<{ key: string; label: string; value: string }> = [];
  for (const [k, v] of Object.entries(row)) {
    if (skip.has(k)) continue;
    if (v === null || v === undefined || v === '') continue;
    const val = Array.isArray(v) ? v.join(', ') : String(v);
    const pretty = prettyColumnLabel(k);
    const { leaf } = splitGroupLabel(pretty);
    facts.push({ key: leaf.toLowerCase(), label: leaf, value: val });
  }

  const priorityIndex = new Map<string, number>();
  PRIORITY_KEYS.forEach((k, idx) => priorityIndex.set(k.toLowerCase(), idx));

  return facts.sort((a, b) => {
    const ai = priorityIndex.has(a.key) ? priorityIndex.get(a.key)! : Number.MAX_SAFE_INTEGER;
    const bi = priorityIndex.has(b.key) ? priorityIndex.get(b.key)! : Number.MAX_SAFE_INTEGER;
    if (ai !== bi) return ai - bi;
    return a.label.localeCompare(b.label);
  });
}

export function LearningCountryPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [current, setCurrent] = React.useState<Row | null>(null);
  const [showAnswers, setShowAnswers] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    loadCsv(DATA_URL)
      .then(({ rows }) => {
        if (cancelled) return;
        setRows(rows);
        if (rows.length) setCurrent(rows[Math.floor(Math.random() * rows.length)]);
      })
      .catch((e) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const nextCard = () => {
    if (!rows.length) return;
    const next = rows[Math.floor(Math.random() * rows.length)];
    setCurrent(next);
    setShowAnswers(false);
  };

  const facts = current ? makeFacts(current) : [];
  const flagUrl = (current?.flag_svg as string | undefined) || '';

  if (error) {
    return (
      <div className="container">
        <div className="panel">
          <div className="panelHeader">
            <h2 style={{ color: 'var(--danger)' }}>Error</h2>
          </div>
          <div className="panelBody mono">{error}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="panel">
        <div className="panelHeader">
          <h2>Learning a Country</h2>
          <div className="btnRow">
            <button className="btn btnPrimary" onClick={nextCard} disabled={!rows.length}>
              New card
            </button>
          </div>
        </div>
        <div className="panelBody" style={{ display: 'flex', justifyContent: 'center' }}>
          <div
            className="card"
            onClick={() => setShowAnswers((v) => !v)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setShowAnswers((v) => !v);
            }}
          >
            <div className="cardHeaderRow">
              <div>
                <div className="cardCountryName">{current?.Country ?? 'Loading…'}</div>
                <div className="cardHint">{showAnswers ? 'Click to hide' : 'Click to reveal facts'}</div>
              </div>
              {flagUrl ? (
                <div className="cardFlagWrap">
                  <img className="cardFlag" src={flagUrl} alt={`Flag ${current?.Country ?? ''}`} />
                </div>
              ) : null}
            </div>
            <div className="cardList">
              {current ? (
                facts.map((c) => (
                  <div key={c.label} className="cardItem">
                    <span className="cardItemKey">{c.label}</span>
                    <span className={`cardItemValue ${showAnswers ? '' : 'mutedValue'}`}>
                      {showAnswers ? c.value : '—'}
                    </span>
                  </div>
                ))
              ) : (
                <div className="cardHint">Loading…</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}



