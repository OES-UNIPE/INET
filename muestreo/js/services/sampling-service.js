import { createRng, shuffle } from "../utils/random.js";
import { normalizeText } from "../utils/format.js";

const VERSION = "MuestraETP prototipo 0.3";
const COVERAGE_CENSUS = "censo_jurisdiccional";
const COVERAGE_SAMPLE = "muestra";

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "Sin información";
    if (!acc.has(value)) acc.set(value, []);
    acc.get(value).push(item);
    return acc;
  }, new Map());
}

function sum(items, selector) {
  return items.reduce((total, item) => total + selector(item), 0);
}

function shareByCount(items, key) {
  const total = items.length;
  const grouped = groupBy(items, key);
  return Array.from(grouped.entries()).reduce((acc, [label, rows]) => {
    acc.set(label, total ? (rows.length / total) * 100 : 0);
    return acc;
  }, new Map());
}

function distributionError(sample, targetDistribution, key) {
  if (!targetDistribution?.size) return 0;
  const sampleDistribution = shareByCount(sample, key);
  const labels = new Set([...targetDistribution.keys(), ...sampleDistribution.keys()]);
  const totalAbsError = Array.from(labels).reduce((acc, label) => {
    return acc + Math.abs((targetDistribution.get(label) || 0) - (sampleDistribution.get(label) || 0));
  }, 0);
  return totalAbsError / 2;
}

function matriculaShare(sample, totalMatricula) {
  if (!totalMatricula) return 0;
  return (sum(sample, (item) => item.matricula_total) / totalMatricula) * 100;
}

function safeRatio(numerator, denominator) {
  if (!denominator) return null;
  const value = numerator / denominator;
  return Number.isFinite(value) ? value : null;
}

function key2(a, b) {
  return `${a || "Sin información"}||${b || "Sin información"}`;
}

function key3(a, b, c) {
  return `${a || "Sin información"}||${b || "Sin información"}||${c || "Sin información"}`;
}

function isAgropecuaria(value) {
  return normalizeText(value).replace(/\s+/g, " ").includes("agropecuari");
}
function countMap(items, keyFn) {
  return items.reduce((acc, item) => {
    const key = keyFn(item);
    acc.set(key, (acc.get(key) || 0) + 1);
    return acc;
  }, new Map());
}

function buildTargets(institutions, params) {
  const byJurisdiction = groupBy(institutions, "jurisdiccion");
  const totalMatricula = sum(institutions, (item) => item.matricula_total);
  const total = institutions.length;
  const targetByJurisdiction = new Map();
  const targetsByJurisdiction = new Map();

  for (const [jurisdiction, rows] of byJurisdiction.entries()) {
    const proportional = Math.round(rows.length * (params.coverage / 100));
    const target = Math.min(rows.length, Math.max(params.minJurisdiction, proportional));
    const coverageTarget = rows.length ? (target / rows.length) * 100 : 0;
    const tipoCobertura = target === rows.length ? COVERAGE_CENSUS : COVERAGE_SAMPLE;
    targetByJurisdiction.set(jurisdiction, target);
    targetsByJurisdiction.set(jurisdiction, {
      total: rows.length,
      target,
      totalMatricula: sum(rows, (item) => item.matricula_total),
      coverageTarget,
      matriculaTarget: coverageTarget,
      tipo_cobertura_jurisdiccional: tipoCobertura,
      distributions: {
        orientacion: shareByCount(rows, "orientacion"),
        gestion: shareByCount(rows, "gestion"),
      },
    });
  }

  const targetTotal = Array.from(targetByJurisdiction.values()).reduce((acc, value) => acc + value, 0);

  return {
    targetByJurisdiction,
    targetsByJurisdiction,
    targetTotal,
    total,
    totalMatricula,
    coverageTarget: total ? (targetTotal / total) * 100 : 0,
    matriculaTarget: total ? (targetTotal / total) * 100 : 0,
  };
}

