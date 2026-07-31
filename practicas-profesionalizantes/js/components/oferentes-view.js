import { escapeHTML } from '../utils/normalize.js';

let widgetPosition = null;
let activeWidget = null;

function emptyValue(value) {
  return value ? escapeHTML(value) : '—';
}

export function formatPercentage(count, total) {
  const percentage = total ? (count / total) * 100 : 0;
  return percentage.toLocaleString('es-AR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function clampPosition(widget, left, top) {
  const margin = 8;
  const maxLeft = Math.max(margin, window.innerWidth - widget.offsetWidth - margin);
  const maxTop = Math.max(margin, window.innerHeight - widget.offsetHeight - margin);
  return {
    left: Math.min(Math.max(margin, left), maxLeft),
    top: Math.min(Math.max(margin, top), maxTop)
  };
}

function applyWidgetPosition(widget, mapElement) {
  if (!widgetPosition) {
    const mapRect = mapElement.getBoundingClientRect();
    widgetPosition = {
      left: mapRect.right + 12,
      top: Math.max(72, mapRect.top)
    };
  }
  widgetPosition = clampPosition(widget, widgetPosition.left, widgetPosition.top);
  widget.style.left = `${widgetPosition.left}px`;
  widget.style.top = `${widgetPosition.top}px`;
}

function makeDraggable(widget, mapElement) {
  const handle = widget.querySelector('.schools-panel-head');
  let drag = null;

  handle.addEventListener('pointerdown', event => {
    if (event.target.closest('button')) return;
    const rect = widget.getBoundingClientRect();
    drag = { pointerId: event.pointerId, offsetX: event.clientX - rect.left, offsetY: event.clientY - rect.top };
    handle.setPointerCapture(event.pointerId);
    widget.classList.add('is-dragging');
    event.preventDefault();
  });

  handle.addEventListener('pointermove', event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    widgetPosition = clampPosition(widget, event.clientX - drag.offsetX, event.clientY - drag.offsetY);
    widget.style.left = `${widgetPosition.left}px`;
    widget.style.top = `${widgetPosition.top}px`;
  });

  const endDrag = event => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    widget.classList.remove('is-dragging');
    if (handle.hasPointerCapture(event.pointerId)) handle.releasePointerCapture(event.pointerId);
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  applyWidgetPosition(widget, mapElement);
}

if (globalThis.addEventListener) {
  globalThis.addEventListener('resize', () => {
    if (!activeWidget?.isConnected || !widgetPosition) return;
    widgetPosition = clampPosition(activeWidget, widgetPosition.left, widgetPosition.top);
    activeWidget.style.left = `${widgetPosition.left}px`;
    activeWidget.style.top = `${widgetPosition.top}px`;
  });
}

