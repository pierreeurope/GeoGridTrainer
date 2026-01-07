import React from 'react';
import { loadCsv } from '../lib/csv';
import type { Row } from '../lib/types';

const DATA_URL = '/data/ui_countries.csv';

// ---------- CATEGORY DEFINITIONS ----------
// Each category from GeoGrid boards mapped to a filter function

type CategoryFilter = (row: Row) => boolean;

interface CategoryDef {
  name: string;
  filter: CategoryFilter;
}

// Helper: get country name
function countryName(row: Row): string {
  return String(row.Country ?? '').trim();
}

// Helper: normalize string
function norm(s: unknown): string {
  return String(s ?? '').trim().toLowerCase();
}

// Helper: check if array column contains value
function arrContains(row: Row, col: string, val: string): boolean {
  const arr = (row as any)[col];
  if (!Array.isArray(arr)) return false;
  return arr.some((x) => norm(x) === val.toLowerCase());
}

// Helper: get numeric value
function num(row: Row, col: string): number {
  const v = (row as any)[col];
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// Helper: check boolean column
function bool(row: Row, col: string): boolean {
  const v = (row as any)[col];
  if (typeof v === 'boolean') return v;
  return norm(v) === 'true';
}

// Helper: check if country name ends with letter
function endsWithLetter(row: Row, letter: string): boolean {
  const name = countryName(row).toLowerCase();
  if (!name) return false;
  return name.endsWith(letter.toLowerCase());
}

// Helper: check if country name starts with letter
function startsWithLetter(row: Row, letter: string): boolean {
  const name = countryName(row).toLowerCase();
  if (!name) return false;
  return name.startsWith(letter.toLowerCase());
}

// Helper: check if name is exactly N letters (ignoring spaces)
function nameLength(row: Row, len: number): boolean {
  const name = countryName(row).replace(/\s/g, '');
  return name.length === len;
}

// Helper: continent check
function inContinent(row: Row, code: string): boolean {
  return arrContains(row, 'Continent codes', code);
}

// Helper: coastline check
function hasCoastlineOn(row: Row, sea: string): boolean {
  return arrContains(row, 'Geography - Coastline', sea);
}

// Helper: borders specific country
function bordersCountry(row: Row, countryCode: string): boolean {
  const bordersJson = (row as any)['Geography - Border countries codes_json'];
  if (!bordersJson) return false;
  let arr: string[];
  if (Array.isArray(bordersJson)) {
    arr = bordersJson;
  } else if (typeof bordersJson === 'string') {
    try {
      arr = JSON.parse(bordersJson);
    } catch {
      return false;
    }
  } else {
    return false;
  }
  return arr.some((c) => norm(c) === countryCode.toLowerCase());
}

// Helper: river system check
function inRiverSystem(row: Row, river: string): boolean {
  return arrContains(row, 'Geography - Rivers', river);
}

// Helper: get country code
function getCode(row: Row): string {
  return String((row as any).code ?? '').toUpperCase();
}

// Official language mappings (extracted from geogrid_countries JSONs)
const ARABIC_OFFICIAL = new Set(["AE", "BH", "DJ", "DZ", "EG", "EH", "IQ", "JO", "KM", "KW", "LB", "LY", "MA", "ML", "MR", "OM", "PS", "QA", "SA", "SD", "SO", "SY", "TD", "TN", "YE"]);
const ENGLISH_OFFICIAL = new Set(["AG", "AI", "AS", "BB", "BI", "BM", "BS", "BW", "BZ", "CA", "CK", "CM", "CW", "DM", "FJ", "FK", "FM", "GD", "GG", "GH", "GI", "GM", "GS", "GU", "GY", "HK", "IE", "IM", "IN", "JE", "JM", "KE", "KI", "KN", "KY", "LC", "LR", "LS", "MH", "MP", "MT", "MW", "NA", "NF", "NG", "NR", "NU", "PG", "PH", "PK", "PN", "PR", "PW", "RW", "SB", "SC", "SD", "SG", "SL", "SS", "SX", "SZ", "TC", "TO", "TT", "TV", "TZ", "UG", "US", "VC", "VG", "VI", "VU", "WS", "ZA", "ZM", "ZW"]);
const FRENCH_OFFICIAL = new Set(["BE", "BI", "BJ", "BL", "CA", "CD", "CF", "CG", "CH", "CI", "CM", "DJ", "FR", "GA", "GF", "GN", "GP", "GQ", "HT", "KM", "LU", "MC", "MF", "MG", "MQ", "NC", "NE", "PF", "PM", "RE", "RW", "SC", "SN", "TD", "TF", "TG", "VU", "WF", "YT"]);
const SPANISH_OFFICIAL = new Set(["AR", "BO", "CL", "CO", "CR", "CU", "DO", "EC", "EH", "ES", "GQ", "GT", "HN", "MX", "NI", "PA", "PE", "PR", "PY", "SV", "UY", "VE"]);

// Build all category definitions
function buildCategories(): CategoryDef[] {
  const cats: CategoryDef[] = [];

  // --- FLAG COLORS ---
  const flagColors = ['red', 'blue', 'green', 'yellow', 'white', 'black'];
  for (const color of flagColors) {
    cats.push({
      name: `Flag with ${color}`,
      filter: (r) => arrContains(r, 'Flag - Colors on flag', color),
    });
  }

  cats.push({ name: 'Flag with a star/sun', filter: (r) => bool(r, 'Flag - Has star') });
  cats.push({ name: 'Flag with a coat of arms', filter: (r) => bool(r, 'Flag - Has coat of arms') });
  cats.push({ name: 'Flag with an animal', filter: (r) => bool(r, 'Flag - Has animal') });
  cats.push({ name: 'Flag with only red, white, and blue', filter: (r) => {
    const colors = (r as any)['Flag - Colors on flag'];
    if (!Array.isArray(colors)) return false;
    const set = new Set(colors.map((c: string) => norm(c)));
    return set.size <= 3 && 
           (set.has('red') || set.size === 0) && 
           (set.has('white') || set.size === 0) && 
           (set.has('blue') || set.size === 0) &&
           !Array.from(set).some(c => !['red', 'white', 'blue'].includes(c));
  }});
  
  cats.push({ name: 'Flag with only 2 colors', filter: (r) => {
    const colors = (r as any)['Flag - Colors on flag'];
    return Array.isArray(colors) && colors.length === 2;
  }});
  cats.push({ name: 'Flag with only 3 colors', filter: (r) => {
    const colors = (r as any)['Flag - Colors on flag'];
    return Array.isArray(colors) && colors.length === 3;
  }});
  cats.push({ name: 'Flag with only 4 colors', filter: (r) => {
    const colors = (r as any)['Flag - Colors on flag'];
    return Array.isArray(colors) && colors.length === 4;
  }});
  cats.push({ name: 'Flag with 5+ colors', filter: (r) => {
    const colors = (r as any)['Flag - Colors on flag'];
    return Array.isArray(colors) && colors.length >= 5;
  }});

  // --- CONTINENTS ---
  cats.push({ name: 'In Africa', filter: (r) => inContinent(r, 'AF') });
  cats.push({ name: 'In Asia', filter: (r) => inContinent(r, 'AS') });
  cats.push({ name: 'In Europe', filter: (r) => inContinent(r, 'EU') });
  cats.push({ name: 'In North America', filter: (r) => inContinent(r, 'NA') });
  cats.push({ name: 'In South America', filter: (r) => inContinent(r, 'SA') });
  cats.push({ name: 'In Oceania', filter: (r) => inContinent(r, 'OC') });

  // --- GEOGRAPHY ---
  cats.push({ name: 'Is landlocked', filter: (r) => bool(r, 'Geography - Landlocked') });
  cats.push({ name: 'Island nation', filter: (r) => bool(r, 'Geography - Island nation') });
  cats.push({ name: 'Touches the Equator', filter: (r) => bool(r, 'Geography - Touches equator') });
  cats.push({ name: 'Touches the Sahara Desert', filter: (r) => bool(r, 'Geography - Touches sahara') });
  cats.push({ name: 'Touches the Eurasian Steppe', filter: (r) => bool(r, 'Geography - Touches eurasion steppe') });
  cats.push({ name: 'Top 10 in number of lakes', filter: (r) => bool(r, 'Geography - Top10 lakes') });

  // Border counts
  cats.push({ name: 'Borders 1-2 countries', filter: (r) => { const n = num(r, 'Geography - Border count'); return n >= 1 && n <= 2; }});
  cats.push({ name: 'Borders 2-3 countries', filter: (r) => { const n = num(r, 'Geography - Border count'); return n >= 2 && n <= 3; }});
  cats.push({ name: 'Borders 3-4 countries', filter: (r) => { const n = num(r, 'Geography - Border count'); return n >= 3 && n <= 4; }});
  cats.push({ name: 'Borders 4-5 countries', filter: (r) => { const n = num(r, 'Geography - Border count'); return n >= 4 && n <= 5; }});
  cats.push({ name: 'Borders 5-6 countries', filter: (r) => { const n = num(r, 'Geography - Border count'); return n >= 5 && n <= 6; }});
  cats.push({ name: 'Borders 5+ countries', filter: (r) => num(r, 'Geography - Border count') >= 5 });

  // Borders specific countries
  cats.push({ name: 'Borders Russia', filter: (r) => bordersCountry(r, 'ru') });
  cats.push({ name: 'Borders China', filter: (r) => bordersCountry(r, 'cn') });
  cats.push({ name: 'Borders Brazil', filter: (r) => bordersCountry(r, 'br') });
  cats.push({ name: 'Borders France', filter: (r) => bordersCountry(r, 'fr') });

  // Coastlines
  cats.push({ name: 'Coastline on the Mediterranean Sea', filter: (r) => hasCoastlineOn(r, 'Mediterranean Sea') });
  cats.push({ name: 'Coastline on the Indian Ocean', filter: (r) => hasCoastlineOn(r, 'Indian Ocean') });
  cats.push({ name: 'Coastline on the Pacific Ocean', filter: (r) => hasCoastlineOn(r, 'Pacific Ocean') });
  cats.push({ name: 'Coastline on the Atlantic Ocean', filter: (r) => hasCoastlineOn(r, 'Atlantic Ocean') });
  cats.push({ name: 'Coastline on the North Atlantic Ocean', filter: (r) => hasCoastlineOn(r, 'North Atlantic Ocean') });
  cats.push({ name: 'Coastline on the South Atlantic Ocean', filter: (r) => hasCoastlineOn(r, 'South Atlantic Ocean') });
  cats.push({ name: 'Coastline on the Caribbean Sea', filter: (r) => hasCoastlineOn(r, 'Caribbean Sea') });
  cats.push({ name: 'Coastline on the South and East China Seas', filter: (r) => hasCoastlineOn(r, 'South and East China Seas') });

  // Coastline lengths
  cats.push({ name: 'Has coastline, with length greater than 100 km', filter: (r) => num(r, 'Geography - Coastline length') > 100 });
  cats.push({ name: 'Has coastline, with length greater than 500 km', filter: (r) => num(r, 'Geography - Coastline length') > 500 });
  cats.push({ name: 'Has coastline, with length greater than 1,000 km', filter: (r) => num(r, 'Geography - Coastline length') > 1000 });
  cats.push({ name: 'Has coastline, with length greater than 2,000 km', filter: (r) => num(r, 'Geography - Coastline length') > 2000 });
  cats.push({ name: 'Has coastline, with length greater than 5,000 km', filter: (r) => num(r, 'Geography - Coastline length') > 5000 });
  cats.push({ name: 'Has coastline, with length less than 100 km', filter: (r) => { const n = num(r, 'Geography - Coastline length'); return n > 0 && n < 100; }});
  cats.push({ name: 'Has coastline, with length less than 500 km', filter: (r) => { const n = num(r, 'Geography - Coastline length'); return n > 0 && n < 500; }});
  cats.push({ name: 'Has coastline, with length less than 1,000 km', filter: (r) => { const n = num(r, 'Geography - Coastline length'); return n > 0 && n < 1000; }});

  // Rivers
  cats.push({ name: 'Is part of the Nile River system', filter: (r) => inRiverSystem(r, 'Nile') });
  cats.push({ name: 'Is part of the Amazon River system', filter: (r) => inRiverSystem(r, 'Amazon') });
  cats.push({ name: 'Is part of the Danube River system', filter: (r) => inRiverSystem(r, 'Danube') });
  cats.push({ name: 'Is part of the Congo River system', filter: (r) => inRiverSystem(r, 'Congo') });
  cats.push({ name: 'Is part of the Niger River system', filter: (r) => inRiverSystem(r, 'Niger') });
  cats.push({ name: 'Is part of the Rhine River system', filter: (r) => inRiverSystem(r, 'Rhine') });
  cats.push({ name: 'Is part of the Mekong River system', filter: (r) => inRiverSystem(r, 'Mekong') });

  // --- POPULATION ---
  cats.push({ name: 'Population under 100k', filter: (r) => num(r, 'Population') < 100000 });
  cats.push({ name: 'Population under 1 million', filter: (r) => num(r, 'Population') < 1000000 });
  cats.push({ name: 'Population under 2 million', filter: (r) => num(r, 'Population') < 2000000 });
  cats.push({ name: 'Population under 5 million', filter: (r) => num(r, 'Population') < 5000000 });
  cats.push({ name: 'Population under 10 million', filter: (r) => num(r, 'Population') < 10000000 });
  cats.push({ name: 'Population under 20 million', filter: (r) => num(r, 'Population') < 20000000 });
  cats.push({ name: 'Population under 50 million', filter: (r) => num(r, 'Population') < 50000000 });
  cats.push({ name: 'Population under 100 million', filter: (r) => num(r, 'Population') < 100000000 });
  cats.push({ name: 'Population under 200 million', filter: (r) => num(r, 'Population') < 200000000 });
  cats.push({ name: 'Population over 1 million', filter: (r) => num(r, 'Population') > 1000000 });
  cats.push({ name: 'Population over 2 million', filter: (r) => num(r, 'Population') > 2000000 });
  cats.push({ name: 'Population over 5 million', filter: (r) => num(r, 'Population') > 5000000 });
  cats.push({ name: 'Population over 10 million', filter: (r) => num(r, 'Population') > 10000000 });
  cats.push({ name: 'Population over 20 million', filter: (r) => num(r, 'Population') > 20000000 });
  cats.push({ name: 'Population over 50 million', filter: (r) => num(r, 'Population') > 50000000 });
  cats.push({ name: 'Population over 100 million', filter: (r) => num(r, 'Population') > 100000000 });

  // --- AREA ---
  cats.push({ name: 'Area less than 5,000 km²', filter: (r) => num(r, 'Area km²') < 5000 });
  cats.push({ name: 'Area less than 10,000 km²', filter: (r) => num(r, 'Area km²') < 10000 });
  cats.push({ name: 'Area less than 50,000 km²', filter: (r) => num(r, 'Area km²') < 50000 });
  cats.push({ name: 'Area less than 100,000 km²', filter: (r) => num(r, 'Area km²') < 100000 });
  cats.push({ name: 'Area less than 200,000 km²', filter: (r) => num(r, 'Area km²') < 200000 });
  cats.push({ name: 'Area less than 1 million km²', filter: (r) => num(r, 'Area km²') < 1000000 });
  cats.push({ name: 'Area less than 2 million km²', filter: (r) => num(r, 'Area km²') < 2000000 });
  cats.push({ name: 'Area less than 20 million km²', filter: (r) => num(r, 'Area km²') < 20000000 });
  cats.push({ name: 'Area greater than 10,000 km²', filter: (r) => num(r, 'Area km²') > 10000 });
  cats.push({ name: 'Area greater than 50,000 km²', filter: (r) => num(r, 'Area km²') > 50000 });
  cats.push({ name: 'Area greater than 100,000 km²', filter: (r) => num(r, 'Area km²') > 100000 });
  cats.push({ name: 'Area greater than 200,000 km²', filter: (r) => num(r, 'Area km²') > 200000 });
  cats.push({ name: 'Area greater than 500,000 km²', filter: (r) => num(r, 'Area km²') > 500000 });
  cats.push({ name: 'Area greater than 1 million km²', filter: (r) => num(r, 'Area km²') > 1000000 });

  // --- GDP PER CAPITA ---
  cats.push({ name: 'GDP per capita under $5k', filter: (r) => num(r, 'Economy - G d p per capita') < 5000 });
  cats.push({ name: 'GDP per capita under $10k', filter: (r) => num(r, 'Economy - G d p per capita') < 10000 });
  cats.push({ name: 'GDP per capita under $20k', filter: (r) => num(r, 'Economy - G d p per capita') < 20000 });
  cats.push({ name: 'GDP per capita under $30k', filter: (r) => num(r, 'Economy - G d p per capita') < 30000 });
  cats.push({ name: 'GDP per capita under $40k', filter: (r) => num(r, 'Economy - G d p per capita') < 40000 });
  cats.push({ name: 'GDP per capita under $50k', filter: (r) => num(r, 'Economy - G d p per capita') < 50000 });
  cats.push({ name: 'GDP per capita under $60k', filter: (r) => num(r, 'Economy - G d p per capita') < 60000 });
  cats.push({ name: 'GDP per capita under $100k', filter: (r) => num(r, 'Economy - G d p per capita') < 100000 });
  cats.push({ name: 'GDP per capita over $10k', filter: (r) => num(r, 'Economy - G d p per capita') > 10000 });
  cats.push({ name: 'GDP per capita over $20k', filter: (r) => num(r, 'Economy - G d p per capita') > 20000 });
  cats.push({ name: 'GDP per capita over $30k', filter: (r) => num(r, 'Economy - G d p per capita') > 30000 });
  cats.push({ name: 'GDP per capita over $40k', filter: (r) => num(r, 'Economy - G d p per capita') > 40000 });
  cats.push({ name: 'GDP per capita over $50k', filter: (r) => num(r, 'Economy - G d p per capita') > 50000 });

  // --- HDI ---
  cats.push({ name: 'Human Development Index under 0.45', filter: (r) => num(r, 'Economy - H d i') < 0.45 });
  cats.push({ name: 'Human Development Index under 0.5', filter: (r) => num(r, 'Economy - H d i') < 0.5 });
  cats.push({ name: 'Human Development Index under 0.55', filter: (r) => num(r, 'Economy - H d i') < 0.55 });
  cats.push({ name: 'Human Development Index under 0.6', filter: (r) => num(r, 'Economy - H d i') < 0.6 });
  cats.push({ name: 'Human Development Index under 0.65', filter: (r) => num(r, 'Economy - H d i') < 0.65 });
  cats.push({ name: 'Human Development Index under 0.7', filter: (r) => num(r, 'Economy - H d i') < 0.7 });
  cats.push({ name: 'Human Development Index under 0.75', filter: (r) => num(r, 'Economy - H d i') < 0.75 });
  cats.push({ name: 'Human Development Index under 0.8', filter: (r) => num(r, 'Economy - H d i') < 0.8 });
  cats.push({ name: 'Human Development Index under 0.85', filter: (r) => num(r, 'Economy - H d i') < 0.85 });
  cats.push({ name: 'Human Development Index over 0.55', filter: (r) => num(r, 'Economy - H d i') > 0.55 });
  cats.push({ name: 'Human Development Index over 0.65', filter: (r) => num(r, 'Economy - H d i') > 0.65 });
  cats.push({ name: 'Human Development Index over 0.7', filter: (r) => num(r, 'Economy - H d i') > 0.7 });
  cats.push({ name: 'Human Development Index over 0.75', filter: (r) => num(r, 'Economy - H d i') > 0.75 });
  cats.push({ name: 'Human Development Index over 0.8', filter: (r) => num(r, 'Economy - H d i') > 0.8 });
  cats.push({ name: 'Human Development Index over 0.85', filter: (r) => num(r, 'Economy - H d i') > 0.85 });
  cats.push({ name: 'Human Development Index over 0.9', filter: (r) => num(r, 'Economy - H d i') > 0.9 });

  // --- CPI ---
  cats.push({ name: 'Corruption Perceptions Index under 30', filter: (r) => num(r, 'Politics - C p i') < 30 });
  cats.push({ name: 'Corruption Perceptions Index under 40', filter: (r) => num(r, 'Politics - C p i') < 40 });
  cats.push({ name: 'Corruption Perceptions Index under 50', filter: (r) => num(r, 'Politics - C p i') < 50 });
  cats.push({ name: 'Corruption Perceptions Index over 30', filter: (r) => num(r, 'Politics - C p i') > 30 });
  cats.push({ name: 'Corruption Perceptions Index over 40', filter: (r) => num(r, 'Politics - C p i') > 40 });
  cats.push({ name: 'Corruption Perceptions Index over 50', filter: (r) => num(r, 'Politics - C p i') > 50 });
  cats.push({ name: 'Corruption Perceptions Index over 60', filter: (r) => num(r, 'Politics - C p i') > 60 });
  cats.push({ name: 'Corruption Perceptions Index over 70', filter: (r) => num(r, 'Politics - C p i') > 70 });

  // --- OLYMPIC MEDALS ---
  cats.push({ name: 'Has never won an Olympic medal', filter: (r) => num(r, 'Sports - Olympic medals') === 0 });
  cats.push({ name: 'Fewer than 10 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') < 10 });
  cats.push({ name: 'Fewer than 20 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') < 20 });
  cats.push({ name: 'Fewer than 30 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') < 30 });
  cats.push({ name: 'Fewer than 40 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') < 40 });
  cats.push({ name: 'More than 10 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') > 10 });
  cats.push({ name: 'More than 20 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') > 20 });
  cats.push({ name: 'More than 30 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') > 30 });
  cats.push({ name: 'More than 40 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') > 40 });
  cats.push({ name: 'More than 50 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') > 50 });
  cats.push({ name: 'More than 100 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') > 100 });
  cats.push({ name: 'More than 200 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') > 200 });
  cats.push({ name: 'More than 300 Olympic medals', filter: (r) => num(r, 'Sports - Olympic medals') > 300 });

  // --- CAPITAL POPULATION ---
  // Note: We don't have capital population in the CSV, so these won't work perfectly
  // We'll skip these for now or add a placeholder

  // --- AIR POLLUTION ---
  cats.push({ name: 'Air pollution under 5 μg/m³', filter: (r) => num(r, 'Facts - Air pollution') < 5 });
  cats.push({ name: 'Air pollution under 10 μg/m³', filter: (r) => num(r, 'Facts - Air pollution') < 10 });
  cats.push({ name: 'Air pollution over 10 μg/m³', filter: (r) => num(r, 'Facts - Air pollution') > 10 });
  cats.push({ name: 'Air pollution over 20 μg/m³', filter: (r) => num(r, 'Facts - Air pollution') > 20 });

  // --- CO2 EMISSIONS ---
  cats.push({ name: 'CO₂ emissions per capita under 2 tCO₂/year', filter: (r) => num(r, 'Facts - Co2 emissions') < 2 });
  cats.push({ name: 'CO₂ emissions per capita under 3 tCO₂/year', filter: (r) => num(r, 'Facts - Co2 emissions') < 3 });
  cats.push({ name: 'CO₂ emissions per capita under 4 tCO₂/year', filter: (r) => num(r, 'Facts - Co2 emissions') < 4 });
  cats.push({ name: 'CO₂ emissions per capita over 3 tCO₂/year', filter: (r) => num(r, 'Facts - Co2 emissions') > 3 });
  cats.push({ name: 'CO₂ emissions per capita over 4 tCO₂/year', filter: (r) => num(r, 'Facts - Co2 emissions') > 4 });
  cats.push({ name: 'CO₂ emissions per capita over 5 tCO₂/year', filter: (r) => num(r, 'Facts - Co2 emissions') > 5 });
  cats.push({ name: 'CO₂ emissions per capita over 7 tCO₂/year', filter: (r) => num(r, 'Facts - Co2 emissions') > 7 });

  // --- POLITICS ---
  cats.push({ name: 'Is a monarchy', filter: (r) => bool(r, 'Politics - Is monarchy') });
  cats.push({ name: 'Member of the European Union', filter: (r) => bool(r, 'Politics - In e u') });
  cats.push({ name: 'Has nuclear weapons', filter: (r) => bool(r, 'Politics - Has nuclear weapons') });
  cats.push({ name: 'Was part of the USSR', filter: (r) => bool(r, 'Politics - Was u s s r') });
  cats.push({ name: 'Member of the Commonwealth', filter: (r) => bool(r, 'Politics - In commonwealth') });
  cats.push({ name: 'Has more than 1 time zone', filter: (r) => {
    const tz = (r as any)['Politics - Time zones'];
    if (!Array.isArray(tz)) return false;
    return tz.length > 1;
  }});
  cats.push({ name: 'Observes Daylight Savings Time', filter: (r) => bool(r, 'Politics - Observes d s t') });
  cats.push({ name: 'Same-sex marriage legalised', filter: (r) => bool(r, 'Politics - Same sex marriage legal') });
  cats.push({ name: 'Same-sex activities are illegal', filter: (r) => bool(r, 'Politics - Same sex activities illegal') });
  cats.push({ name: 'Alcohol prohibition', filter: (r) => bool(r, 'Facts - Has alcohol ban') });

  // --- SPORTS ---
  cats.push({ name: 'Has hosted a Formula 1 Grand Prix', filter: (r) => bool(r, 'Sports - Hosted f1') });
  cats.push({ name: 'Has hosted the Olympics', filter: (r) => bool(r, 'Sports - Hosted olympics') });
  cats.push({ name: 'Has hosted the Men\'s FIFA World Cup', filter: (r) => bool(r, 'Sports - Hosted mens world cup') });
  cats.push({ name: 'Has played in the Men\'s FIFA World Cup', filter: (r) => bool(r, 'Sports - Played mens world cup') });
  cats.push({ name: 'Has won the Men\'s FIFA World Cup', filter: (r) => bool(r, 'Sports - Won mens world cup') });

  // --- FACTS ---
  cats.push({ name: 'Drives on the left', filter: (r) => bool(r, 'Facts - Drives left') });
  cats.push({ name: 'Has 50+ skyscrapers', filter: (r) => bool(r, 'Facts - Has50 skyscrapers') });
  cats.push({ name: 'Produces nuclear power', filter: (r) => bool(r, 'Economy - Produces nuclear power') });
  cats.push({ name: 'Capital is not the most populated city', filter: (r) => {
    // We don't have this data directly, skip
    return false;
  }});
  
  // Top 20s
  cats.push({ name: 'Top 20 in obesity rate', filter: (r) => bool(r, 'Facts - Top20 obesity rate') });
  cats.push({ name: 'Top 20 in chocolate consumption per capita', filter: (r) => bool(r, 'Facts - Top20 chocolate consumption') });
  cats.push({ name: 'Top 20 in alcohol consumption per capita', filter: (r) => bool(r, 'Facts - Top20 alcohol consumption') });
  cats.push({ name: 'Top 20 in population density', filter: (r) => bool(r, 'Facts - Top20 population density') });
  cats.push({ name: 'Bottom 20 in population density', filter: (r) => bool(r, 'Facts - Bottom20 population density') });
  cats.push({ name: 'Top 20 in annual tourist arrivals', filter: (r) => bool(r, 'Facts - Top20 tourism rate') });
  cats.push({ name: 'Top 20 in rail transport network size', filter: (r) => bool(r, 'Facts - Top20 rail size') });
  cats.push({ name: 'Top 20 in number of World Heritage sites', filter: (r) => bool(r, 'Facts - Top20 world heritage sites') });
  cats.push({ name: 'Top 20 in wheat production', filter: (r) => bool(r, 'Economy - Top20 wheat production') });
  cats.push({ name: 'Top 20 in oil production', filter: (r) => bool(r, 'Economy - Top20 oil production') });
  cats.push({ name: 'Top 20 in renewable electricity production', filter: (r) => bool(r, 'Economy - Top20 renewable electricity production') });

  // --- NAME-BASED CATEGORIES ---
  // Starting letters
  for (const letter of ['A', 'B', 'C', 'E', 'G', 'M', 'N', 'P', 'S', 'T']) {
    cats.push({ name: `Starts with letter ${letter}`, filter: (r) => startsWithLetter(r, letter) });
  }

  // Ending letters
  for (const letter of ['A', 'D', 'E', 'N', 'O', 'S', 'Y']) {
    cats.push({ name: `Ends with letter ${letter}`, filter: (r) => endsWithLetter(r, letter) });
  }

  // Name lengths
  for (const len of [4, 5, 6, 7, 8]) {
    cats.push({ name: `Name is ${len} letters long`, filter: (r) => nameLength(r, len) });
  }
  cats.push({ name: 'Name is 10+ letters long', filter: (r) => countryName(r).replace(/\s/g, '').length >= 10 });

  cats.push({ name: 'Name consists of multiple words', filter: (r) => countryName(r).includes(' ') });
  cats.push({ name: 'Starts and ends with the same letter', filter: (r) => {
    const name = countryName(r).toLowerCase();
    if (name.length < 2) return false;
    return name[0] === name[name.length - 1];
  }});

  // --- TIME ZONES ---
  cats.push({ name: 'Observes UTC+02:00 time zone', filter: (r) => arrContains(r, 'Politics - Time zones', 'UTC+02:00') });
  cats.push({ name: 'Observes UTC+03:00 time zone', filter: (r) => arrContains(r, 'Politics - Time zones', 'UTC+03:00') });

  // --- OFFICIAL LANGUAGES ---
  cats.push({ name: 'French is an official language', filter: (r) => FRENCH_OFFICIAL.has(getCode(r)) });
  cats.push({ name: 'English is an official language', filter: (r) => ENGLISH_OFFICIAL.has(getCode(r)) });
  cats.push({ name: 'Spanish is an official language', filter: (r) => SPANISH_OFFICIAL.has(getCode(r)) });
  cats.push({ name: 'Arabic is an official language', filter: (r) => ARABIC_OFFICIAL.has(getCode(r)) });

  return cats;
}

