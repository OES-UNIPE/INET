import { MapView } from "./components/map-view.js";
import { loadDepartmentMetadata, loadDepartmentTopology, loadInstitutions } from "./services/data-service.js";
import {
  calculatePlan,
  calculateWeights,
  generateOptions,
  summarizeBy,
  summarizeJurisdictions,
  summarizeManagementComposition,
} from "./services/sampling-service.js";
import { downloadBlob, fmtInt, percent } from "./utils/format.js";

const DEBUG_SAMPLING = new URLSearchParams(window.location.search).get("debug") === "1";

const state = {
  institutions: [],
  departments: null,
  topology: null,
  plan: null,
  options: [],
  selectedOption: null,
  activeFilters: { jurisdiccion: null, codigoDepartamento: null, departamento: null, escuelaId: null, optionId: null },
  map: null,
};

const el = {
  status: document.getElementById("status"),
  coverageInput: document.getElementById("coverageInput"),
  coverageValue: document.getElementById("coverageValue"),
  minJurisdictionInput: document.getElementById("minJurisdictionInput"),
  seedInput: document.getElementById("seedInput"),
  sectorProportional: document.getElementById("sectorProportional"),
  orientacionProportional: document.getElementById("orientacionProportional"),
  tipoProportional: document.getElementById("tipoProportional"),
  sexoProportional: document.getElementById("sexoProportional"),
  matriculaProportional: document.getElementById("matriculaProportional"),
  calculateBtn: document.getElementById("calculateBtn"),
  generateBtn: document.getElementById("generateBtn"),
  newCalcBtn: document.getElementById("newCalcBtn"),
  results: document.getElementById("results"),
  groupBy: document.getElementById("groupBy"),
  jurisdictionFilter: document.getElementById("jurisdictionFilter"),
  printBtn: document.getElementById("printBtn"),
  methodBtn: document.getElementById("methodBtn"),
  methodModal: document.getElementById("methodModal"),
  methodClose: document.getElementById("methodClose"),
  processModal: document.getElementById("processModal"),
  processTitle: document.getElementById("processTitle"),
  processSubtitle: document.getElementById("processSubtitle"),
  processBar: document.getElementById("processBar"),
  processSteps: document.getElementById("processSteps"),
  processLog: document.getElementById("processLog"),
  processReport: document.getElementById("processReport"),
  processDownload: document.getElementById("processDownload"),
  processClose: document.getElementById("processClose"),
  newCalcModal: document.getElementById("newCalcModal"),
  newCalcCancelX: document.getElementById("newCalcCancelX"),
  newCalcCsv: document.getElementById("newCalcCsv"),
  newCalcExcel: document.getElementById("newCalcExcel"),
  newCalcContinue: document.getElementById("newCalcContinue"),
  newCalcCancel: document.getElementById("newCalcCancel"),
};

function getParams() {
  const useGestionCriterion = Boolean(el.sectorProportional?.checked);
  return {
    evaluationScope: "jurisdiction",
    coverage: Number(el.coverageInput.value),
    applyWithinJurisdiction: true,
    minJurisdiction: Math.max(1, Number(el.minJurisdictionInput.value) || 1),
    useGestionCriterion,
    keepGestion: useGestionCriterion,
    keepOrientacion: true,
    keepTipoInstitucion: false,
    keepSexo: false,
    keepMatricula: true,
    seed: el.seedInput.value.trim() || defaultSamplingCode(),
  };
}

function defaultSamplingCode() {
  const now = new Date();
  const day = String(now.getDate()).padStart(2, "0");
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const year = now.getFullYear();
  return `${day}${month}${year}_12345`;
}

function setStatus(message, visible = true) {
  el.status.textContent = message;
  el.status.classList.toggle("show", visible);
}

function syncControls() {
  if (!el.seedInput.value.trim()) el.seedInput.value = defaultSamplingCode();
  el.coverageValue.textContent = `${el.coverageInput.value}%`;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setBusy(isBusy) {
  el.calculateBtn.disabled = isBusy;
  el.generateBtn.disabled = isBusy || !state.plan;
  el.newCalcBtn.disabled = isBusy || !state.options.length;
}

function openProcess(title, subtitle, steps) {
  el.processTitle.textContent = title;
  el.processSubtitle.textContent = subtitle;
  el.processBar.style.width = "0%";
  el.processClose.disabled = true;
  el.processDownload.disabled = true;
  el.processLog.innerHTML = "Preparando trazabilidad del procedimiento...";
  el.processReport.innerHTML = "<p>El reporte se irá completando a medida que avance el procedimiento.</p>";
  el.processSteps.innerHTML = steps.map((step, index) => `
    <li data-step="${index}">
      <i></i>
      <div>
        <strong>${step.title}</strong>
        <span>${step.detail}</span>
      </div>
    </li>
  `).join("");
  el.processModal.classList.add("open");
}

function updateProcess(stepIndex, progress, log) {
  el.processBar.style.width = `${progress}%`;
  el.processSteps.querySelectorAll("[data-step]").forEach((item) => {
    const index = Number(item.dataset.step);
    item.classList.toggle("done", index < stepIndex);
    item.classList.toggle("active", index === stepIndex);
  });
  if (log) el.processLog.innerHTML = log;
}

function completeProcess(log) {
  el.processBar.style.width = "100%";
  el.processSteps.querySelectorAll("[data-step]").forEach((item) => {
    item.classList.remove("active");
    item.classList.add("done");
  });
  el.processLog.innerHTML = log;
  el.processClose.disabled = false;
  el.processDownload.disabled = false;
}

function setProcessReport(html) {
  el.processReport.innerHTML = html;
}

function downloadProcessReport() {
  const title = el.processTitle.textContent || "Reporte del proceso";
  const params = getParams();
  const content = `
    <!doctype html>
    <html lang="es">
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          body{font-family:Arial,sans-serif;color:#162033;margin:28px;line-height:1.45;}
          h1{color:#0f355e;margin-bottom:4px;}
          h2{color:#0f355e;margin-top:24px;font-size:16px;text-transform:uppercase;letter-spacing:.04em;}
          h3{color:#0f355e;margin-top:18px;font-size:13px;text-transform:uppercase;letter-spacing:.04em;}
          table{width:100%;border-collapse:collapse;margin:8px 0 16px;}
          th,td{border:1px solid #d9e0e8;padding:7px 8px;text-align:left;font-size:12px;vertical-align:top;}
          th{background:#eef3f8;color:#516070;}
          .meta{color:#516070;font-size:12px;margin-bottom:18px;}
          .log{border-left:4px solid #d4a017;background:#f5f7fa;padding:10px 12px;margin:14px 0;}
        </style>
      </head>
      <body>
        <h1>${title}</h1>
        <p class="meta">Generado: ${new Date().toLocaleString("es-AR")} · Código de muestreo: ${params.seed}</p>
        <div class="log">${el.processLog.innerHTML}</div>
        ${el.processReport.innerHTML}
      </body>
    </html>
  `;
  const reportWindow = window.open("", "_blank", "width=980,height=720");
  if (!reportWindow) {
    downloadBlob(`MuestraETP_reporte_${params.seed}.html`, `\ufeff${content}`, "text/html;charset=utf-8");
    return;
  }
  reportWindow.document.open();
  reportWindow.document.write(content);
  reportWindow.document.close();
  reportWindow.focus();
  setTimeout(() => reportWindow.print(), 250);
}

function sumField(rows, field) {
  return rows.reduce((acc, item) => acc + (Number(item[field]) || 0), 0);
}

function countByValue(rows, field) {
  return rows.reduce((acc, item) => {
    const value = item[field] || "Sin información";
    acc.set(value, (acc.get(value) || 0) + 1);
    return acc;
  }, new Map());
}

function debugGroup(title, callback) {
  if (!DEBUG_SAMPLING) return;
  console.groupCollapsed(title);
  try {
    callback();
  } finally {
    console.groupEnd();
  }
}

function uniqueCount(rows, field) {
  return new Set(rows.map((item) => item[field]).filter(Boolean)).size;
}

function universeStats() {
  const totalSexo = sumField(state.institutions, "matricula_varones") + sumField(state.institutions, "matricula_mujeres");
  const withDepartment = state.institutions.filter((item) => item.codigo_departamento).length;
  return {
    instituciones: state.institutions.length,
    jurisdicciones: uniqueCount(state.institutions, "jurisdiccion"),
    departamentos: uniqueCount(state.institutions.filter((item) => item.codigo_departamento), "codigo_departamento"),
    conDepartamento: withDepartment,
    sinDepartamento: state.institutions.length - withDepartment,
    matriculaTotal: sumField(state.institutions, "matricula_total"),
    matriculaVarones: sumField(state.institutions, "matricula_varones"),
    matriculaMujeres: sumField(state.institutions, "matricula_mujeres"),
    porcentajeVarones: totalSexo ? (sumField(state.institutions, "matricula_varones") / totalSexo) * 100 : 0,
    porcentajeMujeres: totalSexo ? (sumField(state.institutions, "matricula_mujeres") / totalSexo) * 100 : 0,
  };
}

function missingDepartmentRows() {
  return Array.from(countByValue(
    state.institutions.filter((item) => !item.codigo_departamento),
    "jurisdiccion"
  ).entries()).map(([jurisdiccion, cantidad]) => ({ jurisdiccion, cantidad }));
}

function validateLoadedData() {
  const invalid = state.institutions.filter((item) =>
    !item.id ||
    !item.jurisdiccion ||
    !Number.isFinite(item.matricula_total) ||
    !Number.isFinite(item.matricula_varones) ||
    !Number.isFinite(item.matricula_mujeres)
  );
  if (invalid.length) console.warn("Instituciones con campos obligatorios o matrícula no numérica", invalid.slice(0, 20));
  const zeroMatricula = state.institutions.filter((item) => !Number(item.matricula_total));
  if (zeroMatricula.length) console.warn("Instituciones con matricula_total igual a 0 o inválida", zeroMatricula.slice(0, 20));
}

function validateSampleOption(option) {
  const ids = option.sample.map((item) => item.id);
  const duplicated = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicated.length) console.warn(`${option.label}: seleccionadas duplicadas`, [...new Set(duplicated)]);
}