function evaluateSample(sample, institutions, targets, params = {}) {
  const total = institutions.length;
  const selected = sample.length;
  const coverage = total ? (selected / total) * 100 : 0;
  const matricula = matriculaShare(sample, targets.totalMatricula);
  const byJurisdiction = groupBy(sample, "jurisdiccion");
  const institutionsByJurisdiction = groupBy(institutions, "jurisdiccion");

  let territorialAbsError = 0;
  let territorialBase = 0;
  for (const [jurisdiction, target] of targets.targetByJurisdiction.entries()) {
    const selectedRows = byJurisdiction.get(jurisdiction)?.length || 0;
    territorialAbsError += Math.abs(target - selectedRows);
    territorialBase += target;
  }

  const jurisdictionRows = Array.from(institutionsByJurisdiction.entries()).map(([jurisdiction, rows]) => {
    const selectedRows = byJurisdiction.get(jurisdiction) || [];
    const target = targets.targetsByJurisdiction.get(jurisdiction);
    return {
      weight: rows.length,
      matriculaError: Math.abs(target.matriculaTarget - matriculaShare(selectedRows, target.totalMatricula)),
      orientacionError: distributionError(selectedRows, target.distributions.orientacion, "orientacion"),
      gestionError: distributionError(selectedRows, target.distributions.gestion, "gestion"),
    };
  });

  const errors = {
    institutions: Math.abs(targets.coverageTarget - coverage),
    matricula: weightedAverage(jurisdictionRows, (row) => row.matriculaError),
    orientacion: weightedAverage(jurisdictionRows, (row) => row.orientacionError),
    territorial: territorialBase ? (territorialAbsError / territorialBase) * 100 : 0,
  };

  if (params.useGestionCriterion) {
    errors.gestion = weightedAverage(jurisdictionRows, (row) => row.gestionError);
    errors.representatividad = (errors.orientacion + errors.gestion) / 2;
  } else {
    errors.representatividad = errors.orientacion;
  }

  const score = Math.max(
    0,
    100 - errors.institutions - errors.matricula - errors.territorial - errors.representatividad
  );

  return {
    selected,
    coverage,
    matricula,
    matriculaTotal: sum(sample, (item) => item.matricula_total),
    errors,
    score,
  };
}

function weightedAverage(rows, selector) {
  const totalWeight = rows.reduce((acc, row) => acc + row.weight, 0);
  if (!totalWeight) return 0;
  return rows.reduce((acc, row) => acc + selector(row) * row.weight, 0) / totalWeight;
}

function makeCandidate(institutions, targets, rng) {
  const byJurisdiction = groupBy(institutions, "jurisdiccion");
  const selected = [];
  for (const [jurisdiction, rows] of byJurisdiction.entries()) {
    const target = targets.targetByJurisdiction.get(jurisdiction) || 0;
    selected.push(...shuffle(rows, rng).slice(0, target));
  }
  return selected;
}

function signature(sample) {
  return sample.map((item) => item.id).sort().join("|");
}

function replacementScore(selected, candidate) {
  const sameDepartment = selected.codigo_departamento && selected.codigo_departamento === candidate.codigo_departamento ? 1 : 0;
  const sameOrientacion = normalizeText(selected.orientacion) === normalizeText(candidate.orientacion) ? 1 : 0;
  const matriculaDiff = Math.abs((selected.matricula_total || 0) - (candidate.matricula_total || 0));
  return sameOrientacion * 10000 + sameDepartment * 100 - matriculaDiff;
}

