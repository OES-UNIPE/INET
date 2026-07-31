import { escapeHTML, normalize } from '../utils/normalize.js';

function searchText(row) {
  return normalize(`${row.jurisdiccion} ${row.nombre}`);
}

function linkCell(link) {
  const clean = String(link || '').trim();
  if (!/^https?:\/\//i.test(clean)) return '<span class="missing-link">Enlace no disponible</span>';
  return `<a href="${escapeHTML(clean)}" target="_blank" rel="noopener noreferrer">Descargar</a>`;
}

function tableRows(rows) {
  return rows.map(row => `
    <tr>
      <td data-label="Jurisdicción">${escapeHTML(row.jurisdiccion)}</td>
      <td data-label="Nombre" class="long-text">${escapeHTML(row.nombre || '—')}</td>
      <td data-label="Enlace">${linkCell(row.enlace)}</td>
    </tr>`).join('');
}

export class NormativeRepository {
  constructor(container) {
    this.container = container;
    this.rows = [];
    this.query = '';
    this.status = 'loading';
    this.collapsed = true;
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

  expand() {
    this.collapsed = false;
    this.render();
  }

  toggleCollapsed() {
    this.collapsed = !this.collapsed;
    this.render();
  }

  filteredRows() {
    const query = normalize(this.query);
    return query ? this.rows.filter(row => searchText(row).includes(query)) : this.rows;
  }

  renderBody(rows) {
    if (this.status === 'loading') return '<div class="repository-message">Cargando repositorio de normativas...</div>';
    if (this.status === 'error') return '<div class="repository-message">No se pudo cargar el repositorio de normativas.</div>';
    if (this.status === 'empty') return '<div class="repository-message">No hay normativas habilitadas para mostrar.</div>';
    if (!rows.length) return '<div class="repository-message">No se encontraron normativas para la búsqueda ingresada.</div>';
    return `
      <div class="repository-table-wrap normative-table-wrap">
        <table class="normative-table">
          <thead><tr><th>Jurisdicción</th><th>Nombre</th><th>Enlace</th></tr></thead>
          <tbody>${tableRows(rows)}</tbody>
        </table>
      </div>`;
  }

  render() {
    const filtered = this.filteredRows();
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
              <input id="normativeSearch" type="search" value="${escapeHTML(this.query)}" placeholder="Buscar por jurisdicción o nombre de archivo">
            </label>
          </div>
          ${this.renderBody(filtered)}
        </div>
      </section>`;

    this.container.querySelector('#toggleNormativeRepository')?.addEventListener('click', () => this.toggleCollapsed());
    const input = this.container.querySelector('#normativeSearch');
    input?.addEventListener('input', event => {
      this.query = event.target.value;
      this.render();
      const nextInput = this.container.querySelector('#normativeSearch');
      nextInput?.focus();
      nextInput?.setSelectionRange(nextInput.value.length, nextInput.value.length);
    });
  }
}