function validateReplacementAssignments(option) {
  const sampleIds = option.ids || new Set(option.sample.map((item) => item.id));
  const replacements = option.sample.flatMap((item) => option.replacements?.get(item.id) || []);
  const replacementsInSample = replacements.filter((item) => sampleIds.has(item.id));
  if (replacementsInSample.length) console.warn(`${option.label}: reemplazos dentro de la muestra principal`, replacementsInSample);
  const replacementIds = replacements.map((item) => item.id);
  const duplicated = replacementIds.filter((id, index) => replacementIds.indexOf(id) !== index);
  if (duplicated.length) console.warn(`${option.label}: reemplazos duplicados`, [...new Set(duplicated)]);
}

function validateCoverageTables(option) {
  const rows = summarizeJurisdictions(state.institutions, option.sample);
  const byJurisdiction = new Map();
  option.sample.forEach((item) => {
    byJurisdiction.set(item.jurisdiccion, (byJurisdiction.get(item.jurisdiccion) || 0) + (Number(item.matricula_total) || 0));
  });
  const mismatches = rows.filter((row) => row.matriculaCubierta !== (byJurisdiction.get(row.jurisdiccion) || 0));
  if (mismatches.length) console.warn(`${option.label}: matrícula cubierta no coincide con la suma real`, mismatches);
}

function validateReproducibility(params, options) {
  if (!DEBUG_SAMPLING) return;
  const regenerated = generateOptions(state.institutions, params, 500);
  const originalSignatures = options.map((option) => option.sample.map((item) => item.id).sort().join("|"));
  const regeneratedSignatures = regenerated.map((option) => option.sample.map((item) => item.id).sort().join("|"));
  const ok = originalSignatures.every((signature, index) => signature === regeneratedSignatures[index]);
  if (!ok) console.warn("La generación no fue reproducible con el mismo código y parámetros", { originalSignatures, regeneratedSignatures });
}

function debugLoadedData() {
  debugGroup("Muestreo ETP · datos cargados", () => {
    const stats = universeStats();
    console.table([stats]);
    console.table(Array.from(countByValue(state.institutions, "jurisdiccion").entries()).map(([jurisdiccion, instituciones]) => ({ jurisdiccion, instituciones })));
    console.table(missingDepartmentRows());
  });
}

function debugPlan(plan, option = null) {
  debugGroup("Muestreo ETP · cálculo por jurisdicción", () => {
    const sample = option?.sample || [];
    const rows = summarizeJurisdictions(state.institutions, sample).map((row) => {
      const target = plan.targets.targetsByJurisdiction.get(row.jurisdiccion) || {};
      return {
        jurisdiccion: row.jurisdiccion,
        totalInstituciones: row.total,
        porcentajeAplicado: `${plan.params.coverage}%`,
        minimoJurisdiccional: plan.params.minJurisdiction,
        objetivoInstituciones: target.target || 0,
        tipoCobertura: target.tipo_cobertura_jurisdiccional || row.tipo_cobertura_jurisdiccional,
        seleccionadas: row.seleccionadas,
        matriculaTotal: row.matriculaTotal,
        matriculaCubierta: row.matriculaCubierta,
        porcentajeMatriculaCubierta: row.matriculaTotal ? `${((row.matriculaCubierta / row.matriculaTotal) * 100).toFixed(1)}%` : "0.0%",
      };
    });
    console.table(rows);
  });
}

function validateWeights(option) {
  const weights = calculateWeights(state.institutions, option.sample, option.plan.params);
  const invalid = option.sample.filter((item) => {
    const row = weights.get(item.id);
    return !row || row.ponderador_diseno_recomendado === null || !Number.isFinite(Number(row.ponderador_diseno_recomendado));
  });
  if (invalid.length) console.warn(`${option.label}: ponderador de diseño inválido o incompleto`, invalid);
}

