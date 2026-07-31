import { fields } from '../config/fields.js';
import { get, hasCleanValue, normalize, splitOptions } from '../utils/normalize.js';

function yes(value) {
  const clean = normalize(value);
  return clean.startsWith('si') || clean === '1' || clean === 'verdadero' || clean === 'true';
}

function scoreAnyValue(value) {
  return hasCleanValue(value) ? 1 : 0;
}

function scoreNormativa(value) {
  const clean = normalize(value);
  if (!clean || clean.includes('derogada')) return 0;
  if (clean.includes('revision') || clean.includes('actualizacion') || clean.includes('elaboracion')) return 0.5;
  if (clean === 'vigente' || clean.includes('ampliada') || clean.includes('modificada') || clean.includes('reemplazada')) return 1;
  if (clean.includes('vigente') && !clean.includes('nueva normativa')) return 1;
  return 0;
}

function scoreEquipo(value) {
  const clean = normalize(value);
  return clean && clean !== 'sin informacion' && !clean.includes('no se dispone de informacion') ? 1 : 0;
}

function scoreFrecuenciaReunion(value) {
  const clean = normalize(value);
  if (!clean || clean.includes('no se reune')) return 0;
  if (clean.includes('esporadica')) return 0.5;
  if (clean.includes('mensual') || clean.includes('mas frecuente') || clean.includes('bimestral') || clean.includes('trimestral')) return 1;
  return 0;
}

function scoreParticipacion(value) {
  const clean = normalize(value);
  if (!clean || clean.includes('ninguna')) return 0;
  if (clean.includes('1 a 3') || clean.includes('4 a 6')) return 0.5;
  if (clean.includes('7 a 10') || clean.includes('11 o mas')) return 1;
  return 0;
}

function scoreOptionCount(value) {
  const count = splitOptions(value).length;
  if (count === 0) return 0;
  if (count <= 2) return 0.5;
  return 1;
}

function parseYear(value) {
  const match = String(value || '').match(/(19|20)\d{2}/);
  return match ? Number(match[0]) : null;
}

function scoreAntiguedad(value) {
  const year = parseYear(value);
  if (!year) return 0;

  const age = Math.max(0, new Date().getFullYear() - year);
  return age <= 10 ? 0.5 : 1;
}

function dimensionLevel(ratio) {
  if (ratio >= 0.75) return 'Consolidado';
  if (ratio >= 0.35) return 'Intermedio';
  return 'Incipiente';
}

function questionForItem(item) {
  return item.keys.map(key => fields[key]).filter(Boolean).join(' / ');
}

function rawForItem(row, item) {
  return item.keys.map(key => get(row, key)).filter(Boolean).join(' | ');
}

export const dimensions = [
  {
    id: 'D1',
    title: 'Institucionalización formal',
    weight: 30,
    items: [
      { id: 'D1.1', label: 'Antigüedad institucional del Consejo', keys: ['anioCreacion'], score: row => scoreAntiguedad(get(row, 'anioCreacion')) },
      { id: 'D1.2', label: 'Tiene normativa específica', keys: ['tieneNorma'], score: row => (yes(get(row, 'tieneNorma')) ? 1 : 0) },
      { id: 'D1.3', label: 'Situación actual de la normativa', keys: ['estadoNorma'], score: row => scoreNormativa(get(row, 'estadoNorma')) },
      { id: 'D1.4', label: 'Cuenta con equipo permanente', keys: ['equipoPerm'], score: row => scoreEquipo(get(row, 'equipoPerm')) }
    ]
  },
  {
    id: 'D2',
    title: 'Funcionamiento efectivo',
    weight: 30,
    items: [
      { id: 'D2.1', label: 'Frecuencia de reunión del Consejo', keys: ['frecuenciaReun'], score: row => scoreFrecuenciaReunion(get(row, 'frecuenciaReun')) },
      { id: 'D2.2', label: 'Instituciones participantes en el último año', keys: ['participacion'], score: row => scoreParticipacion(get(row, 'participacion')) },
      { id: 'D2.3', label: 'Existen mesas, foros o instancias de trabajo', keys: ['instanciasTf'], score: row => (yes(get(row, 'instanciasTf')) ? 1 : 0) }
    ]
  },
  {
    id: 'D3',
    title: 'Articulación y representatividad',
    weight: 20,
    items: [
      { id: 'D3.1', label: 'Participan actores educativos/científicos', keys: ['actoresEduc'], score: row => scoreAnyValue(get(row, 'actoresEduc')) },
      { id: 'D3.2', label: 'Participan actores productivos/empresariales', keys: ['actoresProd'], score: row => scoreAnyValue(get(row, 'actoresProd')) },
      { id: 'D3.3', label: 'Participan otros actores o ámbitos', keys: ['otrosActores'], score: row => scoreAnyValue(get(row, 'otrosActores')) }
    ]
  },
  {
    id: 'D4',
    title: 'Vinculación con PP y ETP',
    weight: 20,
    items: [
      { id: 'D4.1', label: 'Cantidad de funciones desarrolladas con mayor frecuencia', keys: ['funcionesFrecuentes'], score: row => scoreOptionCount(get(row, 'funcionesFrecuentes')) },
      { id: 'D4.2', label: 'Cantidad de roles en relación con la ETP', keys: ['rolEtp'], score: row => scoreOptionCount(get(row, 'rolEtp')) },
      { id: 'D4.3', label: 'Participan actores en el desarrollo de PP', keys: ['actoresPp'], score: row => scoreAnyValue(get(row, 'actoresPp')) }
    ]
  }
];

export function evaluateInstitutionalization(row) {
  const dimResults = dimensions.map(dimension => {
    const items = dimension.items.map(item => {
      const max = item.max || 1;
      const value = Number(item.score(row) || 0);

      return {
        ...item,
        max,
        value,
        present: value > 0,
        question: questionForItem(item),
        raw: rawForItem(row, item)
      };
    });

    const totalValue = items.reduce((sum, item) => sum + item.value, 0);
    const maxValue = items.reduce((sum, item) => sum + item.max, 0);
    const ratio = maxValue ? totalValue / maxValue : 0;

    return {
      ...dimension,
      items,
      totalValue,
      maxValue,
      ratio,
      weighted: ratio * dimension.weight,
      level: dimensionLevel(ratio)
    };
  });

  const total = dimResults.reduce((sum, dimension) => sum + dimension.weighted, 0);
  const d1 = dimResults.find(dimension => dimension.id === 'D1');
  const d2 = dimResults.find(dimension => dimension.id === 'D2');
  const d1MeetsFloor = d1 && d1.level !== 'Incipiente';
  const d2MeetsFloor = d2 && d2.level !== 'Incipiente';
  const d1IsConsolidated = d1 && d1.level === 'Consolidado';
  const d2IsConsolidated = d2 && d2.level === 'Consolidado';
  const hasEveryDim = dimResults.every(dimension => dimension.totalValue > 0);

  let level = 'Incipiente';
  if (!d1MeetsFloor || !d2MeetsFloor) {
    level = 'Incipiente';
  } else if (total >= 65 && hasEveryDim && d1IsConsolidated && d2IsConsolidated) {
    level = 'Consolidado';
  } else if (total >= 35) {
    level = 'Intermedio';
  }

  return {
    row,
    dimResults,
    total,
    level,
    hasEveryDim,
    d1MeetsFloor,
    d2MeetsFloor,
    d1IsConsolidated,
    d2IsConsolidated
  };
}

export function evaluateRows(rows) {
  return rows.map(row => evaluateInstitutionalization(row));
}
