import { SOURCE_LABELS, WORKBOOK_SHEETS, XLSX_URL } from '../config/fields.js';
import { normalize } from '../utils/normalize.js';

const CORE_SOURCE_KEYS = Object.freeze(['jurisdicciones', 'dimensiones', 'niveles', 'rubrica']);

const REQUIRED_HEADERS = Object.freeze({
  jurisdicciones: ['ID_JURISDICCION', 'JURISDICCION', 'D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7', 'OBSERVACIONES'],
  dimensiones: ['ID_DIMENSION', 'ETIQUETA_CORTA', 'ETIQUETA_COMPLETA', 'PESO', 'ORDEN', 'ES_DIMENSION_PISO'],
  niveles: ['ID_NIVEL', 'ETIQUETA', 'VALOR', 'ORDEN', 'DESCRIPCION_GENERAL'],
  rubrica: ['ID_DIMENSION', 'ID_NIVEL', 'ETIQUETA_DIMENSION', 'ETIQUETA_NIVEL', 'DESCRIPCION'],
  normativas: ['CARPETA_PRINCIPAL', 'RUTA_SUBCARPETA', 'NOMBRE_DE_ARCHIVO', 'URL_LECTURA', 'URL_DESCARGA_DIRECTA', 'CONTROL'],
  oferentes: ['ID_JURISDICCION', 'ACTOR_INSTITUCION', 'AMBITO', 'SECTOR', 'OBSERVACIONES'],
  normativasDescripcion: ['JURISDICCION', 'NOMBRE', 'DESCRIPCION']
});

function canonicalHeader(value) {
  return String(value || '')
    .replace(/^\uFEFF/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function cleanRow(row) {
  const result = {};
  Object.entries(row).forEach(([key, value]) => {
    if (key === '__index') {
      result.__index = value;
      return;
    }
    result[canonicalHeader(key)] = String(value ?? '').trim();
  });
  return result;
}

function assertHeaders(sourceKey, headers) {
  const available = new Set(headers.map(canonicalHeader));
  const missing = REQUIRED_HEADERS[sourceKey].filter(header => !available.has(header));
  if (missing.length) {
    throw new Error(`${SOURCE_LABELS[sourceKey]} no contiene los encabezados requeridos: ${missing.join(', ')}.`);
  }
}

async function fetchWorkbook() {
  if (!window.XLSX) throw new Error('No se pudo cargar el lector de archivos XLSX.');

  let response;
  try {
    response = await fetch(XLSX_URL, { cache: 'no-store' });
  } catch (error) {
    throw new Error('No se pudo conectar con el archivo XLSX publicado.', { cause: error });
  }
  if (!response.ok) throw new Error(`El archivo XLSX respondió con estado HTTP ${response.status}.`);

  const data = await response.arrayBuffer();
  if (!data.byteLength) throw new Error('El archivo XLSX publicado está vacío.');

  try {
    return window.XLSX.read(data, { type: 'array' });
  } catch (error) {
    throw new Error('No se pudo interpretar el archivo XLSX publicado.', { cause: error });
  }
}

function readSheet(workbook, sourceKey, { allowEmpty = false } = {}) {
  const sheetName = WORKBOOK_SHEETS[sourceKey];
  if (!sheetName) throw new Error(`No está configurada la hoja ${SOURCE_LABELS[sourceKey]}.`);

  const sheet = workbook.Sheets[sheetName];
  if (!sheet) throw new Error(`El archivo XLSX no contiene la hoja ${sheetName}.`);

  const matrix = window.XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false, blankrows: false });
  if (!matrix.length) throw new Error(`${SOURCE_LABELS[sourceKey]} está vacía.`);
  assertHeaders(sourceKey, matrix[0]);

  const rows = window.XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false, blankrows: false })
    .map((row, index) => cleanRow({ ...row, __index: index }));
  if (!rows.length && !allowEmpty) throw new Error(`${SOURCE_LABELS[sourceKey]} no contiene registros.`);
  return rows;
}

function numberValue(value, context, { nullable = false } = {}) {
  const raw = String(value ?? '').trim().replace(',', '.');
  if (nullable && raw === '') return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) throw new Error(`${context} contiene un valor numérico inválido: “${value}”.`);
  return parsed;
}