function debugOptions(options) {
  debugGroup("Muestreo ETP · evaluación, mapa, ponderadores y reemplazos", () => {
    options.forEach((option) => {
      const ev = option.evaluation;
      const replacements = option.sample.map((item) => option.replacements?.get(item.id) || []);
      const replacementIds = replacements.flat().map((item) => item.id);
      const duplicateReplacementCount = replacementIds.length - new Set(replacementIds).size;
      const outsideJurisdiction = option.sample.flatMap((item) =>
        (option.replacements?.get(item.id) || [])
          .filter((replacement) => replacement.jurisdiccion !== item.jurisdiccion)
          .map((replacement) => ({ seleccionado: item.id, reemplazo: replacement.id, jurisdiccionSeleccionada: item.jurisdiccion, jurisdiccionReemplazo: replacement.jurisdiccion }))
      );
      const weights = calculateWeights(state.institutions, option.sample, option.plan.params);
      const invalidWeights = option.sample.filter((item) => {
        const row = weights.get(item.id);
        return !row || row.ponderador_diseno_recomendado === null || !Number.isFinite(Number(row.ponderador_diseno_recomendado));
      });
      console.groupCollapsed(option.label);
      console.table([{
        score: ev.score,
        errorInstituciones: ev.errors.institutions,
        errorMatricula: ev.errors.matricula,
        errorOrientacion: ev.errors.orientacion,
        errorGestion: ev.errors.gestion ?? null,
        errorRepresentatividad: ev.errors.representatividad,
        errorTerritorial: ev.errors.territorial,
      }]);
      console.table([{
        seleccionadas: option.sample.length,
        departamentosConSeleccionadas: uniqueCount(option.sample.filter((item) => item.codigo_departamento), "codigo_departamento"),
        reemplazo1Asignados: replacements.filter((items) => items[0]).length,
        reemplazo2Asignados: replacements.filter((items) => items[1]).length,
        sinReemplazo1: replacements.filter((items) => !items[0]).length,
        sinReemplazo2: replacements.filter((items) => !items[1]).length,
        reemplazosDuplicados: duplicateReplacementCount,
        reemplazosEnMuestra: replacementIds.filter((id) => option.ids.has(id)).length,
        reemplazosFueraJurisdiccion: outsideJurisdiction.length,
        ponderadoresInvalidos: invalidWeights.length,
      }]);
      if (outsideJurisdiction.length) console.warn(`${option.label}: reemplazos fuera de jurisdicción`, outsideJurisdiction);
      if (invalidWeights.length) console.warn(`${option.label}: ponderadores inválidos`, invalidWeights);
      console.table(summarizeManagementComposition(state.institutions, option.sample));
      console.groupEnd();
    });
  });
}

function paramsReport(params) {
  const stats = universeStats();
  const missing = missingDepartmentRows();
  return `
    <h3>Fuente de datos y universo</h3>
    <p>Base institucional: <code>assets/01_LISTADO.csv</code>. Departamentos de referencia: <code>assets/02_Deptos_INDEC.csv</code>. Geometría para el mapa: <code>assets/03_Departamentos.json</code>.</p>
    <table>
      <tbody>
        <tr><th>Instituciones en universo</th><td>${fmtInt.format(stats.instituciones)}</td></tr>
        <tr><th>Jurisdicciones</th><td>${fmtInt.format(stats.jurisdicciones)}</td></tr>
        <tr><th>Departamentos con instituciones</th><td>${fmtInt.format(stats.departamentos)}</td></tr>
        <tr><th>Instituciones con departamento enlazado</th><td>${fmtInt.format(stats.conDepartamento)}</td></tr>
        <tr><th>Instituciones sin cruce territorial</th><td>${fmtInt.format(stats.sinDepartamento)}${missing.length ? ` (${missing.map((item) => `${item.jurisdiccion}: ${fmtInt.format(item.cantidad)}`).join("; ")})` : ""}</td></tr>
        <tr><th>Matrícula total cargada</th><td>${fmtInt.format(stats.matriculaTotal)}</td></tr>
        <tr><th>Matrícula varones / mujeres</th><td>${fmtInt.format(stats.matriculaVarones)} / ${fmtInt.format(stats.matriculaMujeres)}</td></tr>
      </tbody>
    </table>
    <h3>Parámetros utilizados</h3>
    <table>
      <tbody>
        <tr><th>Fecha de generación</th><td>${new Date().toLocaleString("es-AR")}</td></tr>
        <tr><th>Porcentaje institucional</th><td>${params.coverage}% dentro de cada jurisdicción</td></tr>
        <tr><th>Mínimo por jurisdicción</th><td>${fmtInt.format(params.minJurisdiction)}</td></tr>
        <tr><th>Criterio activo</th><td>${params.useGestionCriterion ? "Orientación + sector de gestión dentro de cada jurisdicción" : "Orientación dentro de cada jurisdicción"}</td></tr>
        <tr><th>Sector de gestión</th><td>${params.useGestionCriterion ? "Activo como criterio opcional de representatividad y ponderación" : "Inactivo como criterio de selección; se informa como lectura descriptiva"}</td></tr>
        <tr><th>Variables descriptivas</th><td>Tipo de institución, matrícula por sexo y composición de matrícula no inciden en el score.</td></tr>
        <tr><th>Matrícula total</th><td>Se reporta como cobertura de matrícula, sin sustituir el criterio de representatividad.</td></tr>
        <tr><th>Ponderador de diseño</th><td>${params.useGestionCriterion ? "Jurisdicción × orientación × sector de gestión" : "Jurisdicción × orientación"}; en censo jurisdiccional se fija en 1.</td></tr>
        <tr><th>Código de muestreo</th><td>${params.seed}</td></tr>
        <tr><th>Candidatas evaluadas</th><td>500</td></tr>
        <tr><th>Opciones publicadas</th><td>2</td></tr>
      </tbody>
    </table>
  `;
}

function targetReport(plan) {
  const targets = plan.targets;
  const rows = summarizeJurisdictions(state.institutions).map((row) => {
    const target = targets.targetsByJurisdiction.get(row.jurisdiccion) || {};
    const raw = Math.round(row.total * (plan.params.coverage / 100));
    return { ...row, raw, target: target.target || 0, tipoCobertura: target.tipo_cobertura_jurisdiccional || "muestra" };
  });
  return `
    <h3>Cálculos de cantidades objetivo</h3>
    <p>Fórmula aplicada por jurisdicción: <strong>Casos = min(Total jurisdiccional, max(${fmtInt.format(plan.params.minJurisdiction)}, round(Total jurisdiccional × ${plan.params.coverage}%)))</strong>. Cuando el objetivo final coincide con el total disponible, la jurisdicción queda marcada como <code>censo_jurisdiccional</code>.</p>
    <table>
      <thead><tr><th>Jurisdicción</th><th>Total</th><th>round(Total × %)</th><th>Objetivo final</th><th>Tipo cobertura</th></tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${row.jurisdiccion}</td>
            <td>${fmtInt.format(row.total)}</td>
            <td>${fmtInt.format(row.raw)}</td>
            <td>${fmtInt.format(row.target)}</td>
            <td>${row.tipoCobertura}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
    <h3>Objetivos agregados</h3>
    <table>
      <tbody>
        <tr><th>Total instituciones</th><td>${fmtInt.format(targets.total)}</td></tr>
        <tr><th>Instituciones objetivo</th><td>${fmtInt.format(targets.targetTotal)}</td></tr>
        <tr><th>Cobertura institucional objetivo</th><td>${percent(targets.coverageTarget)}</td></tr>
        <tr><th>Matrícula total</th><td>${fmtInt.format(targets.totalMatricula)}</td></tr>
        <tr><th>Matrícula objetivo</th><td>${percent(targets.matriculaTarget)}</td></tr>
        <tr><th>Censos jurisdiccionales</th><td>${fmtInt.format(rows.filter((row) => row.tipoCobertura === "censo_jurisdiccional").length)}</td></tr>
      </tbody>
    </table>
    ${jurisdictionTargetReport(plan)}
  `;
}

