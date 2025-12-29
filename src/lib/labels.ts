const ACRONYM_FIXES: Array<[RegExp, string]> = [
  [/\bH d i\b/gi, 'HDI'],
  [/\bG d p\b/gi, 'GDP'],
  [/\bC p i\b/gi, 'CPI'],
  [/\bIn e u\b/gi, 'EU'],
  [/\bWas u s s r\b/gi, 'USSR'],
  [/\bObserves d s t\b/gi, 'DST'],
  [/\bHosted f1\b/gi, 'Hosted F1'],
  [/\bCo2\b/g, 'CO2'],
  [/\bmens\b/gi, "Men's"],
  [/\beurasion\b/gi, 'Eurasian'],
];

function titleCaseWords(s: string) {
  return s
    .split(' ')
    .filter(Boolean)
    .map((w) => (w.length <= 2 ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1)))
    .join(' ');
}

export function prettyColumnLabel(raw: string): string {
  // Keep core keys
  if (raw === 'Country') return 'Country';
  if (raw === 'code') return 'Code';
  if (raw === 'flag_svg') return 'Flag';

  // Normalize separators: "Section - Thing" -> "Section: Thing"
  let s = raw.replace(/\s+-\s+/g, ': ');

  // spacing fixes
  s = s.replace(/\bTop10\b/gi, 'Top 10');
  s = s.replace(/\bHas50\b/gi, '50+');
  s = s.replace(/codes_json\b/gi, 'codes');
  s = s.replace(/\bBorder countries codes\b/gi, 'Border country codes');
  s = s.replace(/\bColors on flag\b/gi, 'Flag colors');

  for (const [re, rep] of ACRONYM_FIXES) s = s.replace(re, rep);

  // Title-case section names, keep acronyms
  const parts = s.split(':').map((p) => p.trim());
  if (parts.length >= 2) {
    const section = titleCaseWords(parts[0]);
    const rest = parts.slice(1).join(': ').trim();
    return `${section}: ${rest}`;
  }
  return s;
}

export function splitGroupLabel(label: string): { group?: string; leaf: string } {
  // Expect format "Group: Leaf". If no group, return leaf only.
  const idx = label.indexOf(':');
  if (idx === -1) return { leaf: label };
  const group = label.slice(0, idx).trim();
  const leaf = label.slice(idx + 1).trim();
  if (!group || !leaf) return { leaf: label };
  return { group, leaf };
}


