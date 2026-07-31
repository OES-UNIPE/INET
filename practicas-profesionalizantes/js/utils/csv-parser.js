export function parseCSV(text) {
  const result = [];
  let row = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      cell += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(cell);
      cell = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(cell);
      if (row.some(value => value.trim() !== '')) result.push(row);
      row = [];
      cell = '';
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some(value => value.trim() !== '')) result.push(row);
  return result;
}

export function csvToObjects(text) {
  const matrix = parseCSV(text);
  if (!matrix.length) return [];
  const headers = matrix.shift().map(header => header.trim());

  return matrix.map((row, index) => {
    const obj = { __index: index };
    headers.forEach((header, columnIndex) => {
      obj[header] = (row[columnIndex] || '').trim();
    });
    return obj;
  });
}