function assignReplacements(option, institutions) {
  const sampleIds = new Set(option.sample.map((item) => item.id));
  const used = new Set();
  const replacements = new Map();

  option.sample.forEach((selected) => {
    const sameJurisdiction = institutions.filter((item) => item.jurisdiccion === selected.jurisdiccion && !sampleIds.has(item.id));
    const chosen = [];

    for (let slot = 0; slot < 2; slot += 1) {
      const candidates = sameJurisdiction.filter((item) => !used.has(item.id) && !chosen.some((replacement) => replacement.id === item.id));
      const next = candidates
        .sort((a, b) => replacementScore(selected, b) - replacementScore(selected, a) || a.nombre.localeCompare(b.nombre, "es"))[0];
      if (!next) break;
      chosen.push(next);
      used.add(next.id);
    }

    replacements.set(selected.id, chosen);
  });

  return replacements;
}

export function calculatePlan(institutions, params) {
  const useGestionCriterion = Boolean(params.useGestionCriterion ?? params.keepGestion);
  const normalizedParams = {
    ...params,
    useGestionCriterion,
    keepGestion: useGestionCriterion,
    keepOrientacion: true,
    keepTipoInstitucion: false,
    keepSexo: false,
    representationCriterion: useGestionCriterion ? "orientacion_gestion" : "orientacion",
    evaluationScope: "jurisdiction",
    applyWithinJurisdiction: true,
  };
  const targets = buildTargets(institutions, normalizedParams);
  targets.evaluationScope = "jurisdiction";
  return {
    generatedAt: new Date().toISOString(),
    version: VERSION,
    algorithm: useGestionCriterion
      ? "Muestreo aleatorio estratificado por jurisdicción con representatividad intrajurisdiccional por orientación y sector de gestión"
      : "Muestreo aleatorio estratificado por jurisdicción con representatividad intrajurisdiccional por orientación",
    params: normalizedParams,
    targets,
  };
}

export function generateOptions(institutions, params, candidateCount = 500) {
  const plan = calculatePlan(institutions, params);
  const rng = createRng(params.seed);
  const seen = new Set();
  const candidates = [];

  for (let i = 0; i < candidateCount; i += 1) {
    const sample = makeCandidate(institutions, plan.targets, rng);
    const sig = signature(sample);
    if (seen.has(sig)) continue;
    seen.add(sig);
    candidates.push({
      id: `opcion-${candidates.length + 1}`,
      label: `Opción ${candidates.length + 1}`,
      sample,
      ids: new Set(sample.map((item) => item.id)),
      evaluation: evaluateSample(sample, institutions, plan.targets, plan.params),
      plan,
    });
  }

  return candidates
    .sort((a, b) => b.evaluation.score - a.evaluation.score)
    .slice(0, 2)
    .map((option, index) => {
      const labeled = { ...option, label: `Opción ${index + 1}` };
      return { ...labeled, replacements: assignReplacements(labeled, institutions) };
    });
}

export function summarizeBy(items, key) {
  const grouped = groupBy(items, key);
  return Array.from(grouped.entries())
    .map(([label, rows]) => ({
      label,
      instituciones: rows.length,
      matricula: sum(rows, (item) => item.matricula_total),
    }))
    .sort((a, b) => a.label.localeCompare(b.label, "es"));
}

export function summarizeJurisdictions(institutions, sample = []) {
  const totalByJurisdiction = groupBy(institutions, "jurisdiccion");
  const sampleByJurisdiction = groupBy(sample, "jurisdiccion");
  return Array.from(totalByJurisdiction.entries())
    .map(([jurisdiction, rows]) => {
      const selected = sampleByJurisdiction.get(jurisdiction) || [];
      const tipoCobertura = rows.length && selected.length === rows.length ? COVERAGE_CENSUS : COVERAGE_SAMPLE;
      const agropecuarias = rows.filter((item) => isAgropecuaria(item.orientacion)).length;
      return {
        jurisdiccion: jurisdiction,
        total: rows.length,
        seleccionadas: selected.length,
        cobertura: rows.length ? (selected.length / rows.length) * 100 : 0,
        porcentajeAgropecuaria: rows.length ? (agropecuarias / rows.length) * 100 : 0,
        matriculaTotal: sum(rows, (item) => item.matricula_total),
        matriculaCubierta: sum(selected, (item) => item.matricula_total),
        tipo_cobertura_jurisdiccional: tipoCobertura,
      };
    })
    .sort((a, b) => a.jurisdiccion.localeCompare(b.jurisdiccion, "es"));
}

