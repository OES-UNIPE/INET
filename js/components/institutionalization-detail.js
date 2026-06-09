import { escapeHTML, formatNumber, get, normalize } from '../utils/normalize.js';

function levelClass(level) {
  return normalize(level);
}

function levelText(result) {
  if (!result) return '';
  if (result.level === 'Consolidado') return 'Presenta condiciones institucionales consolidadas, con base formal y funcionamiento efectivo robustos.';
  if (result.level === 'Intermedio') return 'Presenta condiciones institucionales parciales o en desarrollo, con atributos relevantes pero heterogéneos.';
  return 'Presenta condiciones institucionales incipientes o con baja presencia de atributos relevados.';
}

function methodologicalNote(result) {
  if (!result) return '';
  if (!result.d1MeetsFloor || !result.d2MeetsFloor) {
    return 'Se mantiene como incipiente porque D1 y D2 deben alcanzar al menos nivel intermedio para superar el piso.';
  }
  if (result.level === 'Intermedio' && result.total >= 65 && result.hasEveryDim && (!result.d1IsConsolidated || !result.d2IsConsolidated)) {
    return 'Se mantiene como intermedio porque para alcanzar el nivel consolidado D1 y D2 deben estar consolidadas.';
  }
  if (result.level === 'Intermedio' && result.total >= 65 && !result.hasEveryDim) {
    return 'Se mantiene como intermedio porque no registra al menos un atributo en cada dimensión.';
  }
  return '';
}

function itemStatus(item) {
  if (item.value >= item.max) return { className: 'ok', symbol: '✓' };
  if (item.value > 0) return { className: 'partial', symbol: '½' };
  return { className: 'no', symbol: '×' };
}

export function renderInstitutionalizationDetail(container, result) {
  if (!result) {
    container.innerHTML = '';
    return;
  }

  const note = methodologicalNote(result);

  container.innerHTML = `
    <section class="detail-card">
      <div class="detail-hero">
        <div>
          <span class="jbadge">${escapeHTML(get(result.row, 'jurisdiccion'))}</span>
          <h2>${escapeHTML(get(result.row, 'nombre'))}</h2>
          <p>Última respuesta: ${escapeHTML(get(result.row, 'timestamp'))}</p>
        </div>
        <div class="global-score">
          <span class="pill ${levelClass(result.level)}">${escapeHTML(result.level)}</span>
        </div>
      </div>
      <p class="detail-note">${escapeHTML(levelText(result))}${note ? ` ${escapeHTML(note)}` : ''}</p>

      <div class="dimension-grid">
        ${result.dimResults.map(dimension => `
          <article class="dimension-card">
            <div class="dimension-head">
              <span>${escapeHTML(dimension.id)}</span>
              <strong>${escapeHTML(dimension.title)}</strong>
              <em class="${levelClass(dimension.level)}">${escapeHTML(dimension.level)}</em>
            </div>
            <div class="dimension-score">${formatNumber(dimension.totalValue)} / ${formatNumber(dimension.maxValue)}</div>
            <div class="question-list">
              ${dimension.items.map(item => `
                <div class="item-card">
                  <div class="item-icon ${itemStatus(item).className}">${itemStatus(item).symbol}</div>
                  <div class="item-content">
                    <div class="item-title">${escapeHTML(item.id)} · ${escapeHTML(item.label)}</div>
                    <div class="item-question"><strong>Pregunta fuente:</strong> ${escapeHTML(item.question)}</div>
                    <div class="item-raw"><strong>Respuesta:</strong> ${escapeHTML(item.raw)}</div>
                  </div>
                </div>
              `).join('')}
            </div>
          </article>
        `).join('')}
      </div>
    </section>`;
}
