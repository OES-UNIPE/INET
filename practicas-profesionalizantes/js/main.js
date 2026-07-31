import { loadApplicationData } from './services/data-service.js';
import { renderSummaryTable } from './components/summary-table.js';
import { renderInstitutionalizationDetail } from './components/institutionalization-detail.js';
import { renderOferentesTable, renderAmbitoWidget } from './components/oferentes-view.js';
import { NormativeRepository } from './components/normative-repository.js';
import { deriveOferentesView } from './services/oferentes-service.js';
import { MapView } from './components/map-view.js';
import { escapeHTML, formatNumber } from './utils/normalize.js';

const status = document.querySelector('#status');
const summaryTable = document.querySelector('#summaryTable');
const detail = document.querySelector('#institutionalizationDetail');
const oferentesTable = document.querySelector('#oferentesTable');
const normativeRepositoryContainer = document.querySelector('#normativeRepository');
const methodologyModal = document.querySelector('#methodologyModal');
const methodologyBody = document.querySelector('#methodologyBody');
const methodologyBtn = document.querySelector('#methodologyBtn');
const methodologyClose = document.querySelector('#methodologyClose');
const schoolsLayerBtn = document.querySelector('#schoolsLayerBtn');
const pdfBtn = document.querySelector('#pdfBtn');
const oferentesBtn = document.querySelector('#oferentesBtn');
const normativasBtn = document.querySelector('#normativasBtn');
const refreshBtn = document.querySelector('#refreshBtn');
const retryBtn = document.querySelector('#retryBtn');
const mapMetricLabel = document.querySelector('#mapMetricLabel');
const mapLegend = document.querySelector('#mapLegend');
const mapElement = document.querySelector('#map');

const state = {
  model: null,
  vistaActiva: 'general',
  selectedKey: null,
  ambitoSeleccionado: null,
  widgetAmbitoVisible: false,
  metricId: 'global',
  mapView: null,
  normativeRepository: null,
  generalCollapsed: false,
  originalTitle: document.title
};

function setStatus(message, type = 'info', retry = false) {
  status.querySelector('[data-status-text]').textContent = message;
  status.className = `status show ${type}`;
  retryBtn.hidden = !retry;
}

function hideStatus() {
  status.className = 'status';
  retryBtn.hidden = true;
}

function scrollToContentSection(element) {
  if (!element) return;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const panel = element.closest('.content-panel');
    if (!panel || panel.scrollHeight <= panel.clientHeight) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    const panelRect = panel.getBoundingClientRect();
    const elementRect = element.getBoundingClientRect();
    panel.scrollTo({
      top: panel.scrollTop + elementRect.top - panelRect.top - 8,
      behavior: 'smooth'
    });
  }));
}

function showNormativas() {
  if (!state.model?.normativasAvailable || !state.normativeRepository) return;
  state.normativeRepository.expand();
  scrollToContentSection(normativeRepositoryContainer);
}
function resultByKey(key) {
  return state.model?.jurisdicciones.find(result => result.idJurisdiccion === Number(key));
}

function selectedJurisdictionName() {
  return resultByKey(state.selectedKey)?.jurisdiccion || '';
}

function renderInstitutionalizationLegend() {
  mapLegend.innerHTML = `
    <span><i class="dot consolidated"></i>Consolidado</span>
    <span><i class="dot intermediate"></i>Intermedio</span>
    <span><i class="dot initial"></i>Incipiente</span>
    <span><i class="dot pending"></i>Pendiente</span>`;
}

function renderActorLegend(domain) {
  if (!domain.max) {
    mapLegend.innerHTML = '<span><i class="dot empty"></i>Sin registros para los filtros activos</span>';
    return;
  }
  mapLegend.innerHTML = `
    <span><i class="dot empty"></i>0</span>
    <span class="actor-gradient-legend"><i></i><b>${domain.min}</b><em>a</em><b>${domain.max}</b> instituciones/actores</span>`;
}