function booleanValue(value, context) {
  const clean = normalize(value);
  if (['si', 'true', '1'].includes(clean)) return true;
  if (['no', 'false', '0'].includes(clean)) return false;
  throw new Error(`${context} contiene un booleano inválido: “${value}”.`);
}

function uniqueIndex(rows, key, label) {
  const index = new Map();
  rows.forEach(row => {
    const id = row[key];
    if (index.has(id)) throw new Error(`${label} duplicado: ${id}.`);
    index.set(id, row);
  });
  return index;
}

function levelCssClass(label) {
  const classes = { consolidado: 'consolidado', intermedio: 'intermedio', incipiente: 'incipiente', pendiente: 'pendiente', 'sin dato': 'sin-dato' };
  return classes[normalize(label)] || 'sin-dato';
}

function classifyGlobal(score, dimensionResults) {
  if (dimensionResults.some(dimension => dimension.pendiente)) return 'Pendiente';
  if (dimensionResults.some(dimension => dimension.valor === null || dimension.invalida)) return 'Sin dato';
  const floors = dimensionResults.filter(dimension => dimension.esPiso);
  if (score >= 70 && floors.every(dimension => dimension.nivelId === 'CONSOLIDADO')) return 'Consolidado';
  if (score >= 40 && floors.every(dimension => dimension.nivelId !== 'INCIPIENTE')) return 'Intermedio';
  return 'Incipiente';
}

function normalizeSources(raw) {
  const dimensiones = raw.dimensiones.map(row => ({
    id: row.ID_DIMENSION,
    etiquetaCorta: row.ETIQUETA_CORTA,
    etiquetaCompleta: row.ETIQUETA_COMPLETA,
    peso: numberValue(row.PESO, `PESO de ${row.ID_DIMENSION}`),
    orden: numberValue(row.ORDEN, `ORDEN de ${row.ID_DIMENSION}`),
    esPiso: booleanValue(row.ES_DIMENSION_PISO, `ES_DIMENSION_PISO de ${row.ID_DIMENSION}`)
  })).sort((a, b) => a.orden - b.orden);

  const niveles = raw.niveles.map(row => ({
    id: row.ID_NIVEL,
    etiqueta: row.ETIQUETA,
    valor: numberValue(row.VALOR, `VALOR de ${row.ID_NIVEL}`, { nullable: true }),
    orden: numberValue(row.ORDEN, `ORDEN de ${row.ID_NIVEL}`),
    descripcionGeneral: row.DESCRIPCION_GENERAL
  })).sort((a, b) => b.orden - a.orden);

  const rubrica = raw.rubrica.map(row => ({
    idDimension: row.ID_DIMENSION,
    idNivel: row.ID_NIVEL,
    etiquetaDimension: row.ETIQUETA_DIMENSION,
    etiquetaNivel: row.ETIQUETA_NIVEL,
    descripcion: row.DESCRIPCION
  }));

  const jurisdicciones = raw.jurisdicciones.map(row => ({
    idJurisdiccion: numberValue(row.ID_JURISDICCION, `ID_JURISDICCION de ${row.JURISDICCION}`),
    jurisdiccion: row.JURISDICCION,
    nivelesPorDimension: Object.fromEntries(dimensiones.map(dimension => [dimension.id, row[dimension.id]])),
    observaciones: row.OBSERVACIONES
  }));

  return { dimensiones, niveles, rubrica, jurisdicciones };
}