export function calculateWeights(institutions, sample, params = {}) {
  const useGestionCriterion = Boolean(params.useGestionCriterion ?? params.keepGestion);
  const criterio = useGestionCriterion ? "jurisdiccion_orientacion_gestion" : "jurisdiccion_orientacion";
  const universeJurisdiction = countMap(institutions, (item) => item.jurisdiccion);
  const sampleJurisdiction = countMap(sample, (item) => item.jurisdiccion);
  const universeDesign = countMap(institutions, (item) => useGestionCriterion
    ? key3(item.jurisdiccion, item.orientacion, item.gestion)
    : key2(item.jurisdiccion, item.orientacion));
  const sampleDesign = countMap(sample, (item) => useGestionCriterion
    ? key3(item.jurisdiccion, item.orientacion, item.gestion)
    : key2(item.jurisdiccion, item.orientacion));

  return sample.reduce((acc, item) => {
    const jurisdictionKey = item.jurisdiccion;
    const designKey = useGestionCriterion
      ? key3(item.jurisdiccion, item.orientacion, item.gestion)
      : key2(item.jurisdiccion, item.orientacion);
    const universoJur = universeJurisdiction.get(jurisdictionKey) || 0;
    const muestraJur = sampleJurisdiction.get(jurisdictionKey) || 0;
    const universoDiseno = universeDesign.get(designKey) || 0;
    const muestraDiseno = sampleDesign.get(designKey) || 0;
    const isCensus = universoJur > 0 && universoJur === muestraJur;
    const ponderador = isCensus ? 1 : safeRatio(universoDiseno, muestraDiseno);

    acc.set(item.id, {
      criterio_ponderador_diseno: criterio,
      universo_ponderador_diseno: universoDiseno,
      muestra_ponderador_diseno: muestraDiseno,
      ponderador_diseno_recomendado: ponderador,
      tipo_cobertura_jurisdiccional: isCensus ? COVERAGE_CENSUS : COVERAGE_SAMPLE,
    });
    return acc;
  }, new Map());
}

export function summarizeManagementComposition(institutions, sample = []) {
  const universeByJurisdiction = groupBy(institutions, "jurisdiccion");
  const sampleByJurisdiction = groupBy(sample, "jurisdiccion");
  const rows = [];

  for (const [jurisdiccion, universeRows] of universeByJurisdiction.entries()) {
    const sampleRows = sampleByJurisdiction.get(jurisdiccion) || [];
    const universeByGestion = groupBy(universeRows, "gestion");
    const sampleByGestion = groupBy(sampleRows, "gestion");
    const labels = new Set([...universeByGestion.keys(), ...sampleByGestion.keys()]);
    labels.forEach((sector_gestion) => {
      const universo = universeByGestion.get(sector_gestion)?.length || 0;
      const seleccionadas = sampleByGestion.get(sector_gestion)?.length || 0;
      const porcentajeUniverso = universeRows.length ? (universo / universeRows.length) * 100 : 0;
      const porcentajeMuestra = sampleRows.length ? (seleccionadas / sampleRows.length) * 100 : 0;
      rows.push({
        jurisdiccion,
        sector_gestion,
        universo,
        porcentajeUniverso,
        seleccionadas,
        porcentajeMuestra,
        diferenciaPp: porcentajeMuestra - porcentajeUniverso,
      });
    });
  }

  return rows.sort((a, b) => a.jurisdiccion.localeCompare(b.jurisdiccion, "es") || a.sector_gestion.localeCompare(b.sector_gestion, "es"));
}