export function renderOferentesTable(container, rows, state, callbacks) {
  const jurisdictionLabel = state.jurisdiccionNombre || '';
  const hasFilters = Boolean(jurisdictionLabel || state.ambitoSeleccionado);

  container.innerHTML = `
    <section class="oferentes-repository table-card">
      <div class="table-header repository-header">
        <div>
          <span class="section-kicker">Instituciones y actores</span>
          <h2>Instituciones/actores vinculados con las Prácticas Profesionalizantes</h2>
        </div>
        <div class="repository-actions">
          <span class="table-count">${rows.length} registro${rows.length === 1 ? '' : 's'}</span>
          ${state.widgetAmbitoVisible ? '' : '<button class="small-btn" id="showAmbitoWidget" type="button">Mostrar gráfico</button>'}
        </div>
      </div>
      ${hasFilters ? `
        <div class="oferentes-active-filters" aria-label="Filtros activos">
          <strong>Filtros activos</strong>
          ${jurisdictionLabel ? `<button type="button" data-clear="jurisdiccion">Jurisdicción: ${escapeHTML(jurisdictionLabel)} ×</button>` : ''}
          ${state.ambitoSeleccionado ? `<button type="button" data-clear="ambito">Ámbito: ${escapeHTML(state.ambitoSeleccionado)} ×</button>` : ''}
        </div>` : ''}
      ${rows.length ? `
        <div class="repository-table-wrap oferentes-table-wrap">
          <table class="oferentes-table">
            <thead><tr><th>Jurisdicción</th><th>Actor / Institución</th><th>Ámbito</th><th>Sector</th><th>Observaciones</th></tr></thead>
            <tbody>${rows.map(row => `
              <tr>
                <td data-label="Jurisdicción">${escapeHTML(row.jurisdiccion)}</td>
                <td data-label="Actor / Institución"><strong>${emptyValue(row.actorInstitucion)}</strong></td>
                <td data-label="Ámbito">${emptyValue(row.ambito)}</td>
                <td data-label="Sector">${emptyValue(row.sector)}</td>
                <td data-label="Observaciones" class="long-text">${emptyValue(row.observaciones)}</td>
              </tr>`).join('')}</tbody>
          </table>
        </div>` : '<div class="repository-message">No hay instituciones/actores para los filtros seleccionados.</div>'}
    </section>`;

  container.querySelector('#showAmbitoWidget')?.addEventListener('click', callbacks.onShowWidget);
  container.querySelector('[data-clear="jurisdiccion"]')?.addEventListener('click', callbacks.onClearJurisdiction);
  container.querySelector('[data-clear="ambito"]')?.addEventListener('click', callbacks.onClearAmbito);
}

export function renderAmbitoWidget(mapElement, distribution, state, callbacks) {
  activeWidget?.remove();
  activeWidget = null;
  if (!state.widgetAmbitoVisible) return;

  const total = distribution.reduce((sum, item) => sum + item.count, 0);
  const max = Math.max(0, ...distribution.map(item => item.count));
  const widget = document.createElement('section');
  widget.className = 'schools-panel ambito-widget';
  widget.setAttribute('aria-label', 'Distribución de instituciones y actores por ámbito');
  widget.innerHTML = `
    <div class="schools-panel-head" title="Arrastrar para mover">
      <div>
        <strong>Distribución por ámbito</strong>
        <span>${state.jurisdiccionNombre ? escapeHTML(state.jurisdiccionNombre) : 'Todo el país'} · ${total} registros</span>
      </div>
      <button type="button" data-close aria-label="Cerrar gráfico">×</button>
    </div>
    <div class="schools-panel-body ambito-chart">
      ${distribution.length ? distribution.map(item => {
        const selected = item.ambito === state.ambitoSeleccionado;
        const width = max ? Math.max(4, (item.count / max) * 100) : 0;
        const percentage = formatPercentage(item.count, total);
        return `<button type="button" class="ambito-bar ${selected ? 'active' : ''}" data-ambito="${escapeHTML(item.ambito)}" aria-pressed="${selected}">
          <span class="ambito-bar-label"><strong>${escapeHTML(item.ambito)} <span>(${percentage} %)</span></strong><b>${item.count}</b></span>
          <i><span style="width:${width}%"></span></i>
        </button>`;
      }).join('') : '<p class="repository-message">No hay datos de ámbito para mostrar.</p>'}
      ${state.ambitoSeleccionado ? '<button type="button" class="small-btn clear-ambito" data-clear-ambito>Limpiar filtro de ámbito</button>' : ''}
    </div>`;

  document.body.appendChild(widget);
  activeWidget = widget;
  makeDraggable(widget, mapElement);
  widget.querySelector('[data-close]').addEventListener('click', callbacks.onClose);
  widget.querySelector('[data-clear-ambito]')?.addEventListener('click', callbacks.onClearAmbito);
  widget.querySelectorAll('[data-ambito]').forEach(button => {
    button.addEventListener('click', () => callbacks.onSelectAmbito(button.dataset.ambito));
  });
}
