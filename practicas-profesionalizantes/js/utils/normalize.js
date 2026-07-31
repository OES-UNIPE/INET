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
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return '';
  const number = Number(value);
  return number.toLocaleString('es-AR', {
    maximumFractionDigits: 1,
    minimumFractionDigits: number % 1 ? 1 : 0
  });
}