function validateAndBuild(normalized) {
  const warnings = [];
  const dimensionIndex = uniqueIndex(normalized.dimensiones, 'id', 'ID_DIMENSION');
  const levelIndex = uniqueIndex(normalized.niveles, 'id', 'ID_NIVEL');
  const jurisdictionIndex = uniqueIndex(normalized.jurisdicciones, 'idJurisdiccion', 'ID_JURISDICCION');
  const levelByLabel = new Map(normalized.niveles.map(level => [normalize(level.etiqueta), level]));
  const rubricIndex = new Map();

  const expectedDimensions = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6', 'D7'];
  const missingDimensions = expectedDimensions.filter(id => !dimensionIndex.has(id));
  if (missingDimensions.length) throw new Error(`Faltan dimensiones requeridas: ${missingDimensions.join(', ')}.`);

  const weightSum = normalized.dimensiones.reduce((sum, dimension) => sum + dimension.peso, 0);
  if (Math.abs(weightSum - 1) > 0.000001) throw new Error(`La suma de PESO debe ser 1 y actualmente es ${weightSum}.`);

  normalized.rubrica.forEach(item => {
    if (!dimensionIndex.has(item.idDimension)) throw new Error(`La rúbrica referencia una dimensión inexistente: ${item.idDimension}.`);
    if (!levelIndex.has(item.idNivel)) throw new Error(`La rúbrica referencia un nivel inexistente: ${item.idNivel}.`);
    const key = `${item.idDimension}|${item.idNivel}`;
    if (rubricIndex.has(key)) throw new Error(`Fila de rúbrica duplicada: ${key}.`);
    rubricIndex.set(key, item);
  });

  normalized.dimensiones.forEach(dimension => {
    const evaluableCount = normalized.niveles
      .filter(level => level.valor !== null)
      .filter(level => rubricIndex.has(`${dimension.id}|${level.id}`)).length;
    if (evaluableCount !== 3) throw new Error(`${dimension.id} debe tener tres niveles evaluables en 04_RUBRICA.`);
  });

  const jurisdicciones = normalized.jurisdicciones.map(jurisdiction => {
    const dimensions = normalized.dimensiones.map(dimension => {
      const rawLabel = jurisdiction.nivelesPorDimension[dimension.id];
      const normalizedLabel = normalize(rawLabel);
      const pending = normalizedLabel === 'pendiente';
      const level = pending
        ? { id: 'PENDIENTE', etiqueta: 'Pendiente', valor: null, descripcionGeneral: 'Entrevista pendiente de realización.' }
        : levelByLabel.get(normalizedLabel);
      const invalid = !level;
      if (invalid) {
        const warning = `${jurisdiction.jurisdiccion} · ${dimension.id}: valor desconocido “${rawLabel || '(vacío)'}”.`;
        warnings.push(warning);
        console.error('[Datos inválidos]', { jurisdiccion: jurisdiction.jurisdiccion, dimension: dimension.id, valor: rawLabel });
      }
      const rubric = level ? rubricIndex.get(`${dimension.id}|${level.id}`) : null;
      return {
        id: dimension.id,
        etiquetaCorta: dimension.etiquetaCorta,
        etiquetaCompleta: dimension.etiquetaCompleta,
        nivelId: level?.id || null,
        nivelEtiqueta: level?.etiqueta || 'Sin dato',
        nivelClase: levelCssClass(level?.etiqueta || 'Sin dato'),
        valor: level?.valor ?? null,
        peso: dimension.peso,
        aporte: level?.valor === null || level?.valor === undefined ? null : level.valor * dimension.peso * 100,
        esPiso: dimension.esPiso,
        descripcionNivel: rubric?.descripcion || level?.descripcionGeneral || '',
        descripcionGeneral: level?.descripcionGeneral || '',
        invalida: invalid,
        pendiente: pending,
        valorOriginal: rawLabel
      };
    });

    const incomplete = dimensions.some(dimension => dimension.valor === null || dimension.invalida);
    const rawScore = incomplete ? null : dimensions.reduce((sum, dimension) => sum + dimension.aporte, 0);
    const score = rawScore === null ? null : Math.round(rawScore * 1000000) / 1000000;
    const missing = dimensions.filter(dimension => dimension.valor === null || dimension.invalida).map(dimension => dimension.id);
    const nivelGlobal = classifyGlobal(score, dimensions);

    return {
      idJurisdiccion: jurisdiction.idJurisdiccion,
      jurisdiccion: jurisdiction.jurisdiccion,
      dimensiones: dimensions,
      puntajeGlobal: score,
      nivelGlobal,
      nivelClase: levelCssClass(nivelGlobal),
      dimensionesFaltantes: missing,
      coberturaInformativa: (dimensions.length - missing.length) / dimensions.length,
      observaciones: jurisdiction.observaciones,
      tieneValoresInvalidos: dimensions.some(dimension => dimension.invalida)
    };
  }).sort((a, b) => a.jurisdiccion.localeCompare(b.jurisdiccion, 'es'));

  return {
    jurisdicciones,
    dimensiones: normalized.dimensiones,
    niveles: normalized.niveles,
    rubrica: normalized.rubrica,
    indices: { dimensiones: dimensionIndex, niveles: levelIndex, rubrica: rubricIndex, jurisdicciones: jurisdictionIndex },
    warnings
  };
}

