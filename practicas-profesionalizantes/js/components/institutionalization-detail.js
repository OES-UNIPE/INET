import { escapeHTML, formatNumber } from '../utils/normalize.js';

function percent(value) {
  return `${formatNumber(value * 100)}%`;
}

export function renderInstitutionalizationDetail(container, result) {
  if (!result) {
    container.innerHTML = '';
    return;
  }

  const incomplete = result.puntajeGlobal === null;
  const scoreText = incomplete ? 'Información incompleta' : `${formatNumber(result.puntajeGlobal)} / 100`;
  const warning = result.tieneValoresInvalidos
    ? 'Hay valores no reconocidos en la fuente. Se identifican abajo y el índice no se calcula hasta corregirlos.'
    : `Faltan datos en: ${result.dimensionesFaltantes.join(', ')}. No se calcula ni publica un puntaje parcial.`;

  container.innerHTML = `
    <section class="detail-card">
      <div class="detail-hero">
        <div>
          <span class="jbadge">Ficha jurisdiccional</span>
          <h2>${escapeHTML(result.jurisdiccion)}</h2>
        </div>
        <div class="global-score">
          <span class="pill ${result.nivelClase}">${escapeHTML(result.nivelGlobal)}</span>
          <strong>${escapeHTML(scoreText)}</strong>
        </div>
      </div>
      ${incomplete ? `<p class="incomplete-warning"><strong>Información incompleta.</strong> ${escapeHTML(warning)}</p>` : ''}

      <div class="dimension-grid">
        ${result.dimensiones.map(dimension => `
          <article class="dimension-card">
            <div class="dimension-head">
              <span>${escapeHTML(dimension.id)}</span>
              <strong>${escapeHTML(dimension.etiquetaCorta)}</strong>
              <em class="${dimension.nivelClase}">${escapeHTML(dimension.nivelEtiqueta)}</em>
            </div>
            <div class="dimension-body">
              <p class="rubric-description">${escapeHTML(dimension.descripcionNivel || 'Sin descripción de rúbrica disponible.')}</p>
              <p class="dimension-full-label">${escapeHTML(dimension.etiquetaCompleta)}</p>
              ${dimension.invalida ? `<p class="invalid-value">Valor inválido en la fuente: “${escapeHTML(dimension.valorOriginal || '(vacío)')}”.</p>` : ''}
              <dl class="dimension-meta">
                <div><dt>Peso</dt><dd>${percent(dimension.peso)}</dd></div>
                <div><dt>Aporte</dt><dd>${dimension.aporte === null ? 'No calculable' : `${formatNumber(dimension.aporte)} puntos`}</dd></div>
                ${dimension.esPiso ? '<div><dt>Regla</dt><dd>Dimensión piso</dd></div>' : ''}
              </dl>
            </div>
          </article>`).join('')}
      </div>
      <div class="observations">
        <span class="section-kicker">Observaciones</span>
        <p>${escapeHTML(result.observaciones || 'Sin observaciones.')}</p>
      </div>
    </section>`;
}
