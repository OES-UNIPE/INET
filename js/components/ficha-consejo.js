import { ND } from '../config/fields.js';
import { escapeHTML, get, splitOptions } from '../utils/normalize.js';

function tags(value, className = '') {
  const parts = splitOptions(value);
  if (!parts.length) return `<span class="fv">${ND}</span>`;
  return parts.map(part => `<span class="tag ${className}">${escapeHTML(part)}</span>`).join('');
}

function listFromBullets(value) {
  if (!value || value === ND) return `<span class="fv">${ND}</span>`;
  const items = value.split('•').map(item => item.trim()).filter(Boolean);
  if (items.length <= 1) return `<span class="fv">${escapeHTML(value)}</span>`;
  return `<ul class="fv-list">${items.map(item => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`;
}

function field(label, value, full = false) {
  return `
    <div class="field ${full ? 'full' : ''}">
      <div class="fl">${escapeHTML(label)}</div>
      <div class="fv">${escapeHTML(value || ND)}</div>
    </div>`;
}

function fieldTags(label, value, className = '', full = false) {
  return `
    <div class="field ${full ? 'full' : ''}">
      <div class="fl">${escapeHTML(label)}</div>
      <div class="tags">${tags(value, className)}</div>
    </div>`;
}

function fieldList(label, value, full = false) {
  return `
    <div class="field ${full ? 'full' : ''}">
      <div class="fl">${escapeHTML(label)}</div>
      ${listFromBullets(value)}
    </div>`;
}

function section(id, number, title, body, one = false) {
  return `
    <article class="sec">
      <button class="sec-hdr" type="button" data-toggle="${id}" aria-controls="${id}" aria-expanded="false">
        <span class="sn">${number}</span>
        <span class="st">${escapeHTML(title)}</span>
        <span class="btn-ver">Ver detalle</span>
      </button>
      <div class="sec-body ${one ? 'one' : ''}" id="${id}">
        ${body}
      </div>
    </article>`;
}

function documentLinks(row) {
  const archivos = get(row, 'archivoDoc');
  const enlace = get(row, 'enlaceDoc');
  const links = [];

  if (archivos !== ND) {
    archivos.split(',').map(url => url.trim()).filter(url => url.startsWith('http')).forEach((url, index) => {
      links.push(`<a class="doc-btn" href="${escapeHTML(url)}" target="_blank" rel="noopener">Documento adjunto ${index + 1}</a>`);
    });
  }

  if (enlace !== ND && enlace.startsWith('http')) {
    links.push(`<a class="doc-btn" href="${escapeHTML(enlace)}" target="_blank" rel="noopener">Enlace de documentación</a>`);
  }

  if (!links.length) return field('Documentación', 'Esta jurisdicción no presenta documentación', true);
  return `<div class="field full"><div class="fl">Documentación</div><div class="doc-links">${links.join('')}</div></div>`;
}

export function renderFichaConsejo(container, row) {
  if (!row) {
    container.innerHTML = '';
    return;
  }

  const responsable = [
    get(row, 'perfilResp'),
    get(row, 'categoriaResp'),
    get(row, 'tiempoResp') !== ND ? `${get(row, 'tiempoResp')} en el cargo` : ''
  ].filter(value => value && value !== ND).join(' · ') || ND;

  container.innerHTML = `
    <section class="ficha-card">
      <button class="ficha-toggle" type="button" data-toggle="ficha-completa" aria-expanded="false">
        <span>Ficha del Consejo</span>
        <strong>Ver detalle</strong>
      </button>
      <div class="ficha-body" id="ficha-completa">
        <div class="ficha-header">
          <span class="jbadge">${escapeHTML(get(row, 'jurisdiccion'))}</span>
          <h2>${escapeHTML(get(row, 'nombre'))}</h2>
          <div class="ficha-meta">
            <span>Año de creación: ${escapeHTML(get(row, 'anioCreacion'))}</span>
            <span>Estado normativo: ${escapeHTML(get(row, 'estadoNorma'))}</span>
            <span>Ámbito: ${escapeHTML(get(row, 'ambito'))}</span>
          </div>
        </div>
        ${section('s1', '1', 'Composición y representatividad', `
          ${field('Cantidad de actores en la estructura', get(row, 'nActores'))}
          ${fieldTags('Actores gubernamentales', get(row, 'actoresGob'), 'n', true)}
          ${fieldTags('Actores educativo-científicos', get(row, 'actoresEduc'), '', true)}
          ${fieldTags('Actores productivos / empresariales', get(row, 'actoresProd'), 'c', true)}
          ${field('Otros actores o ámbitos', get(row, 'otrosActores'), true)}
        `, true)}
        ${section('s2', '2', 'Estructura orgánica', `
          ${field('Organización interna', get(row, 'organizacion'))}
          ${field('Miembros permanentes', get(row, 'equipoPerm'))}
          ${field('Instancias de trabajo', get(row, 'cualesInstancias'), true)}
          ${field('Responsable', responsable, true)}
        `)}
        ${section('s3', '3', 'Funciones, dinámica y gobernanza', `
          ${fieldList('Funciones principales', get(row, 'funcionesPpal'), true)}
          ${fieldTags('Funciones más frecuentes', get(row, 'funcionesFrecuentes'), '', true)}
          ${field('Frecuencia de reuniones', get(row, 'frecuenciaReun'))}
          ${field('Modalidad de reuniones', get(row, 'modalidadReun'))}
        `, true)}
        ${section('s4', '4', 'Comunicación, acuerdos y resultados', `
          ${field('Acciones de difusión', get(row, 'difusion'), true)}
          ${fieldTags('Tipo de acuerdos o resultados', get(row, 'tipoAcuerdos'), 'n', true)}
          ${field('Formalización de acuerdos', get(row, 'formalizacion'), true)}
          ${field('Acuerdos relevantes recientes', get(row, 'acuerdosRec'), true)}
        `, true)}
        ${section('s5', '5', 'Vinculación y fortalecimiento', `
          ${field('Sector productivo', get(row, 'sectorProd'), true)}
          ${field('Actores laborales', get(row, 'actoresLab'), true)}
          ${field('Otros sectores', get(row, 'cualesSectores'), true)}
          ${field('Tipos de acciones en articulaciones', get(row, 'tipoAcciones'), true)}
        `, true)}
        ${section('s6', '6', 'Específicos de la ETP', `
          ${fieldTags('Rol del Consejo en relación con la ETP', get(row, 'rolEtp'), 'c', true)}
          ${field('Participación en Prácticas Profesionalizantes', get(row, 'actoresPp'), true)}
        `, true)}
        ${section('s7', '7', 'Desafíos y fortalezas', `
          ${field('Principales fortalezas', get(row, 'fortalezas'), true)}
          ${field('Principales desafíos', get(row, 'dificultades'), true)}
          ${field('Comentarios adicionales', get(row, 'comentarios'), true)}
          ${documentLinks(row)}
        `, true)}
      </div>
    </section>`;

  container.querySelectorAll('[data-toggle]').forEach(button => {
    button.addEventListener('click', () => {
      const id = button.dataset.toggle;
      const body = container.querySelector(`#${id}`);
      const isOpen = body.classList.toggle('open');
      button.classList.toggle('open', isOpen);
      button.setAttribute('aria-expanded', String(isOpen));
      const label = button.querySelector('.btn-ver, strong');
      if (label) label.textContent = isOpen ? 'Ocultar' : 'Ver detalle';
    });
  });
}
