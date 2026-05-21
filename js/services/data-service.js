import { CSV_URL, ND } from '../config/fields.js';
import { csvToObjects } from '../utils/csv-parser.js';
import { get, normalize } from '../utils/normalize.js';

function parseTimestamp(value) {
  const raw = String(value || '').trim();
  if (!raw) return Number.NEGATIVE_INFINITY;

  const direct = Date.parse(raw);
  if (!Number.isNaN(direct)) return direct;

  const match = raw.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/);
  if (!match) return Number.NEGATIVE_INFINITY;

  const day = Number(match[1]);
  const month = Number(match[2]) - 1;
  const year = Number(match[3].length === 2 ? `20${match[3]}` : match[3]);
  const hour = Number(match[4] || 0);
  const minute = Number(match[5] || 0);
  const second = Number(match[6] || 0);
  return new Date(year, month, day, hour, minute, second).getTime();
}

function latestByJurisdiction(data) {
  const map = new Map();

  data.forEach(row => {
    const jurisdiction = get(row, 'jurisdiccion');
    if (jurisdiction === ND) return;

    const key = normalize(jurisdiction);
    const timestamp = parseTimestamp(get(row, 'timestamp'));
    const current = map.get(key);

    if (!current || timestamp > current.__ts || (timestamp === current.__ts && row.__index > current.__index)) {
      map.set(key, { ...row, __ts: timestamp, __jurisdictionKey: key });
    }
  });

  return [...map.values()].sort((a, b) => get(a, 'jurisdiccion').localeCompare(get(b, 'jurisdiccion'), 'es'));
}

export async function loadJurisdictionRows() {
  const response = await fetch(CSV_URL, { cache: 'no-store' });
  if (!response.ok) throw new Error(`No se pudo leer el CSV publicado. Estado HTTP: ${response.status}`);

  const csvText = await response.text();
  const allRows = csvToObjects(csvText).filter(row => get(row, 'jurisdiccion') !== ND);
  return latestByJurisdiction(allRows);
}