function selectJurisdiction(key, options = {}) {
  if (state.selectedKey === Number(key) && options.toggle) return clearSelection();
  const result = resultByKey(key);
  if (!result) return;

  state.selectedKey = result.idJurisdiccion;
  state.mapView.select(result.idJurisdiccion);

  if (state.vistaActiva === 'oferentes') {
    state.generalCollapsed = false;
    renderGeneralView();
    renderInstitutionalizationDetail(detail, null);
    renderOferentesView();
    pdfBtn.disabled = true;
    return;
  }

  state.generalCollapsed = true;
  renderGeneralView();
  renderInstitutionalizationDetail(detail, result);
  pdfBtn.disabled = false;
  if (options.scrollDetail) detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function clearSelection() {
  state.selectedKey = null;
  state.generalCollapsed = false;
  state.mapView?.clearSelection();
  renderGeneralView();
  renderInstitutionalizationDetail(detail, null);
  pdfBtn.disabled = true;
  if (state.vistaActiva === 'oferentes') renderOferentesView();
}

function selectMetric(metricId) {
  if (state.vistaActiva !== 'general') return;
  state.metricId = metricId;
  state.mapView?.setMetric(metricId);
  const dimension = state.model.dimensiones.find(item => item.id === metricId);
  mapMetricLabel.textContent = dimension ? `${dimension.id} · ${dimension.etiquetaCorta}` : 'Nivel global';
  renderGeneralView();
}

function renderGeneralView() {
  renderSummaryTable(
    summaryTable,
    state.model.jurisdicciones,
    state.model.dimensiones,
    state.metricId,
    state.selectedKey,
    key => selectJurisdiction(key, { scrollDetail: state.vistaActiva === 'general' }),
    selectMetric,
    {
      collapsed: state.vistaActiva === 'general' && state.generalCollapsed,
      hideMetricControls: state.vistaActiva === 'oferentes',
      onExpand: clearSelection
    }
  );
}

function renderOferentesView() {
  if (state.vistaActiva !== 'oferentes') return;
  const derived = deriveOferentesView(state.model, { selectedKey: state.selectedKey, ambitoSeleccionado: state.ambitoSeleccionado });
  const jurisdictionName = selectedJurisdictionName();
  const filterLabels = [
    state.ambitoSeleccionado ? `Ámbito: ${state.ambitoSeleccionado}` : '',
    jurisdictionName ? `Jurisdicción seleccionada: ${jurisdictionName}` : ''
  ].filter(Boolean).join(' · ');
  const domain = state.mapView.setActorsMode(derived.countsByJurisdiction, filterLabels);

  mapMetricLabel.textContent = 'Cantidad de instituciones/actores por jurisdicción';
  renderActorLegend(domain);
  renderOferentesTable(oferentesTable, derived.tableRows, {
    jurisdiccionNombre: jurisdictionName,
    ambitoSeleccionado: state.ambitoSeleccionado,
    widgetAmbitoVisible: state.widgetAmbitoVisible
  }, {
    onShowWidget: () => { state.widgetAmbitoVisible = true; renderOferentesView(); },
    onClearJurisdiction: clearSelection,
    onClearAmbito: () => { state.ambitoSeleccionado = null; renderOferentesView(); }
  });
  renderAmbitoWidget(mapElement, derived.distribution, {
    jurisdiccionNombre: jurisdictionName,
    ambitoSeleccionado: state.ambitoSeleccionado,
    widgetAmbitoVisible: state.widgetAmbitoVisible
  }, {
    onClose: () => { state.widgetAmbitoVisible = false; renderOferentesView(); },
    onClearAmbito: () => { state.ambitoSeleccionado = null; renderOferentesView(); },
    onSelectAmbito: ambito => {
      state.ambitoSeleccionado = state.ambitoSeleccionado === ambito ? null : ambito;
      renderOferentesView();
    }
  });
}

function setOferentesButtonActive(active) {
  oferentesBtn.classList.toggle('active', active);
  oferentesBtn.setAttribute('aria-pressed', String(active));
  oferentesBtn.textContent = active ? 'Volver a vista general' : 'Ver instituciones/actores';
}

function openOferentesView() {
  if (!state.model.oferentesAvailable) return;
  state.vistaActiva = 'oferentes';
  state.selectedKey = null;
  state.ambitoSeleccionado = null;
  state.widgetAmbitoVisible = true;
  state.generalCollapsed = false;
  state.mapView.clearSelection();
  state.mapView.disableSchools();
  schoolsLayerBtn.hidden = true;
  pdfBtn.disabled = true;
  renderInstitutionalizationDetail(detail, null);
  setOferentesButtonActive(true);
  renderGeneralView();
  renderOferentesView();
  scrollToContentSection(oferentesTable);
}

function restoreGeneralView() {
  state.vistaActiva = 'general';
  state.selectedKey = null;
  state.ambitoSeleccionado = null;
  state.widgetAmbitoVisible = false;
  state.generalCollapsed = false;
  state.mapView.setInstitutionalizationMode(state.metricId);
  state.mapView.clearSelection();
  renderAmbitoWidget(mapElement, [], { widgetAmbitoVisible: false }, {});
  oferentesTable.innerHTML = '';
  schoolsLayerBtn.hidden = false;
  setOferentesButtonActive(false);
  const dimension = state.model.dimensiones.find(item => item.id === state.metricId);
  mapMetricLabel.textContent = dimension ? `${dimension.id} · ${dimension.etiquetaCorta}` : 'Nivel global';
  renderInstitutionalizationLegend();
  renderGeneralView();
  renderInstitutionalizationDetail(detail, null);
}

function toggleOferentesView() {
  if (state.vistaActiva === 'oferentes') restoreGeneralView();
  else openOferentesView();
}

function renderMethodology() {
  const dimensionList = state.model.dimensiones.map(dimension => `
    <li><b>${escapeHTML(dimension.id)}</b><span>${escapeHTML(dimension.etiquetaCompleta)}</span></li>`).join('');
  const levelRows = state.model.niveles.map(level => `
    <tr><td>${escapeHTML(level.etiqueta)}</td><td>${level.valor === null ? 'Valor nulo' : formatNumber(level.valor)}</td><td>${escapeHTML(level.descripcionGeneral)}</td></tr>`).join('');
  const weightRows = state.model.dimensiones.map(dimension => `
    <tr><td>${escapeHTML(dimension.id)}</td><td>${escapeHTML(dimension.etiquetaCorta)}</td><td>${formatNumber(dimension.peso * 100)}%</td><td>${dimension.esPiso ? 'Sí' : 'No'}</td></tr>`).join('');

  methodologyBody.innerHTML = `
    <section class="methodology-step"><h3><span>1</span>Qué mide la clasificación</h3><p>Mide el grado de desarrollo institucional de las condiciones provinciales que organizan, regulan, registran, articulan y acompañan las Prácticas Profesionalizantes.</p></section>
    <section class="methodology-step"><h3><span>2</span>Las siete dimensiones</h3><ul class="methodology-dimensions">${dimensionList}</ul></section>
    <section class="methodology-step"><h3><span>3</span>Conversión de niveles a valores</h3><table class="score-table"><thead><tr><th>Nivel</th><th>Valor</th><th>Descripción general</th></tr></thead><tbody>${levelRows}</tbody></table></section>
    <section class="methodology-step"><h3><span>4</span>Aplicación de los pesos</h3><p>Cada valor se multiplica por el peso definido para su dimensión en <code>02_DIMENSIONES</code>. Las ponderaciones suman el 100% del índice.</p><table class="score-table"><thead><tr><th>ID</th><th>Dimensión</th><th>Peso</th><th>Dimensión piso</th></tr></thead><tbody>${weightRows}</tbody></table></section>
    <section class="methodology-step"><h3><span>5</span>Cálculo del puntaje global</h3><p class="formula">Puntaje global = Σ(valor de la dimensión × peso de la dimensión) × 100</p><p>Los aportes ponderados se suman y el resultado se expresa en una escala de 0 a 100. Si existe un valor nulo, no se publica un puntaje parcial como resultado oficial.</p></section>
    <section class="methodology-step"><h3><span>6</span>Asignación del nivel global</h3><table class="score-table"><thead><tr><th>Nivel</th><th>Condición</th></tr></thead><tbody><tr><td>Consolidado</td><td>Puntaje ≥ 70 y todas las dimensiones piso consolidadas.</td></tr><tr><td>Intermedio</td><td>Puntaje ≥ 40, ninguna dimensión piso incipiente y no cumple Consolidado.</td></tr><tr><td>Incipiente</td><td>Resto de los casos con información completa.</td></tr><tr><td>Sin dato</td><td>Existe al menos una dimensión sin clasificación válida.</td></tr></tbody></table></section>
    <section class="methodology-step"><h3><span>7</span>Función de las dimensiones piso</h3><p>Las dimensiones marcadas como piso representan condiciones estructurales. Operan de forma genérica según <code>ES_DIMENSION_PISO</code>: un puntaje alto no compensa su ausencia o desarrollo insuficiente.</p></section>
    <section class="methodology-step methodology-note"><h3><span>8</span>Cómo interpretar el resultado</h3><p>La clasificación es una herramienta analítica para orientar la lectura institucional y el acompañamiento. No constituye un ranking de jurisdicciones.</p></section>`;
}

function exportSelectedPDF() {
  const result = resultByKey(state.selectedKey);
  if (!result || state.vistaActiva !== 'general') return;
  const safeName = result.jurisdiccion.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase();
  document.title = `PP_${safeName}`;
  document.body.classList.add('print-mode');
  window.setTimeout(() => window.print(), 80);
}

async function init() {
  try {
    setStatus('Cargando datos desde Google Sheets...');
    state.model = await loadApplicationData();
    state.mapView = new MapView('map', key => selectJurisdiction(key, { scrollDetail: true, toggle: true }), clearSelection);
    await state.mapView.init(state.model.jurisdicciones);
    oferentesBtn.disabled = !state.model.oferentesAvailable;
    if (!state.model.oferentesAvailable) oferentesBtn.title = `Vista no disponible: ${state.model.oferentesError}`;
    normativasBtn.disabled = !state.model.normativasAvailable;
    if (!state.model.normativasAvailable) normativasBtn.title = `Repositorio no disponible: ${state.model.normativasError}`;
    state.normativeRepository = new NormativeRepository(normativeRepositoryContainer);
    if (state.model.normativasAvailable) state.normativeRepository.setRows(state.model.normativas);
    else state.normativeRepository.setError();
    renderGeneralView();
    renderInstitutionalizationDetail(detail, null);
    renderMethodology();
    renderInstitutionalizationLegend();

    const unavailableSources = [
      !state.model.normativasAvailable ? `05_NORMATIVAS: ${state.model.normativasError}` : '',
      !state.model.oferentesAvailable ? `06_OFERENTES: ${state.model.oferentesError}` : ''
    ].filter(Boolean);
    if (unavailableSources.length) {
      setStatus(`La vista general está disponible, pero no se pudo cargar ${unavailableSources.join(' · ')}`, 'warning');
    } else if (state.model.warnings.length) {
      setStatus(`Datos cargados con ${state.model.warnings.length} advertencia(s). Consulte la consola para el detalle.`, 'warning');
      console.warn('[Advertencias de datos]', state.model.warnings);
    } else {
      hideStatus();
    }
  } catch (error) {
    console.error('[Error de carga]', error);
    setStatus(`No se pudieron cargar datos válidos: ${error.message}`, 'error', true);
  }
}

methodologyBtn.addEventListener('click', () => methodologyModal.classList.add('open'));
methodologyClose.addEventListener('click', () => methodologyModal.classList.remove('open'));
methodologyModal.addEventListener('click', event => { if (event.target === methodologyModal) methodologyModal.classList.remove('open'); });
document.addEventListener('keydown', event => { if (event.key === 'Escape') methodologyModal.classList.remove('open'); });
pdfBtn.addEventListener('click', exportSelectedPDF);
oferentesBtn.addEventListener('click', toggleOferentesView);
normativasBtn.addEventListener('click', showNormativas);
refreshBtn.addEventListener('click', () => window.location.reload());
retryBtn.addEventListener('click', () => window.location.reload());
window.addEventListener('afterprint', () => { document.body.classList.remove('print-mode'); document.title = state.originalTitle; });
schoolsLayerBtn.addEventListener('click', async () => {
  if (!state.mapView || state.vistaActiva !== 'general') return;
  schoolsLayerBtn.classList.add('loading');
  try {
    const active = await state.mapView.toggleSchools();
    schoolsLayerBtn.classList.toggle('active', active);
  } catch (error) {
    console.error('[Capa de escuelas]', error);
  } finally {
    schoolsLayerBtn.classList.remove('loading');
  }
});

init();




