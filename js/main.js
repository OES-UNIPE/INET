import { loadJurisdictionRows } from './services/data-service.js';
import { evaluateRows } from './services/institutionalization-service.js';
import { resultKey } from './services/geo-service.js';
import { renderSummaryTable } from './components/summary-table.js';
import { renderInstitutionalizationDetail } from './components/institutionalization-detail.js';
import { renderFichaConsejo } from './components/ficha-consejo.js';
import { MapView } from './components/map-view.js';

const status = document.querySelector('#status');
const summaryTable = document.querySelector('#summaryTable');
const detail = document.querySelector('#institutionalizationDetail');
const ficha = document.querySelector('#fichaConsejo');
const methodologyModal = document.querySelector('#methodologyModal');
const methodologyBtn = document.querySelector('#methodologyBtn');
const methodologyClose = document.querySelector('#methodologyClose');
const schoolsLayerBtn = document.querySelector('#schoolsLayerBtn');
const pdfBtn = document.querySelector('#pdfBtn');

const state = {
  rows: [],
  results: [],
  selectedKey: null,
  mapView: null,
  generalCollapsed: false,
  originalTitle: document.title
};

function setStatus(message, type = 'info') {
  status.textContent = message;
  status.className = `status show ${type === 'error' ? 'error' : ''}`;
}

function hideStatus() {
  status.className = 'status';
}

function resultByKey(key) {
  return state.results.find(result => resultKey(result.row) === key);
}

function selectJurisdiction(key, options = {}) {
  if (state.selectedKey === key && options.toggle) {
    clearSelection();
    return;
  }

  const result = resultByKey(key);
  if (!result) return;

  state.selectedKey = key;
  state.generalCollapsed = true;
  state.mapView.select(key);
  document.body.classList.add('is-transitioning-selection');
  renderGeneralView();
  renderInstitutionalizationDetail(detail, result);
  renderFichaConsejo(ficha, result.row);
  pdfBtn.disabled = false;
  window.setTimeout(() => document.body.classList.remove('is-transitioning-selection'), 320);

  if (options.scrollDetail) {
    detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
}

function clearSelection() {
  state.selectedKey = null;
  state.generalCollapsed = false;
  state.mapView.clearSelection();
  document.body.classList.add('is-transitioning-selection');
  renderGeneralView();
  renderInstitutionalizationDetail(detail, null);
  renderFichaConsejo(ficha, null);
  pdfBtn.disabled = true;
  window.setTimeout(() => document.body.classList.remove('is-transitioning-selection'), 320);
}

function expandFichaForPrint() {
  ficha.querySelectorAll('.ficha-body, .sec-body').forEach(element => element.classList.add('open'));
  ficha.querySelectorAll('[data-toggle]').forEach(button => {
    button.classList.add('open');
    button.setAttribute('aria-expanded', 'true');
    const label = button.querySelector('.btn-ver, strong');
    if (label) label.textContent = 'Ocultar';
  });
}

function exportSelectedPDF() {
  if (!state.selectedKey) return;
  const result = resultByKey(state.selectedKey);
  const jurisdiction = result?.row?.__jurisdictionKey || state.selectedKey;
  const safeJurisdiction = jurisdiction
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  document.title = `COPETyP_${safeJurisdiction}`;
  expandFichaForPrint();
  document.body.classList.add('print-mode');
  window.setTimeout(() => window.print(), 80);
}

function expandGeneralView() {
  state.generalCollapsed = false;
  renderGeneralView();
  summaryTable.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderGeneralView() {
  renderSummaryTable(summaryTable, state.results, state.selectedKey, key => selectJurisdiction(key, { scrollDetail: true }), {
    collapsed: state.generalCollapsed,
    onExpand: expandGeneralView
  });
}

function openModal() {
  methodologyModal.classList.add('open');
}

function closeModal() {
  methodologyModal.classList.remove('open');
}

async function init() {
  try {
    setStatus('Cargando datos...');
    state.rows = await loadJurisdictionRows();
    state.results = evaluateRows(state.rows);

    state.mapView = new MapView('map', key => selectJurisdiction(key, { scrollDetail: true, toggle: true }), clearSelection);
    await state.mapView.init(state.results);

    renderGeneralView();
    renderInstitutionalizationDetail(detail, null);

    hideStatus();
  } catch (error) {
    console.error(error);
    setStatus(`Error al cargar la aplicación: ${error.message}`, 'error');
  }
}

methodologyBtn.addEventListener('click', openModal);
methodologyClose.addEventListener('click', closeModal);
pdfBtn.addEventListener('click', exportSelectedPDF);
window.addEventListener('afterprint', () => {
  document.body.classList.remove('print-mode');
  document.title = state.originalTitle;
});
schoolsLayerBtn.addEventListener('click', async () => {
  if (!state.mapView) return;
  schoolsLayerBtn.classList.add('loading');
  try {
    const active = await state.mapView.toggleSchools();
    schoolsLayerBtn.classList.toggle('active', active);
  } finally {
    schoolsLayerBtn.classList.remove('loading');
  }
});
methodologyModal.addEventListener('click', event => {
  if (event.target === methodologyModal) closeModal();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape') closeModal();
});

init();
