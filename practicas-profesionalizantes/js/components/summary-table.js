import { escapeHTML, formatNumber } from '../utils/normalize.js';
import { resultKey } from '../services/geo-service.js';


function dimensionFor(result, id) {
  return result.dimensiones.find(dimension => dimension.id === id);
}

function displayedDimensionLevel(level) {
  const label = level?.nivelEtiqueta || 'Sin dato';
  const className = level?.nivelClase || 'sin-dato';
  return `<span class="mini-level matrix-level ${className}">${escapeHTML(label)}</span>`;
}

export function renderSummaryTable(container, results, dimensions, selectedKey, onSelect, options = {}) {
  const order = { Consolidado: 3, Intermedio: 2, Incipiente: 1, 'Sin dato': 0, Pendiente: -1 };
  const sorted = [...results].sort((a, b) => {
    return (order[b.nivelGlobal] - order[a.nivelGlobal]) || a.jurisdiccion.localeCompare(b.jurisdiccion, 'es');
  });
  const isOverview = !selectedKey;

  container.innerHTML = `
    <div class="table-card summary-overview ${options.collapsed ? 'collapsed' : ''} ${isOverview ? 'full-height' : ''}">
      <div class="table-header">
        <div>
          <span class="section-kicker">Vista general</span>
          <h2>Institucionalización de las Prácticas Profesionalizantes</h2>
        </div>
        <div class="table-actions">
          <span class="table-count">${sorted.length} jurisdicciones</span>
          ${options.collapsed ? '<button class="small-btn" id="expandGeneral" type="button">Ver tabla</button>' : ''}
        </div>
      </div>
      <div class="table-scroll summary-matrix-wrap ${options.collapsed ? 'is-hidden' : ''}">
        <table class="summary-matrix">
          <colgroup>
            <col class="jurisdiction-col"><col class="global-col">
            ${dimensions.map(() => '<col class="dimension-col">').join('')}
          </colgroup>
          <thead>
            <tr>
              <th>Jurisdicción</th>
              <th>Global</th>
              ${dimensions.map(dimension => `<th title="${escapeHTML(dimension.etiquetaCompleta)}">${escapeHTML(dimension.etiquetaCorta)}</th>`).join('')}
            </tr>
          </thead>
          <tbody>
            ${sorted.map(result => {
              const key = resultKey(result);
              const score = result.puntajeGlobal === null ? '—' : formatNumber(result.puntajeGlobal);
              return `<tr class="${key === selectedKey ? 'selected' : ''}" data-key="${key}">
                <td class="jurisdiction-name">${escapeHTML(result.jurisdiccion)}</td>
                <td class="global-cell">
                  <span class="pill ${result.nivelClase}" title="${escapeHTML(result.nivelGlobal)}">${escapeHTML(result.nivelGlobal)}</span>
                  <span class="matrix-score" title="Puntaje global">${score}${result.puntajeGlobal === null ? '' : '/100'}</span>
                </td>
                ${dimensions.map(dimension => `<td>${displayedDimensionLevel(dimensionFor(result, dimension.id))}</td>`).join('')}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
      <p class="summary-footnote"><strong>Pendiente:</strong> jurisdicciones con entrevista pendiente de realizacion</p>
    </div>`;

  container.querySelector('#expandGeneral')?.addEventListener('click', options.onExpand);
  container.querySelectorAll('tr[data-key]').forEach(row => {
    row.addEventListener('click', () => onSelect(Number(row.dataset.key)));
  });
}

