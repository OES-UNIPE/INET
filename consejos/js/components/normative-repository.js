import { escapeHTML, normalize } from '../utils/normalize.js';

const COLUMNS = [
  'Jurisdicción',
  'Tipo',
  'Número',
  'Fecha',
  'Descripción',
  'Sectores que lo integran',
  'Integrantes por sector',
  'Estructura organizativa',
  'Enlace'
];

function value(row, key) {
  return row[key] || '';
}

function searchText(row) {
  return normalize(Object.keys(row)
    .filter(key => !key.startsWith('__'))
    .map(key => row[key])
    .join(' '));
}

function jurisdictionKey(value) {
  const key = normalize(value);
  if (key === 'ciudad autonoma de buenos aires' || key === 'ciudad de buenos aires') return 'caba';
  return key;
}

function matchesJurisdiction(row, jurisdiction) {
  if (!jurisdiction) return true;
  return jurisdictionKey(value(row, 'Jurisdicción')) === jurisdictionKey(jurisdiction);
}

function linkCell(link) {
  const clean = link.trim();
  if (!clean) return '—';
  if (!/^https?:\/\//i.test(clean)) return `<span class="missing-link" title="${escapeHTML(clean)}">Enlace no disponible</span>`;
  const safeLink = escapeHTML(clean);
  return `<a href="${safeLink}" target="_blank" rel="noopener noreferrer">Ver normativa</a>`;
}

function tableRows(rows) {
  return rows.map(row => `
    <tr>
      <td data-label="Jurisdicción">${escapeHTML(value(row, 'Jurisdicción'))}</td>
      <td data-label="Tipo">${escapeHTML(value(row, 'Tipo'))}</td>
      <td data-label="Número">${escapeHTML(value(row, 'Número'))}</td>
      <td data-label="Fecha">${escapeHTML(value(row, 'Fecha'))}</td>
      <td data-label="Descripción" class="long-text">${escapeHTML(value(row, 'Descripción'))}</td>
      <td data-label="Sectores que lo integran" class="long-text">${escapeHTML(value(row, 'Sectores que lo integran'))}</td>
      <td data-label="Integrantes por sector" class="long-text">${escapeHTML(value(row, 'Integrantes por sector'))}</td>
      <td data-label="Estructura organizativa" class="long-text">${escapeHTML(value(row, 'Estructura organizativa'))}</td>
      <td data-label="Enlace">${linkCell(value(row, 'Enlace'))}</td>
    </tr>
  `).join('');
}

export class NormativeRepository {
  constructor(container) {
    this.container = container;
    this.rows = [];
    this.query = '';
    this.jurisdiction = '';
    this.status = 'loading';
    this.collapsed = true;
  }

  setLoading() {
    this.status = 'loading';
    this.render();
  }

  setRows(rows) {
    this.rows = rows;
    this.status = rows.length ? 'ready' : 'empty';
    this.render();
  }

  setError() {
    this.status = 'error';
    this.render();
  }

  setJurisdiction(jurisdiction) {
    this.jurisdiction = jurisdiction || '';
    this.render();
  }

  clearJurisdictionFilter() {
    this.jurisdiction = '';
    this.render();
  }

  expand() {
    this.collapsed = false;
    this.render();
  }

  collapse() {
    this.collapsed = true;
    this.render();
  }

  toggleCollapsed() {
    this.collapsed = !this.collapsed;
    this.render();
  }

  filteredRows() {
    const cleanQuery = normalize(this.query);
    return this.rows.filter(row => {
      const byJurisdiction = matchesJurisdiction(row, this.jurisdiction);
      const bySearch = !cleanQuery || searchText(row).includes(cleanQuery);
      return byJurisdiction && bySearch;
    });
  }

  renderMessage(message) {
    return `<div class="repository-message">${message}</div>`;
  }

  render() {
    const filtered = this.filteredRows();
    const hasJurisdictionFilter = Boolean(this.jurisdiction);

    this.container.innerHTML = `
      <section class="normative-repository table-card">
        <div class="table-header repository-header">
          <div>
            <span class="section-kicker">Documentación</span>
            <h2>Repositorio de normativas</h2>
          </div>
          <div class="repository-actions">
            <span class="table-count">${!this.collapsed && this.status === 'ready' ? `Mostrando ${filtered.length} de ${this.rows.length} normativas` : ''}</span>
            <button class="small-btn" id="toggleNormativeRepository" type="button">${this.collapsed ? 'Expandir' : 'Contraer'}</button>
          </div>
        </div>
        <div class="repository-body ${this.collapsed ? 'is-collapsed' : ''}">
          <div class="repository-controls">
            <label>
              <span>Buscar normativa</span>
              <input id="normativeSearch" type="search" value="${escapeHTML(this.query)}" placeholder="Buscar por jurisdicción, tipo, descripción, sectores...">
            </label>
            ${hasJurisdictionFilter ? `
              <div class="active-filter">
                <span>Filtro activo: ${escapeHTML(this.jurisdiction)}</span>
                <button class="small-btn" id="clearNormativeJurisdiction" type="button">Ver todas las jurisdicciones</button>
              </div>
            ` : ''}
          </div>
          ${this.renderBody(filtered)}
        </div>
      </section>
    `;

    const toggleButton = this.container.querySelector('#toggleNormativeRepository');
    if (toggleButton) toggleButton.addEventListener('click', () => this.toggleCollapsed());

    const input = this.container.querySelector('#normativeSearch');
    if (input) {
      input.addEventListener('input', event => {
        this.query = event.target.value;
        this.render();
        const nextInput = this.container.querySelector('#normativeSearch');
        if (nextInput) {
          nextInput.focus();
          nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
        }
      });
    }

    const clearButton = this.container.querySelector('#clearNormativeJurisdiction');
    if (clearButton) clearButton.addEventListener('click', () => this.clearJurisdictionFilter());
  }

  renderBody(filtered) {
    if (this.status === 'loading') return this.renderMessage('Cargando repositorio de normativas...');
    if (this.status === 'error') return this.renderMessage('No se pudo cargar el repositorio de normativas.');
    if (this.status === 'empty') return this.renderMessage('No hay normativas disponibles para mostrar.');
    if (!filtered.length) return this.renderMessage('No se encontraron normativas para la búsqueda ingresada.');

    return `
      <div class="repository-table-wrap">
        <table>
          <thead>
            <tr>${COLUMNS.map(column => `<th>${escapeHTML(column)}</th>`).join('')}</tr>
          </thead>
          <tbody>${tableRows(filtered)}</tbody>
        </table>
      </div>
    `;
  }
}
