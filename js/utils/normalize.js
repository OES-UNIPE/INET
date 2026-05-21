import { fields, ND } from '../config/fields.js';

export function normalize(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function escapeHTML(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function formatNumber(value) {
  return Number(value).toLocaleString('es-AR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: value % 1 ? 1 : 0
  });
}

export function get(row, key) {
  const field = fields[key];
  const direct = row[field];
  if (direct && direct.trim()) return direct.trim();

  const normalizedField = normalize(field);
  const matchedHeader = Object.keys(row).find(header => !header.startsWith('__') && normalize(header) === normalizedField);
  const fallback = matchedHeader ? row[matchedHeader] : '';
  return fallback && fallback.trim() ? fallback.trim() : ND;
}

export function hasCleanValue(value) {
  const clean = normalize(value);
  return !!clean && clean !== normalize(ND);
}

export function splitOptions(value) {
  if (!hasCleanValue(value)) return [];
  return String(value)
    .split(',')
    .map(option => option.trim())
    .filter(Boolean);
}

export function titleCase(value) {
  return String(value || '')
    .split(' ')
    .filter(Boolean)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}