export function extractJurisdictionFromPath(path, jurisdictionNames = []) {
  const firstSegment = String(path || '')
    .split(/[\\/]/)
    .map(segment => segment.trim())
    .find(Boolean) || '';
  if (!firstSegment) return 'Sin jurisdicción';

  const candidate = firstSegment
    .replace(/^\s*\d+\s*[_-]\s*/, '')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!candidate) return 'Sin jurisdicción';

  const candidateKey = normalize(candidate);
  const match = [...jurisdictionNames]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .find(name => {
      const nameKey = normalize(name);
      return candidateKey === nameKey || candidateKey.includes(nameKey);
    });
  return match || candidate;
}

function normativeNameParts(fileName) {
  const name = String(fileName || '').trim().replace(/\.[^.]+$/, '');
  const separator = name.indexOf('_');
  if (separator < 0) return { name, tipo: name, numero: '' };
  return {
    name,
    tipo: name.slice(0, separator).trim(),
    numero: name.slice(separator + 1).trim()
  };
}

function normativeKey(jurisdiccion, name) {
  return `${normalize(jurisdiccion)}|${normalize(name)}`;
}

function attachNormativas(model, rows, descriptionRows) {
  const jurisdictionNames = model.jurisdicciones.map(item => item.jurisdiccion);
  const warnings = [];
  const enabledRows = rows.filter(row => normalize(row.CONTROL) === 'si');
  const descriptionsByKey = new Map();

  descriptionRows.forEach((row, index) => {
    const jurisdiccion = extractJurisdictionFromPath(row.JURISDICCION, jurisdictionNames);
    const key = normativeKey(jurisdiccion, row.NOMBRE);
    if (descriptionsByKey.has(key)) {
      const rowNumber = Number.isInteger(row.__index) ? row.__index + 2 : index + 2;
      const warning = `07_NORMATIVAS_DESCRIPCION fila ${rowNumber}: clave duplicada para “${row.JURISDICCION} / ${row.NOMBRE}”.`;
      warnings.push(warning);
      console.warn('[07_NORMATIVAS_DESCRIPCION]', warning);
      return;
    }
    descriptionsByKey.set(key, String(row.DESCRIPCION || '').trim());
  });

  const normativas = enabledRows
    .map((row, index) => {
      const jurisdiccion = extractJurisdictionFromPath(row.RUTA_SUBCARPETA, jurisdictionNames);
      const { name, tipo, numero } = normativeNameParts(row.NOMBRE_DE_ARCHIVO);
      if (jurisdiccion === 'Sin jurisdicción') {
        const rowNumber = Number.isInteger(row.__index) ? row.__index + 2 : index + 2;
        const warning = `05_NORMATIVAS fila ${rowNumber}: no se pudo extraer la jurisdicción de “${row.RUTA_SUBCARPETA || '(vacío)'}”.`;
        warnings.push(warning);
        console.warn('[05_NORMATIVAS]', warning);
      }
      const descriptionKey = normativeKey(jurisdiccion, name);
      const descripcion = descriptionsByKey.get(descriptionKey) || '';
      if (!descripcion) {
        const warning = `No se encontró descripción para “${jurisdiccion} / ${name || '(sin nombre)'}”.`;
        warnings.push(warning);
        console.warn('[07_NORMATIVAS_DESCRIPCION]', warning);
      }
      return {
        jurisdiccion,
        tipo,
        numero,
        descripcion,
        enlace: String(row.URL_DESCARGA_DIRECTA || '').trim()
      };
    })
    .sort((a, b) =>
      a.jurisdiccion.localeCompare(b.jurisdiccion, 'es') ||
      a.tipo.localeCompare(b.tipo, 'es') ||
      a.numero.localeCompare(b.numero, 'es', { numeric: true })
    );

  const byJurisdiction = new Map();
  normativas.forEach(item => {
    if (!byJurisdiction.has(item.jurisdiccion)) byJurisdiction.set(item.jurisdiccion, []);
    byJurisdiction.get(item.jurisdiccion).push(item);
  });

  model.normativas = normativas;
  model.indices.normativasPorJurisdiccion = byJurisdiction;
  model.normativasAvailable = true;
  model.normativasError = null;
  model.normativasWarnings = warnings;
  return model;
}
function attachOferentes(model, rows) {
  const warnings = [];
  const jurisdictionNames = new Map(model.jurisdicciones.map(item => [item.idJurisdiccion, item.jurisdiccion]));
  const oferentes = [];

  rows.forEach((row, index) => {
    const rawId = String(row.ID_JURISDICCION || '').trim();
    const idJurisdiccion = Number(rawId);
    if (!rawId || !Number.isFinite(idJurisdiccion)) {
      const warning = `06_OFERENTES fila ${index + 2}: ID_JURISDICCION inválido “${rawId || '(vacío)'}”.`;
      warnings.push(warning);
      console.warn('[06_OFERENTES]', warning);
      return;
    }
    if (!jurisdictionNames.has(idJurisdiccion)) {
      const warning = `06_OFERENTES fila ${index + 2}: ID_JURISDICCION ${idJurisdiccion} no existe en 01_JURISDICCIONES.`;
      warnings.push(warning);
      console.warn('[06_OFERENTES]', warning);
      return;
    }

    const ambito = String(row.AMBITO || '').trim();
    if (!ambito) {
      const warning = `06_OFERENTES fila ${index + 2}: Ámbito vacío; el registro no participará del gráfico por ámbito.`;
      warnings.push(warning);
      console.warn('[06_OFERENTES]', warning);
    }

    oferentes.push({
      idJurisdiccion,
      jurisdiccion: jurisdictionNames.get(idJurisdiccion),
      actorInstitucion: String(row.ACTOR_INSTITUCION || '').trim(),
      ambito,
      sector: String(row.SECTOR || '').trim(),
      observaciones: String(row.OBSERVACIONES || '').trim()
    });
  });

  oferentes.sort((a, b) =>
    a.jurisdiccion.localeCompare(b.jurisdiccion, 'es') ||
    a.actorInstitucion.localeCompare(b.actorInstitucion, 'es')
  );

  const byJurisdiction = new Map();
  oferentes.forEach(item => {
    if (!byJurisdiction.has(item.idJurisdiccion)) byJurisdiction.set(item.idJurisdiccion, []);
    byJurisdiction.get(item.idJurisdiccion).push(item);
  });

  model.oferentes = oferentes;
  model.indices.oferentesPorJurisdiccion = byJurisdiction;
  model.oferentesAvailable = true;
  model.oferentesError = null;
  model.warnings.push(...warnings);
  return model;
}