const ALL_CATEGORIES = buildCategories();
const CATEGORY_MAP = new Map(ALL_CATEGORIES.map((c) => [c.name, c.filter]));
const CATEGORY_NAMES = ALL_CATEGORIES.map((c) => c.name).sort();

// Get rarity score (higher = rarer)
function rarityScore(row: Row): number {
  const val = row['Rarity'];
  if (typeof val === 'number') return val;
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

// Type for tracking skipped countries per cell
type SkippedMap = { [cellKey: string]: Set<string> };

// Get all candidates for a cell (sorted by rarity)
function getCellCandidates(
  rows: Row[],
  rowCategory: string,
  colCategory: string
): Row[] {
  const rowFilter = CATEGORY_MAP.get(rowCategory);
  const colFilter = CATEGORY_MAP.get(colCategory);
  if (!rowFilter || !colFilter) return [];
  return rows
    .filter((r) => rowFilter(r) && colFilter(r))
    .sort((a, b) => rarityScore(b) - rarityScore(a));
}

// Solve the grid: find best country for each cell without duplicates
// Respects skipped countries per cell
function solveGrid(
  rows: Row[],
  rowCategories: string[],
  colCategories: string[],
  skipped: SkippedMap = {}
): (Row | null)[][] {
  const result: (Row | null)[][] = [
    [null, null, null],
    [null, null, null],
    [null, null, null],
  ];

  const usedCodes = new Set<string>();

  // Get matching rows for each cell, sorted by rarity (descending)
  const cellCandidates: Row[][][] = [];
  for (let ri = 0; ri < 3; ri++) {
    cellCandidates[ri] = [];
    for (let ci = 0; ci < 3; ci++) {
      const candidates = getCellCandidates(rows, rowCategories[ri], colCategories[ci]);
      const cellKey = `${ri}-${ci}`;
      const cellSkipped = skipped[cellKey] || new Set();
      // Filter out skipped countries for this cell
      const filtered = candidates.filter((r) => {
        const code = String((r as any).code ?? '').toUpperCase();
        return !cellSkipped.has(code);
      });
      cellCandidates[ri][ci] = filtered;
    }
  }

  // Greedy assignment: prioritize cells with fewer candidates
  const cells: { ri: number; ci: number; count: number }[] = [];
  for (let ri = 0; ri < 3; ri++) {
    for (let ci = 0; ci < 3; ci++) {
      cells.push({ ri, ci, count: cellCandidates[ri][ci].length });
    }
  }
  cells.sort((a, b) => a.count - b.count);

  for (const { ri, ci } of cells) {
    const candidates = cellCandidates[ri][ci];
    for (const row of candidates) {
      const code = String((row as any).code ?? '').toUpperCase();
      if (!usedCodes.has(code)) {
        result[ri][ci] = row;
        usedCodes.add(code);
        break;
      }
    }
  }

  return result;
}

// Count how many alternatives are available for a cell
function countAlternatives(
  rows: Row[],
  rowCategory: string,
  colCategory: string,
  skipped: Set<string>
): number {
  const candidates = getCellCandidates(rows, rowCategory, colCategory);
  return candidates.filter((r) => {
    const code = String((r as any).code ?? '').toUpperCase();
    return !skipped.has(code);
  }).length;
}

// Autocomplete category picker component
function CategoryPicker({
  value,
  onChange,
  pickerKey,
}: {
  value: string;
  onChange: (val: string) => void;
  pickerKey: string;
}) {
  const [query, setQuery] = React.useState('');
  const [isOpen, setIsOpen] = React.useState(false);
  const wrapperRef = React.useRef<HTMLDivElement>(null);

  // Close on outside click
  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = React.useMemo(() => {
    const q = query.toLowerCase().trim();
    if (!q) return CATEGORY_NAMES.slice(0, 15); // Show first 15 when empty
    return CATEGORY_NAMES.filter((c) => c.toLowerCase().includes(q)).slice(0, 20);
  }, [query]);

  const handleSelect = (cat: string) => {
    onChange(cat);
    setQuery('');
    setIsOpen(false);
  };

  const handleClear = () => {
    onChange('');
    setQuery('');
  };

  const displayValue = value || query;

  return (
    <div className="catPickerWrapper" ref={wrapperRef}>
      <div className="catInputRow">
        <input
          className="input catSearchInput"
          placeholder="Type to search..."
          value={isOpen ? query : (value || '')}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && filtered.length > 0) {
              handleSelect(filtered[0]);
            } else if (e.key === 'Escape') {
              setIsOpen(false);
            }
          }}
        />
        {value && (
          <button className="catClearBtn" onClick={handleClear} title="Clear">
            ×
          </button>
        )}
      </div>
      {isOpen && (
        <div className="catSuggestions">
          {filtered.length === 0 ? (
            <div className="catNoResults">No matching categories</div>
          ) : (
            filtered.map((cat) => (
              <button
                key={cat}
                className={`catSuggestionItem ${cat === value ? 'catSuggestionSelected' : ''}`}
                onClick={() => handleSelect(cat)}
              >
                {cat}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function SolveGridPage() {
  const [rows, setRows] = React.useState<Row[]>([]);
  const [rowCats, setRowCats] = React.useState<string[]>(['', '', '']);
  const [colCats, setColCats] = React.useState<string[]>(['', '', '']);
  const [solution, setSolution] = React.useState<(Row | null)[][] | null>(null);
  const [skipped, setSkipped] = React.useState<SkippedMap>({});

  React.useEffect(() => {
    loadCsv(DATA_URL)
      .then(({ rows }) => setRows(rows))
      .catch(() => {});
  }, []);

  const allFilled = rowCats.every((c) => c) && colCats.every((c) => c);

  React.useEffect(() => {
    if (allFilled && rows.length > 0) {
      const sol = solveGrid(rows, rowCats, colCats, skipped);
      setSolution(sol);
    } else {
      setSolution(null);
    }
  }, [rows, rowCats, colCats, allFilled, skipped]);

  const updateRowCat = (idx: number, val: string) => {
    const next = [...rowCats];
    next[idx] = val;
    setRowCats(next);
    // Reset skipped when categories change
    setSkipped({});
  };

  const updateColCat = (idx: number, val: string) => {
    const next = [...colCats];
    next[idx] = val;
    setColCats(next);
    // Reset skipped when categories change
    setSkipped({});
  };

  const clearAll = () => {
    setRowCats(['', '', '']);
    setColCats(['', '', '']);
    setSolution(null);
    setSkipped({});
  };

  const resetAlternatives = () => {
    setSkipped({});
  };

  // Skip the current country in a cell and show the next alternative
  const skipCountry = (ri: number, ci: number) => {
    const currentRow = solution?.[ri]?.[ci];
    if (!currentRow) return;

    const code = String((currentRow as any).code ?? '').toUpperCase();
    const cellKey = `${ri}-${ci}`;
    
    setSkipped((prev) => {
      const cellSet = new Set(prev[cellKey] || []);
      cellSet.add(code);
      return { ...prev, [cellKey]: cellSet };
    });
  };

  // Get count of remaining alternatives for a cell
  const getAlternativesCount = (ri: number, ci: number): number => {
    if (!allFilled) return 0;
    const cellKey = `${ri}-${ci}`;
    const cellSkipped = skipped[cellKey] || new Set();
    return countAlternatives(rows, rowCats[ri], colCats[ci], cellSkipped);
  };

  // Check if there are any skipped countries
  const hasSkipped = Object.values(skipped).some((s) => s.size > 0);

  return (
    <div className="container solveGridPage">
      <div className="panel">
        <div className="panelHeader">
          <h2>Solve Grid</h2>
          <p className="subtext">
            Select 3 row categories and 3 column categories. The solver will find the highest-rarity country for each cell (no duplicates).
            <br />
            <strong>Click a cell</strong> to cycle to the next best alternative if the data seems wrong.
          </p>
          <div className="panelHeaderBtns">
            <button className="btn" onClick={clearAll}>
              Clear All
            </button>
            {hasSkipped && (
              <button className="btn btnSecondary" onClick={resetAlternatives}>
                Reset Alternatives
              </button>
            )}
          </div>
        </div>

        <div className="solveGridContainer">
          {/* Top-left empty cell */}
          <div className="gridCorner" />

          {/* Column headers */}
          {colCats.map((cat, ci) => (
            <div key={`col-${ci}`} className="gridColHeader">
              <CategoryPicker
                value={cat}
                onChange={(v) => updateColCat(ci, v)}
                pickerKey={`col-${ci}`}
              />
            </div>
          ))}

          {/* Rows */}
          {rowCats.map((rowCat, ri) => (
            <React.Fragment key={`row-${ri}`}>
              {/* Row header */}
              <div className="gridRowHeader">
                <CategoryPicker
                  value={rowCat}
                  onChange={(v) => updateRowCat(ri, v)}
                  pickerKey={`row-${ri}`}
                />
              </div>

              {/* Cells */}
              {colCats.map((_, ci) => {
                const row = solution?.[ri]?.[ci];
                const flagUrl = row ? (row as any).flag_svg : null;
                const name = row ? row.Country : null;
                const rarity = row ? rarityScore(row) : null;
                const altCount = getAlternativesCount(ri, ci);
                const cellKey = `${ri}-${ci}`;
                const skippedCount = skipped[cellKey]?.size || 0;

                return (
                  <div
                    key={`cell-${ri}-${ci}`}
                    className={`gridCell ${row ? 'gridCellFilled gridCellClickable' : ''}`}
                    onClick={() => row && skipCountry(ri, ci)}
                    title={row ? `Click to see next alternative (${altCount - 1} more)` : undefined}
                  >
                    {row ? (
                      <>
                        {flagUrl && <img className="gridFlag" src={flagUrl} alt={String(name)} />}
                        <div className="gridCountryName">{name}</div>
                        <div className="gridRarity">Rarity: {rarity}</div>
                        <div className="gridAltCount">
                          {skippedCount > 0 && <span className="gridSkipped">#{skippedCount + 1}</span>}
                          {altCount > 1 && <span className="gridMore">+{altCount - 1} more</span>}
                        </div>
                      </>
                    ) : allFilled ? (
                      <div className="gridNoMatch">No match</div>
                    ) : (
                      <div className="gridEmpty">?</div>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>

        {solution && (
          <div className="solutionStats">
            <p>
              Found {solution.flat().filter(Boolean).length} / 9 countries
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

