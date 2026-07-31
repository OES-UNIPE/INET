import { normalize } from '../utils/normalize.js';

export function deriveOferentesView(model, { selectedKey = null, ambitoSeleccionado = null } = {}) {
  const allRows = model.oferentes;
  const jurisdictionRows = selectedKey
    ? (model.indices.oferentesPorJurisdiccion.get(Number(selectedKey)) || [])
    : allRows;
  const tableRows = ambitoSeleccionado
    ? jurisdictionRows.filter(row => row.ambito === ambitoSeleccionado)
    : jurisdictionRows;
  const mapRows = ambitoSeleccionado
    ? allRows.filter(row => row.ambito === ambitoSeleccionado)
    : allRows;

  const countsByJurisdiction = new Map(model.jurisdicciones.map(item => [item.idJurisdiccion, 0]));
  mapRows.forEach(row => countsByJurisdiction.set(row.idJurisdiccion, (countsByJurisdiction.get(row.idJurisdiccion) || 0) + 1));

  const distributionMap = new Map();
  jurisdictionRows.forEach(row => {
    if (!row.ambito) return;
    distributionMap.set(row.ambito, (distributionMap.get(row.ambito) || 0) + 1);
  });
  const distribution = [...distributionMap.entries()]
    .map(([ambito, count]) => ({ ambito, count }))
.sort((a, b) => {
      const aIsOther = normalize(a.ambito).replace(/\s+/g, ' ') === 'otro';
      const bIsOther = normalize(b.ambito).replace(/\s+/g, ' ') === 'otro';
      if (aIsOther !== bIsOther) return aIsOther ? 1 : -1;
      return b.count - a.count || a.ambito.localeCompare(b.ambito, 'es');
    });

  return { tableRows, countsByJurisdiction, distribution };
}

