export const fmtInt = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
export const fmtPct = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });

export function percent(value) {
  return `${fmtPct.format(value)}%`;
}

export function normalizeText(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function normalizeLookupText(value) {
  return normalizeText(value)
    .replace(/[´`’‘]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[.,;]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/['"]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function downloadBlob(filename, content, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

