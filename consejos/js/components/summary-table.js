import { get, escapeHTML, formatNumber, normalize } from '../utils/normalize.js';
import { resultKey } from '../services/geo-service.js';

function levelClass(level) {
  return normalize(level);
}

export function renderSummaryTable(container, results, selectedKey, onSelect, options = {}) {
  const order = { Consolidado: 3, Intermedio: 2, Incipiente: 1 };
  const dimensionHeaders = results[0]?.dimResults || [];
  const selectedDimension = options.selectedDimension || 'global';
  const dimensionHeader = (id, title) => `<th scope="col" class="${id === selectedDimension ? 'map-dimension-active' : ''}">
    <button type="button" class="dimension-map-btn" data-dimension="${escapeHTML(id)}"
      aria-pressed="${id === selectedDimension}" title="Colorear el mapa por ${escapeHTML(title)}">${escapeHTML(title)}</button>
  </th>`;
  const sorted = [...results].sort((a, b) => {
    const byLevel = order[b.level] - order[a.level];
    if (byLevel) return byLevel;
    return get(a.row, 'jurisdiccion').localeCompare(get(b.row, 'jurisdiccion'), 'es');
  });

  container.innerHTML = `
    <div class="table-card ${options.collapsed ? 'collapsed' : ''} ${!selectedKey ? 'full-height' : ''}">
      <div class="table-header">
        <div>
          <span class="section-kicker">Vista general</span>
          <h2>Mapa de Institucionalización</h2>
        </div>
        <div class="table-actions">
          <span class="table-count">${sorted.length} jurisdicciones</span>
          ${options.collapsed ? '<button class="small-btn" id="expandGeneral" type="button">Ver tabla</button>' : ''}
        </div>
      </div>
      <p class="table-map-hint">Seleccioná Global o una dimensión en los encabezados para colorear el mapa.</p>
      <div class="table-scroll ${options.collapsed ? 'is-hidden' : ''}">
        <table>
          <thead>
            <tr>
              <th scope="col">Jurisdicción</th>
              ${dimensionHeader('global', 'Global')}
              ${dimensionHeaders.map(dimension => dimensionHeader(dimension.id, dimension.title)).join('')}
            </tr>
          </thead>
          <tbody>
            ${sorted.map(result => {
              const key = resultKey(result.row);
              return `
                <tr class="${key === selectedKey ? 'selected' : ''}" data-key="${escapeHTML(key)}">
                  <td>${escapeHTML(get(result.row, 'jurisdiccion'))}</td>
                  <td class="${selectedDimension === 'global' ? 'map-dimension-active' : ''}"><span class="pill ${levelClass(result.level)}">${escapeHTML(result.level)}</span></td>
                  ${result.dimResults.map(dimension => `
                    <td class="${selectedDimension === dimension.id ? 'map-dimension-active' : ''}">
                      <span class="mini-level ${levelClass(dimension.level)}">${escapeHTML(dimension.level)}</span>
                      <span class="score-frac">${formatNumber(dimension.totalValue)} / ${formatNumber(dimension.maxValue)}</span>
                    </td>
                  `).join('')}
                </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  const expandButton = container.querySelector('#expandGeneral');
  if (expandButton && options.onExpand) expandButton.addEventListener('click', options.onExpand);

  container.querySelectorAll('[data-dimension]').forEach(button => {
    button.addEventListener('click', () => options.onDimensionSelect?.(button.dataset.dimension));
  });

  container.querySelectorAll('tr[data-key]').forEach(row => {
    row.addEventListener('click', () => onSelect(row.dataset.key));
  });
}
