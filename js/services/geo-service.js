import { normalize } from '../utils/normalize.js';

export function provinceName(feature) {
  return feature.properties.NAM || feature.properties.FNA || feature.properties.nombre || '';
}

export function provinceKey(feature) {
  const key = normalize(provinceName(feature));
  if (key === 'ciudad autonoma de buenos aires' || key === 'ciudad de buenos aires') return 'caba';
  return key;
}

export function resultKey(row) {
  const key = row.__jurisdictionKey;
  if (key === 'ciudad autonoma de buenos aires' || key === 'ciudad de buenos aires') return 'caba';
  return key;
}

export function indexResultsByProvince(results) {
  const index = new Map();
  results.forEach(result => {
    index.set(resultKey(result.row), result);
  });
  return index;
}
