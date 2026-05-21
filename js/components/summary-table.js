import { get, escapeHTML, formatNumber, normalize } from '../utils/normalize.js';
import { resultKey } from '../services/geo-service.js';

function levelClass(level) {
  return normalize(level);
}

export function renderSummaryTable(container, results, selectedKey, onSelect, options = {}) {
  const order = { Consolidado: 3, Intermedio: 2, Incipiente: 1 };
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
      <div class="table-scroll ${options.collapsed ? 'is-hidden' : ''}">
        <table>
          <thead>
            <tr>
              <th>Jurisdicción</th>
              <th>Global</th>
              <th>D1</th>
              <th>D2</th>
              <th>D3</th>
              <th>D4</th>
            </tr>
          </thead>
          <tbody>
            ${sorted.map(result => {
              const key = resultKey(result.row);
              return `
                <tr class="${key === selectedKey ? 'selected' : ''}" data-key="${escapeHTML(key)}">
                  <td>${escapeHTML(get(result.row, 'jurisdiccion'))}</td>
                  <td><span class="pill ${levelClass(result.level)}">${escapeHTML(result.level)}</span></td>
                  ${result.dimResults.map(dimension => `
                    <td>
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

  container.querySelectorAll('tr[data-key]').forEach(row => {
    row.addEventListener('click', () => onSelect(row.dataset.key));
  });
}
