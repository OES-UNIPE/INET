const NORMATIVE_HTML_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQNJ9-0IrMG01KtChyy_I4csDc1-87mVxzfw4j8zsS1QRwml8XpSoMTFWqzNgEsMyMSB8Zwt4rFkwgr/pubhtml?gid=697939959&single=true&widget=false&headers=false';

function cleanGoogleRedirect(url) {
  if (!url) return '';
  try {
    const parsed = new URL(url, window.location.href);
    if (parsed.hostname === 'www.google.com' && parsed.pathname === '/url') {
      return parsed.searchParams.get('q') || url;
    }
    return parsed.href;
  } catch {
    return url;
  }
}

function cellText(cell) {
  return (cell.textContent || '').trim();
}

function parsePublishedTable(html) {
  const document = new DOMParser().parseFromString(html, 'text/html');
  const rows = Array.from(document.querySelectorAll('table tr'))
    .map(row => Array.from(row.querySelectorAll('th, td')));

  const headerRowIndex = rows.findIndex(cells => cells.some(cell => cellText(cell) === 'Jurisdicción'));
  if (headerRowIndex < 0) return [];

  const headerCells = rows[headerRowIndex];
  const offset = cellText(headerCells[0]) === '1' ? 1 : 0;
  const headers = headerCells.slice(offset).map(cellText);

  return rows.slice(headerRowIndex + 1)
    .map((cells, index) => {
      const values = cells.slice(offset);
      const row = { __index: index };
      headers.forEach((header, columnIndex) => {
        const cell = values[columnIndex];
        if (!cell) {
          row[header] = '';
          return;
        }

        const link = cell.querySelector('a[href]');
        row[header] = header === 'Enlace' && link
          ? cleanGoogleRedirect(link.getAttribute('href'))
          : cellText(cell);
      });
      return row;
    })
    .filter(row => headers.some(header => row[header]));
}

export async function loadNormatives() {
  const response = await fetch(NORMATIVE_HTML_URL);
  if (!response.ok) throw new Error(`No se pudo cargar el repositorio (${response.status})`);
  const html = await response.text();
  return parsePublishedTable(html);
}
