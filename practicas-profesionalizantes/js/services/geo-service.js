export function provinceName(feature) {
  return feature.properties.NAM || feature.properties.FNA || feature.properties.nombre || '';
}

export function provinceId(feature) {
  const raw = feature.properties.IN1 ?? feature.properties.ID_JURISDICCION ?? feature.properties.id;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

export function resultKey(result) {
  return Number(result.idJurisdiccion);
}

export function indexResultsByProvince(results) {
  return new Map(results.map(result => [resultKey(result), result]));
}