export async function loadApplicationData() {
  const workbook = await fetchWorkbook();
  const entries = CORE_SOURCE_KEYS.map(key => [key, readSheet(workbook, key)]);
  const model = validateAndBuild(normalizeSources(Object.fromEntries(entries)));
  const [normativasResult, oferentesResult] = await Promise.allSettled([
    Promise.resolve().then(() => Promise.all([
      readSheet(workbook, 'normativas', { allowEmpty: true }),
      readSheet(workbook, 'normativasDescripcion')
    ])),
    Promise.resolve().then(() => readSheet(workbook, 'oferentes', { allowEmpty: true }))
  ]);

  if (normativasResult.status === 'fulfilled') {
    attachNormativas(model, normativasResult.value[0], normativasResult.value[1]);
  } else {
    const error = normativasResult.reason;
    console.error('[05_NORMATIVAS + 07_NORMATIVAS_DESCRIPCION] El repositorio de normativas fue deshabilitado.', error);
    model.normativas = [];
    model.indices.normativasPorJurisdiccion = new Map();
    model.normativasAvailable = false;
    model.normativasError = error.message;
    model.normativasWarnings = [];
  }

  if (oferentesResult.status === 'fulfilled') {
    attachOferentes(model, oferentesResult.value);
  } else {
    const error = oferentesResult.reason;
    console.error('[06_OFERENTES] La vista de instituciones/actores fue deshabilitada.', error);
    model.oferentes = [];
    model.indices.oferentesPorJurisdiccion = new Map();
    model.oferentesAvailable = false;
    model.oferentesError = error.message;
  }

  return model;
}

export { levelCssClass };