function jurisdictionTargetReport(plan) {
  const rows = Array.from(plan.targets.targetsByJurisdiction.entries())
    .sort((a, b) => a[0].localeCompare(b[0], "es"));
  return `
    <h3>Objetivos de proporcionalidad por jurisdicción</h3>
    <p>La orientación siempre integra el criterio de representatividad. El sector de gestión se incorpora únicamente cuando la opción correspondiente está activa; tipo institucional y sexo quedan como lectura descriptiva.</p>
    <table>
      <thead><tr><th>Jurisdicción</th><th>Objetivo casos</th><th>Objetivo matrícula</th><th>Tipo cobertura</th></tr></thead>
      <tbody>
        ${rows.map(([jurisdiction, target]) => `
          <tr>
            <td>${jurisdiction}</td>
            <td>${fmtInt.format(target.target)}</td>
            <td>${percent(target.matriculaTarget)}</td>
            <td>${target.tipo_cobertura_jurisdiccional}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function optionsReport(options) {
  const useGestionCriterion = Boolean(options[0]?.plan?.params?.useGestionCriterion);
  return `
    <h3>Evaluación y ranking de alternativas</h3>
    <p>Cada candidata se evalúa con la fórmula: <strong>Score = max(0, 100 - ErrorInstituciones - ErrorMatrícula - ErrorTerritorial - ErrorRepresentatividad)</strong>. ${useGestionCriterion ? "ErrorRepresentatividad promedia orientación y sector de gestión." : "ErrorRepresentatividad equivale al error de orientación."}</p>
    <table>
      <thead>
        <tr><th>Opción</th><th>Seleccionadas</th><th>Matrícula</th><th>Error inst.</th><th>Error matrícula</th><th>Error orientación</th>${useGestionCriterion ? "<th>Error gestión</th>" : ""}<th>Error represent.</th><th>Error territorial</th><th>Score</th></tr>
      </thead>
      <tbody>
        ${options.map((option) => {
          const ev = option.evaluation;
          return `
            <tr>
              <td>${option.label}</td>
              <td>${fmtInt.format(ev.selected)}</td>
              <td>${percent(ev.matricula)}</td>
              <td>${ev.errors.institutions.toFixed(2)}</td>
              <td>${ev.errors.matricula.toFixed(2)}</td>
              <td>${ev.errors.orientacion.toFixed(2)}</td>
              ${useGestionCriterion ? `<td>${(ev.errors.gestion ?? 0).toFixed(2)}</td>` : ""}
              <td>${ev.errors.representatividad.toFixed(2)}</td>
              <td>${ev.errors.territorial.toFixed(2)}</td>
              <td><strong>${ev.score.toFixed(1)}</strong></td>
            </tr>
          `;
        }).join("")}
      </tbody>
    </table>
    <p>Las dos opciones publicadas corresponden a las mejores alternativas encontradas entre las candidatas generadas con el mismo código de muestreo. Cada opción incluye hasta dos reemplazos dentro de la misma jurisdicción; si no hay disponibilidad, se informa sin reemplazo disponible.</p>
    ${managementCompositionReport(options[0])}
    ${weightsMethodReport()}
  `;
}

function managementCompositionReport(option) {
  if (!option) return "";
  const rows = summarizeManagementComposition(state.institutions, option.sample);
  const note = option.plan.params.useGestionCriterion
    ? "Este cuadro integra el criterio opcional activo y permite auditar el ajuste por sector de gestión."
    : "Este cuadro es descriptivo: no interviene en el score ni fuerza la selección.";
  return `
    <h3>Composición por sector de gestión</h3>
    <p>${note}</p>
    <table>
      <thead><tr><th>Jurisdicción</th><th>Gestión</th><th>Universo</th><th>% universo</th><th>Muestra</th><th>% muestra</th><th>Diferencia pp</th></tr></thead>
      <tbody>
        ${rows.map((row) => `
          <tr>
            <td>${row.jurisdiccion}</td>
            <td>${row.sector_gestion}</td>
            <td>${fmtInt.format(row.universo)}</td>
            <td>${formatNumber(row.porcentajeUniverso, 1)}%</td>
            <td>${fmtInt.format(row.seleccionadas)}</td>
            <td>${formatNumber(row.porcentajeMuestra, 1)}%</td>
            <td>${formatNumber(row.diferenciaPp, 1)}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

function weightsMethodReport() {
  return `
    <h3>Ponderadores exportados</h3>
    <p>La tabla de instituciones seleccionadas exporta un único ponderador operativo: <code>ponderador_diseno_recomendado</code>, acompañado por <code>criterio_ponderador_diseno</code> y <code>tipo_cobertura_jurisdiccional</code>. Si la jurisdicción queda censada, el ponderador recomendado es 1. No se exportan ponderadores auxiliares.</p>
  `;
}

function renderPlan() {
  const params = state.plan.params;
  const targets = state.plan.targets;
  const activeSample = state.selectedOption ? filteredRows(state.selectedOption.sample) : [];
  const hasActiveSample = Boolean(state.selectedOption);
  const rows = filteredJurisdictionRows(summarizeJurisdictions(state.institutions, activeSample));
  el.results.innerHTML = `
    <section class="results-card">
      <div class="results-head">
        <div>
          <span class="section-kicker">Resumen ${hasActiveSample ? "de opción activa" : "previo"}</span>
          <h2>Cantidades objetivo</h2>
        </div>
        <p class="method-note">Código de muestreo ${params.seed} · ${state.plan.version}</p>
      </div>
      <div class="results-body">
        ${activeFilterNotice()}
        <div class="metric-grid">
          ${metric("Total de instituciones", fmtInt.format(targets.total))}
          ${metric("Instituciones objetivo", fmtInt.format(targets.targetTotal))}
          ${metric("Cobertura objetivo", percent(targets.coverageTarget))}
          ${metric("Matrícula total", fmtInt.format(targets.totalMatricula))}
          ${metric("Matrícula objetivo", percent(targets.matriculaTarget))}
          ${metric("Censos jurisdiccionales", fmtInt.format(Array.from(targets.targetsByJurisdiction.values()).filter((target) => target.tipo_cobertura_jurisdiccional === "censo_jurisdiccional").length))}
          ${metric("Candidatas por ejecución", "500")}
        </div>
        <h3 class="subhead">Distribución territorial esperada</h3>
        ${jurisdictionTable(rows, targets.targetByJurisdiction, hasActiveSample)}
      </div>
    </section>
  `;
}

function renderOptions() {
  if (!state.options.length) return;
  const html = state.options.map((option, index) => optionCard(option, index)).join("");
  const useGestionCriterion = Boolean(state.plan?.params?.useGestionCriterion);
  el.results.insertAdjacentHTML(
    "beforeend",
    `<section class="results-card">
      <div class="results-head">
        <div>
          <span class="section-kicker">Alternativas</span>
          <h2>Opciones ordenadas por ajuste</h2>
        </div>
        <p class="method-note">Score = 100 - instituciones - matrícula - territorio - ${useGestionCriterion ? "promedio orientación/gestión" : "orientación"}</p>
      </div>
      <div class="results-body options-list">${html}</div>
    </section>`
  );
  bindOptionButtons();
}

function metric(label, value) {
  return `<div class="metric-card"><span>${label}</span><strong>${value}</strong></div>`;
}

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "NA";
  return Number(value).toLocaleString("es-AR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

function formatWeight(value) {
  return formatNumber(value, 4);
}

function percentOf(part, total) {
  const numerator = Number(part) || 0;
  const denominator = Number(total) || 0;
  const value = denominator ? (numerator / denominator) * 100 : 0;
  return Number.isFinite(value) ? `${formatNumber(value, 1)}%` : "0,0%";
}

function valueWithPercent(value, total) {
  const safeValue = Number(value) || 0;
  return `${fmtInt.format(safeValue)} (${percentOf(safeValue, total)})`;
}

function htmlAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function emptyFilters() {
  return { jurisdiccion: null, codigoDepartamento: null, departamento: null, escuelaId: null, optionId: state.activeFilters.optionId || null };
}

function getDepartmentByCode(code) {
  if (!code) return null;
  return state.departments?.byCode?.get(String(code).padStart(5, "0")) || null;
}

function getInstitutionById(id) {
  return state.institutions.find((item) => item.id === id) || null;
}

function filterLabel() {
  const filter = state.activeFilters;
  const parts = [];
  if (filter.jurisdiccion) parts.push(filter.jurisdiccion);
  if (filter.departamento) parts.push(filter.departamento);
  if (filter.escuelaId) {
    const school = getInstitutionById(filter.escuelaId);
    parts.push(school?.nombre || filter.escuelaId);
  }
  return parts.join(" / ");
}

function activeFilterNotice() {
  const label = filterLabel();
  if (!label) return "";
  return `<div class="filter-chip"><span>Filtro activo: ${label}</span><button type="button" data-clear-filters>Limpiar</button></div>`;
}

function matchesActiveFilters(item) {
  const filter = state.activeFilters;
  if (filter.jurisdiccion && item.jurisdiccion !== filter.jurisdiccion) return false;
  if (filter.codigoDepartamento && item.codigo_departamento !== filter.codigoDepartamento) return false;
  if (filter.escuelaId && item.id !== filter.escuelaId) return false;
  return true;
}

function filteredRows(rows) {
  return rows.filter((item) => matchesActiveFilters(item));
}

function filteredJurisdictionRows(rows) {
  const filter = state.activeFilters;
  if (!filter.jurisdiccion && !filter.codigoDepartamento) return rows;
  const jurisdiction = filter.jurisdiccion || getDepartmentByCode(filter.codigoDepartamento)?.jurisdiccion;
  return rows.filter((row) => !jurisdiction || row.jurisdiccion === jurisdiction);
}

function setActiveFilter(next = {}, source = "") {
  const filter = { ...state.activeFilters, ...next };
  if (filter.codigoDepartamento) {
    filter.codigoDepartamento = String(filter.codigoDepartamento).padStart(5, "0");
    const dept = getDepartmentByCode(filter.codigoDepartamento);
    filter.departamento = filter.departamento || dept?.departamento || null;
    filter.jurisdiccion = filter.jurisdiccion || dept?.jurisdiccion || null;
  }
  if (!filter.codigoDepartamento) {
    filter.departamento = null;
    filter.escuelaId = next.escuelaId || null;
  }
  state.activeFilters = {
    jurisdiccion: filter.jurisdiccion || null,
    codigoDepartamento: filter.codigoDepartamento || null,
    departamento: filter.departamento || null,
    escuelaId: filter.escuelaId || null,
    optionId: filter.optionId || null,
  };
  applyActiveFilters(source);
}

function clearActiveFilters(source = "") {
  state.activeFilters = { ...emptyFilters(), optionId: null };
  applyActiveFilters(source);
}

function applyActiveFilters(source = "") {
  if (el.jurisdictionFilter && el.jurisdictionFilter.value !== (state.activeFilters.jurisdiccion || "")) {
    el.jurisdictionFilter.value = state.activeFilters.jurisdiccion || "";
  }
  state.map?.setFilters?.(state.activeFilters, source);
  if (state.plan) renderPlan();
  if (state.options.length) renderOptions();
}

function handleSchoolFilter(id, source = "") {
  const school = getInstitutionById(id);
  if (!school) return;
  const same = state.activeFilters.escuelaId === school.id;
  if (same) {
    clearActiveFilters(source);
    return;
  }
  setActiveFilter({
    jurisdiccion: school.jurisdiccion,
    codigoDepartamento: school.codigo_departamento || null,
    departamento: school.departamento || null,
    escuelaId: school.id,
  }, source);
}

function handleResultsClick(event) {
  if (event.target.closest("[data-action]")) return;
  if (event.target.closest("[data-clear-filters]")) {
    clearActiveFilters("results");
    return;
  }
  const schoolRow = event.target.closest("[data-school-id]");
  if (schoolRow) {
    handleSchoolFilter(schoolRow.dataset.schoolId, "school-table");
    return;
  }
  const deptRow = event.target.closest("[data-codigo-departamento]");
  if (deptRow) {
    const code = deptRow.dataset.codigoDepartamento;
    if (state.activeFilters.codigoDepartamento === code) clearActiveFilters("department-table");
    else setActiveFilter({ codigoDepartamento: code, escuelaId: null }, "department-table");
    return;
  }
  const jurisdictionRow = event.target.closest("[data-jurisdiccion]");
  if (jurisdictionRow) {
    const jurisdiction = jurisdictionRow.dataset.jurisdiccion;
    if (state.activeFilters.jurisdiccion === jurisdiction && !state.activeFilters.codigoDepartamento) clearActiveFilters("jurisdiction-table");
    else setActiveFilter({ jurisdiccion: jurisdiction, codigoDepartamento: null, departamento: null, escuelaId: null }, "jurisdiction-table");
  }
}

function jurisdictionTable(rows, targetByJurisdiction, sampleRows = null) {
  const body = rows.map((row) => {
    const target = targetByJurisdiction?.get(row.jurisdiccion);
    const selected = state.activeFilters.jurisdiccion === row.jurisdiccion;
    return `
      <tr data-jurisdiccion="${htmlAttr(row.jurisdiccion)}" class="${selected ? "selected" : ""}">
        <td>${row.jurisdiccion}</td>
        <td>${fmtInt.format(row.total)}</td>
        <td>${percent(row.porcentajeAgropecuaria || 0)}</td>
        <td>${fmtInt.format(sampleRows ? row.seleccionadas : target ?? 0)}</td>
        <td>${percent(sampleRows ? row.cobertura : ((target || 0) / row.total) * 100)}</td>
        <td>${fmtInt.format(row.matriculaTotal)}</td>
        <td>${fmtInt.format(row.matriculaCubierta || 0)}</td>
        <td>${row.tipo_cobertura_jurisdiccional}</td>
      </tr>
    `;
  }).join("");
  return `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Jurisdicción</th><th>Total instituciones</th><th>% Agropecuaria</th><th>Seleccionadas</th><th>% cobertura</th><th>Matrícula total</th><th>Matrícula cubierta</th><th>Tipo cobertura</th></tr></thead>
        <tbody>${body || `<tr><td colspan="8">No hay filas para el filtro activo.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function simpleDistributionTable(title, rows) {
  const totalInstituciones = rows.reduce((acc, row) => acc + (Number(row.instituciones) || 0), 0);
  const totalMatricula = rows.reduce((acc, row) => acc + (Number(row.matricula) || 0), 0);
  const body = rows.map((row) => `
    <tr>
      <td>${row.label}</td>
      <td>${valueWithPercent(row.instituciones, totalInstituciones)}</td>
      <td>${valueWithPercent(row.matricula, totalMatricula)}</td>
    </tr>
  `).join("");
  return `
    <div>
      <h3 class="subhead">${title}</h3>
      <div class="table-wrap">
        <table>
          <thead><tr><th>Categoría</th><th>Instituciones</th><th>Matrícula</th></tr></thead>
          <tbody>${body}</tbody>
        </table>
      </div>
    </div>
  `;
}

function optionCard(option, index) {
  const ev = option.evaluation;
  const visibleSample = filteredRows(option.sample);
  const selectedClass = state.selectedOption?.label === option.label ? " selected" : "";
  const useGestionCriterion = Boolean(option.plan.params.useGestionCriterion);
  const criterionLabel = useGestionCriterion ? "criterio orientación + gestión" : "criterio orientación";
  const filteredNote = visibleSample.length !== option.sample.length
    ? `<p class="method-note">Tablas filtradas: ${fmtInt.format(visibleSample.length)} de ${fmtInt.format(option.sample.length)} instituciones.</p>`
    : "";
  return `
    <article class="option-card${selectedClass}" data-option="${index}">
      <div class="option-head">
        <div>
          <span class="section-kicker">${option.label}</span>
          <h3>${fmtInt.format(ev.selected)} instituciones · ${percent(ev.matricula)} de matrícula · ${criterionLabel}</h3>
          <p class="method-note">Algoritmo: ${option.plan.algorithm}. Código de muestreo: ${option.plan.params.seed}.</p>
          ${filteredNote}
        </div>
        <strong class="score-badge">${ev.score.toFixed(1)}</strong>
      </div>
      <div class="quality-grid">
        ${quality("Instituciones", ev.errors.institutions)}
        ${quality("Matrícula", ev.errors.matricula)}
        ${quality("Orientación", ev.errors.orientacion)}
        ${useGestionCriterion ? quality("Gestión", ev.errors.gestion) : ""}
        ${quality("Territorial", ev.errors.territorial)}
      </div>
      <div class="split-grid three">
        ${simpleDistributionTable("Sector de gestión", summarizeBy(visibleSample, "gestion"))}
        ${simpleDistributionTable("Orientación", summarizeBy(visibleSample, "orientacion"))}
        ${simpleDistributionTable("Tipo de institución", summarizeBy(visibleSample, "tipo_institucion"))}
      </div>
      <h3 class="subhead">Distribución por jurisdicción</h3>
      ${jurisdictionTable(filteredJurisdictionRows(summarizeJurisdictions(state.institutions, visibleSample)), option.plan.targets.targetByJurisdiction, true)}
      <h3 class="subhead">Instituciones seleccionadas y reemplazos</h3>
      ${selectedInstitutionsTable(option)}
      <div class="option-actions">
        <button class="mini-action" data-action="view" data-index="${index}" type="button">Ver en mapa</button>
        <button class="mini-action" data-action="csv" data-index="${index}" type="button">Descargar CSV</button>
        <button class="mini-action" data-action="xls" data-index="${index}" type="button">Descargar Excel</button>
        <button class="mini-action" data-action="pdf" data-index="${index}" type="button">Descargar PDF</button>
      </div>
    </article>
  `;
}

function quality(label, value) {
  return `<div class="quality-item"><span>Error ${label}</span><strong>${value.toFixed(2)}</strong></div>`;
}

function selectedInstitutionsTable(option) {
  const rows = exportRows(option, true);
  return `
    <div class="table-wrap selected-table-wrap">
      <table>
        <thead><tr><th>Institución</th><th>Jurisdicción</th><th>Departamento</th><th>Gestión</th><th>Orientación</th><th>Tipo</th><th>Matrícula</th><th>Cobertura</th><th>Ponderador diseño</th><th>Criterio ponderador</th><th>Reemplazo 1</th><th>Reemplazo 2</th></tr></thead>
        <tbody>${rows.map((row) => `
          <tr data-school-id="${htmlAttr(row.id)}" data-jurisdiccion="${htmlAttr(row.jurisdiccion)}" data-codigo-departamento="${htmlAttr(row.codigo_departamento)}" class="${state.activeFilters.escuelaId === row.id ? "selected" : ""}">
            <td>${row.nombre_institucion}</td>
            <td>${row.jurisdiccion}</td>
            <td>${row.departamento}</td>
            <td>${row.sector_gestion}</td>
            <td>${row.orientacion}</td>
            <td>${row.tipo_institucion}</td>
            <td>${fmtInt.format(row.matricula_total)}</td>
            <td>${row.tipo_cobertura_jurisdiccional}</td>
            <td>${row.ponderador_diseno_recomendado}</td>
            <td>${row.criterio_ponderador_diseno}</td>
            <td>${row.reemplazo_1 || row.observacion_reemplazo}</td>
            <td>${row.reemplazo_2 || row.observacion_reemplazo}</td>
          </tr>
        `).join("") || `<tr><td colspan="12">No hay instituciones para el filtro activo.</td></tr>`}</tbody>
      </table>
    </div>
  `;
}

function bindOptionButtons() {
  el.results.querySelectorAll("[data-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const option = state.options[Number(button.dataset.index)];
      const action = button.dataset.action;
      if (action === "view") selectOption(option);
      if (action === "csv") exportCsv(option);
      if (action === "xls") exportExcel(option);
      if (action === "pdf") {
        selectOption(option);
        setTimeout(() => window.print(), 180);
      }
    });
  });
}

function selectOption(option) {
  state.selectedOption = option;
  state.activeFilters.optionId = option.label;
  validateSampleOption(option);
  validateReplacementAssignments(option);
  validateCoverageTables(option);
  validateWeights(option);
  debugPlan(state.plan, option);
  state.map.showOption(option);
  state.map.setFilters?.(state.activeFilters, "option");
  el.printBtn.disabled = false;
  renderPlan();
  renderOptions();
}

function replacementFields(replacements, index) {
  const replacement = replacements[index];
  const prefix = `reemplazo_${index + 1}`;
  return {
    [prefix]: replacement?.nombre || "",
    [`${prefix}_departamento`]: replacement?.departamento || "",
    [`${prefix}_sector_gestion`]: replacement?.gestion || "",
    [`${prefix}_orientacion`]: replacement?.orientacion || "",
    [`${prefix}_tipo_institucion`]: replacement?.tipo_institucion || "",
  };
}

function exportRows(option, applyFilters = false) {
  const sourceRows = applyFilters ? filteredRows(option.sample) : option.sample;
  const weights = calculateWeights(state.institutions, option.sample, option.plan.params);
  return sourceRows.map((item) => {
    const replacements = option.replacements?.get(item.id) || [];
    const totalSexo = item.matricula_varones + item.matricula_mujeres;
    const weight = weights.get(item.id) || {};
    return {
      id: item.id,
      jurisdiccion: item.jurisdiccion,
      departamento: item.departamento,
      codigo_departamento: item.codigo_departamento,
      nombre_institucion: item.nombre,
      estado_etp: item.estado_etp,
      sector_gestion: item.gestion,
      orientacion: item.orientacion,
      tipo_institucion: item.tipo_institucion,
      matricula_total: item.matricula_total,
      matricula_varones: item.matricula_varones,
      matricula_mujeres: item.matricula_mujeres,
      porcentaje_mujeres: totalSexo ? percent((item.matricula_mujeres / totalSexo) * 100) : "0,0%",
      ponderador_diseno_recomendado: formatWeight(weight.ponderador_diseno_recomendado),
      criterio_ponderador_diseno: weight.criterio_ponderador_diseno || "",
      tipo_cobertura_jurisdiccional: weight.tipo_cobertura_jurisdiccional || "",
      observacion_reemplazo: replacements.length ? "" : "Sin reemplazo disponible dentro de la jurisdicción",
      ...replacementFields(replacements, 0),
      ...replacementFields(replacements, 1),
    };
  });
}

function csvFromRows(rows) {
  const headers = Object.keys(rows[0] || {});
  return ["sep=;", headers.join(";")]
    .concat(rows.map((row) => headers.map((key) => `"${String(row[key] ?? "").replaceAll('"', '""')}"`).join(";")))
    .join("\r\n");
}

function excelHtmlFromRows(rows) {
  const headers = Object.keys(rows[0] || {});
  return `
    <!doctype html>
    <html>
      <head><meta charset="utf-8"></head>
      <body>
        <table>
          <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
          <tbody>${rows.map((row) => `<tr>${headers.map((key) => `<td>${row[key] ?? ""}</td>`).join("")}</tr>`).join("")}</tbody>
        </table>
      </body>
    </html>
  `;
}

function fileSafeSamplingCode() {
  return String(state.plan?.params?.seed || getParams().seed || "SIN_CODIGO").replace(/[^a-z0-9_-]+/gi, "_");
}

function exportAllOptionsRows() {
  return state.options.flatMap((option) => {
    const code = option.plan?.params?.seed || state.plan?.params?.seed || getParams().seed;
    return exportRows(option).map((row) => ({
      opcion: option.label,
      codigo_muestreo: code,
      ...row,
    }));
  });
}

function exportCsv(option) {
  const rows = exportRows(option);
  downloadBlob(`MuestraETP_${option.label.replace(" ", "_")}.csv`, `\ufeff${csvFromRows(rows)}`, "text/csv;charset=utf-8");
}

function exportExcel(option) {
  const rows = exportRows(option);
  downloadBlob(`MuestraETP_${option.label.replace(" ", "_")}.xls`, `\ufeff${excelHtmlFromRows(rows)}`, "application/vnd.ms-excel;charset=utf-8");
}

function exportAllOptionsCsv() {
  const rows = exportAllOptionsRows();
  if (!rows.length) return;
  downloadBlob(`muestra_etp_opciones_codigo_${fileSafeSamplingCode()}.csv`, `\ufeff${csvFromRows(rows)}`, "text/csv;charset=utf-8");
}

function exportAllOptionsExcel() {
  const rows = exportAllOptionsRows();
  if (!rows.length) return;
  downloadBlob(`muestra_etp_opciones_codigo_${fileSafeSamplingCode()}.xls`, `\ufeff${excelHtmlFromRows(rows)}`, "application/vnd.ms-excel;charset=utf-8");
}

function openNewCalcModal() {
  if (!state.options.length) {
    prepareNewCalculation();
    return;
  }
  el.newCalcModal.classList.add("open");
}

function closeNewCalcModal() {
  el.newCalcModal.classList.remove("open");
}

function prepareNewCalculation() {
  closeNewCalcModal();
  state.options = [];
  state.selectedOption = null;
  state.activeFilters = { ...emptyFilters(), optionId: null };
  state.map?.clearOption?.();
  state.map?.clearSelection?.();
  state.map?.setFilters?.(state.activeFilters, "new-calculation");
  el.generateBtn.disabled = !state.plan;
  el.newCalcBtn.disabled = true;
  el.printBtn.disabled = true;
  renderPlan();
  setStatus("Opciones actuales limpiadas. Podés ajustar parámetros y generar nuevas opciones.", true);
}

async function calculate(showProcess = true) {
  const params = getParams();
  if (showProcess) {
    setBusy(true);
    openProcess("Calculando muestra", "Se determinan cantidades objetivo y restricciones por jurisdicción antes de seleccionar instituciones.", [
      { title: "Lectura de parámetros", detail: "Se toma el porcentaje, mínimos por jurisdicción y código de muestreo." },
      { title: "Agrupamiento territorial", detail: "Se cuenta cuántas instituciones aporta cada jurisdicción." },
      { title: "Cálculo de objetivos", detail: `Se aplica la fórmula censal/muestral por jurisdicción y el criterio activo ${params.useGestionCriterion ? "de orientación + gestión" : "de orientación"}.` },
      { title: "Resumen previo", detail: "Se presenta la distribución esperada antes de generar alternativas." },
    ]);
    updateProcess(0, 12, `Código de muestreo: <strong>${params.seed}</strong><br>Porcentaje solicitado: <strong>${params.coverage}%</strong>.`);
    setProcessReport(paramsReport(params));
    await wait(260);
    updateProcess(1, 38, `Agrupando <strong>${fmtInt.format(state.institutions.length)}</strong> instituciones por jurisdicción.`);
    await wait(260);
  }

  state.plan = calculatePlan(state.institutions, getParams());
  debugPlan(state.plan);
  state.options = [];
  state.selectedOption = null;
  state.activeFilters.optionId = null;
  state.map.clearSelection();
  el.generateBtn.disabled = false;
  el.newCalcBtn.disabled = true;
  el.printBtn.disabled = true;

  if (showProcess) {
    updateProcess(2, 72, `Fórmula aplicada: <strong>Casos = min(total jurisdiccional, max(mínimo, round(total jurisdiccional × porcentaje)))</strong>.<br>Objetivo agregado: <strong>${fmtInt.format(state.plan.targets.targetTotal)}</strong> instituciones.`);
    setProcessReport(paramsReport(params) + targetReport(state.plan));
    await wait(260);
  }

  renderPlan();

  if (showProcess) {
    updateProcess(3, 92, "Construyendo tablas de resumen previo y distribución territorial esperada.");
    setProcessReport(paramsReport(params) + targetReport(state.plan));
    await wait(220);
    completeProcess(`Cálculo finalizado. Se puede generar opciones a partir de <strong>${fmtInt.format(state.plan.targets.targetTotal)}</strong> casos objetivo.`);
    setBusy(false);
  }
}

async function generate(showProcess = true) {
  const params = getParams();
  state.plan = calculatePlan(state.institutions, params);
  if (showProcess) {
    setBusy(true);
    openProcess("Generando opciones", "Se crean muestras candidatas reproducibles, se evalúan y se ordenan por ajuste.", [
      { title: "Preparación", detail: "Se limpia la selección activa y se fija el código de muestreo." },
      { title: "Generación de candidatas", detail: "Se producen 500 muestras candidatas con selección aleatoria reproducible." },
      { title: "Evaluación", detail: `Cada candidata calcula errores de instituciones, matrícula, territorio y ${params.useGestionCriterion ? "orientación + gestión" : "orientación"}.` },
      { title: "Ranking", detail: "Las alternativas se ordenan por score global." },
      { title: "Publicación", detail: "Se muestran las dos mejores opciones con sus reemplazos." },
    ]);
    updateProcess(0, 10, `Código de muestreo: <strong>${params.seed}</strong>.<br>El proceso conserva la trazabilidad de parámetros y fórmula.`);
    setProcessReport(paramsReport(params) + (state.plan ? targetReport(state.plan) : ""));
    await wait(240);
  }

  setStatus("Generando opciones...", true);
  state.map.clearOption();
  state.selectedOption = null;
  state.activeFilters.optionId = null;
  el.printBtn.disabled = true;

  if (showProcess) {
    updateProcess(1, 35, "Generando <strong>500</strong> muestras candidatas por jurisdicción con el código indicado.");
    await wait(280);
  }

  state.options = generateOptions(state.institutions, params, 500);
  el.newCalcBtn.disabled = !state.options.length;
  state.options.forEach((option) => {
    validateSampleOption(option);
    validateReplacementAssignments(option);
    validateCoverageTables(option);
    validateWeights(option);
  });
  validateReproducibility(params, state.options);
  debugOptions(state.options);
  state.selectedOption = state.options[0] || null;
  if (state.selectedOption) {
    state.map.showOption(state.selectedOption);
    el.printBtn.disabled = false;
  }

  if (showProcess) {
    const best = state.options[0]?.evaluation;
    updateProcess(2, 62, `Evaluación completa: cada muestra fue comparada contra objetivos jurisdiccionales y el criterio activo de representatividad.<br>Mejor score provisorio: <strong>${best?.score.toFixed(1) ?? "-"}</strong>.`);
    setProcessReport(paramsReport(params) + targetReport(state.plan) + optionsReport(state.options));
    await wait(280);
    updateProcess(3, 82, "Ordenando alternativas: Opción 1 y Opción 2 corresponden a los mejores scores.");
    await wait(240);
  }

  renderPlan();
  renderOptions();
  setStatus("", false);

  if (showProcess) {
    updateProcess(4, 94, "Publicando tarjetas, tablas, reemplazos y acciones de descarga.");
    await wait(220);
    completeProcess(`Opciones generadas. Mejor alternativa: <strong>${state.options[0]?.label}</strong> con score <strong>${state.options[0]?.evaluation.score.toFixed(1)}</strong>.`);
    setBusy(false);
  }
}

function bindEvents() {
  [
    el.coverageInput,
    el.sectorProportional,
    el.orientacionProportional,
    el.tipoProportional,
    el.sexoProportional,
    el.matriculaProportional,
  ].forEach((input) => input.addEventListener("input", syncControls));
  el.calculateBtn.addEventListener("click", () => calculate(true));
  el.generateBtn.addEventListener("click", () => generate(true));
  el.newCalcBtn.addEventListener("click", openNewCalcModal);
  el.newCalcCancelX.addEventListener("click", closeNewCalcModal);
  el.newCalcCancel.addEventListener("click", closeNewCalcModal);
  el.newCalcCsv.addEventListener("click", exportAllOptionsCsv);
  el.newCalcExcel.addEventListener("click", exportAllOptionsExcel);
  el.newCalcContinue.addEventListener("click", prepareNewCalculation);
  el.newCalcModal.addEventListener("click", (event) => {
    if (event.target === el.newCalcModal) closeNewCalcModal();
  });
  el.groupBy.addEventListener("change", () => state.map.setGroupBy(el.groupBy.value));
  el.jurisdictionFilter.addEventListener("change", () => {
    setActiveFilter({ jurisdiccion: el.jurisdictionFilter.value || null, codigoDepartamento: null, departamento: null, escuelaId: null }, "jurisdiction-select");
  });
  el.results.addEventListener("click", handleResultsClick);
  el.printBtn.addEventListener("click", () => window.print());
  el.methodBtn.addEventListener("click", () => el.methodModal.classList.add("open"));
  el.methodClose.addEventListener("click", () => el.methodModal.classList.remove("open"));
  el.methodModal.addEventListener("click", (event) => {
    if (event.target === el.methodModal) el.methodModal.classList.remove("open");
  });
  el.processClose.addEventListener("click", () => el.processModal.classList.remove("open"));
  el.processDownload.addEventListener("click", downloadProcessReport);
  el.processModal.addEventListener("click", (event) => {
    if (event.target === el.processModal && !el.processClose.disabled) el.processModal.classList.remove("open");
  });
  window.addEventListener("beforeprint", () => state.map?.invalidateSize());
}

async function init() {
  try {
    syncControls();
    bindEvents();
    state.map = new MapView({
      mapId: "map",
      legendId: "mapLegend",
      groupSelect: el.groupBy,
      jurisdictionSelect: el.jurisdictionFilter,
      onDepartmentSelected: (payload) => {
        if (payload?.codigoDepartamento && state.activeFilters.codigoDepartamento === payload.codigoDepartamento) clearActiveFilters("map");
        else if (payload?.codigoDepartamento) setActiveFilter({ ...payload, escuelaId: null }, "map");
        else clearActiveFilters("map");
      },
      onSchoolSelected: (schoolId) => handleSchoolFilter(schoolId, "map-panel"),
    });
    state.departments = await loadDepartmentMetadata();
    const [institutions, topology] = await Promise.all([
      loadInstitutions(state.departments),
      loadDepartmentTopology(),
    ]);
    state.institutions = institutions;
    state.topology = topology;
    state.map.setDepartments(state.departments, state.topology);
    state.map.setInstitutions(state.institutions);
    validateLoadedData();
    debugLoadedData();
    setStatus("", false);
    calculate(false);
  } catch (error) {
    console.error(error);
    setStatus(error.message, true);
  }
}

init();













