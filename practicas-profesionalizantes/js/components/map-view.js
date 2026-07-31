import { indexResultsByProvince, provinceId, provinceName } from '../services/geo-service.js';

const LEVEL_COLORS = {
  Consolidado: '#27AE60',
  Intermedio: '#C8A84B',
  Incipiente: '#C94A4A',
  Pendiente: '#7D8FA3',
  'Sin dato': '#D7E2EE'
};

const ACTOR_COLORS = Object.freeze({
  empty: '#D7E2EE',
  light: '#DCEBF6',
  dark: '#1A5A99'
});

function hexToRgb(hex) {
  const value = hex.replace('#', '');
  return [0, 2, 4].map(offset => Number.parseInt(value.slice(offset, offset + 2), 16));
}

function interpolateColor(from, to, ratio) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const channel = index => Math.round(start[index] + (end[index] - start[index]) * ratio).toString(16).padStart(2, '0');
  return `#${channel(0)}${channel(1)}${channel(2)}`;
}

const GESTION_CONFIG = {
  Estatal: { color: '#27AE60' },
  Privado: { color: '#2980B9' },
  'Gestión social/cooperativa': { color: '#8E44AD' }
};

const AMBITO_CONFIG = {
  Urbano: { color: '#E67E22' },
  Rural: { color: '#16A085' }
};

function selectedStyle() {
  return { color: '#0A2340', weight: 2.5, fillOpacity: 0.9 };
}

function levelForMetric(result, metricId) {
  if (!result) return 'Sin dato';
  if (metricId === 'global') return result.nivelGlobal;
  return result.dimensiones.find(dimension => dimension.id === metricId)?.nivelEtiqueta || 'Sin dato';
}

function featureStyle(result, isSelected, metricId) {
  if (isSelected) return selectedStyle();
  const level = levelForMetric(result, metricId);
  const color = LEVEL_COLORS[level] || LEVEL_COLORS['Sin dato'];
  if (!result) {
    return { fillColor: color, fillOpacity: 0.22, color: 'rgba(10,35,64,.22)', weight: 1 };
  }
  return { fillColor: color, fillOpacity: 0.62, color, weight: 1.2 };
}

export class MapView {
  constructor(elementId, onSelect, onClearSelection) {
    this.elementId = elementId;
    this.onSelect = onSelect;
    this.onClearSelection = onClearSelection;
    this.map = null;
    this.layer = null;
    this.results = [];
    this.resultIndex = new Map();
    this.selectedKey = null;
    this.metricId = 'global';
    this.mode = 'institutionalization';
    this.actorCounts = new Map();
    this.actorDomain = { min: 0, max: 0 };
    this.actorFilterLabel = '';
    this.schoolsData = null;
    this.schoolsLayer = null;
    this.schoolsActive = false;
    this.colorSchoolsBy = 'gestion';
    this.gestionFilters = {};
    this.ambitoFilters = {};
    this.schoolsPanel = null;
    this.featureLayers = new Map();
  }

  async init(results) {
    this.results = results;
    this.resultIndex = indexResultsByProvince(results);

    this.map = L.map(this.elementId, {
      zoomControl: false,
      scrollWheelZoom: true,
      dragging: true,
      attributionControl: true
    });

    L.tileLayer('https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png', {
      attribution: '© <a href="https://www.ign.gob.ar/">IGN Argentina</a>',
      tms: true,
      maxZoom: 18
    }).addTo(this.map);

    this.map.on('click', () => {
      if (this.selectedKey && this.onClearSelection) this.onClearSelection();
    });

    const response = await fetch('assets/Argentina.geojson');
    if (!response.ok) throw new Error(`No se pudo cargar la geometría territorial (HTTP ${response.status}).`);
    const geojson = await response.json();

    this.layer = L.geoJSON(geojson, {
      style: feature => {
        const key = provinceId(feature);
        return this.styleForFeature(feature);
      },
      onEachFeature: (feature, layer) => {
        const key = provinceId(feature);
        const result = this.resultIndex.get(key);
        this.featureLayers.set(key, layer);
        layer.bindTooltip(provinceName(feature), {
          permanent: false,
          direction: 'center',
          className: 'map-tooltip'
        });

        if (result) {
          layer.on('click', event => {
            L.DomEvent.stopPropagation(event);
            this.onSelect(key);
          });
          layer.on('mouseover', () => {
            if (key !== this.selectedKey) layer.setStyle({ fillOpacity: 0.82, weight: 2 });
          });
          layer.on('mouseout', () => this.refreshStyles());
        }
      }
    }).addTo(this.map);

    this.map.setView([-40, -63], 4);
    this.map.setMaxBounds([[-60, -80], [-20, -50]]);
    this.map.setMinZoom(4);
    this.map.setMaxZoom(10);
  }

  setMetric(metricId) {
    this.metricId = metricId || 'global';
    if (this.mode === 'institutionalization') this.refreshStyles();
  }

  setInstitutionalizationMode(metricId = this.metricId) {
    this.mode = 'institutionalization';
    this.metricId = metricId || 'global';
    this.actorFilterLabel = '';
    this.refreshStyles();
  }

  setActorsMode(counts, filterLabel = '') {
    this.mode = 'actors';
    this.actorCounts = counts instanceof Map ? counts : new Map(Object.entries(counts || {}).map(([key, value]) => [Number(key), value]));
    this.actorFilterLabel = filterLabel;
    const positive = [...this.actorCounts.values()].filter(value => value > 0);
    this.actorDomain = positive.length
      ? { min: Math.min(...positive), max: Math.max(...positive) }
      : { min: 0, max: 0 };
    this.refreshStyles();
    return this.actorDomain;
  }

  actorColor(count) {
    if (!count) return ACTOR_COLORS.empty;
    const { min, max } = this.actorDomain;
    const ratio = max === min ? 0.7 : (count - min) / (max - min);
    return interpolateColor(ACTOR_COLORS.light, ACTOR_COLORS.dark, Math.max(0, Math.min(1, ratio)));
  }

  styleForFeature(feature) {
    const key = provinceId(feature);
    const isSelected = key === this.selectedKey;
    if (this.mode !== 'actors') return featureStyle(this.resultIndex.get(key), isSelected, this.metricId);
    const count = this.actorCounts.get(key) || 0;
    const fillColor = this.actorColor(count);
    return {
      fillColor,
      fillOpacity: count ? (isSelected ? 0.9 : 0.72) : 0.22,
      color: isSelected ? '#0A2340' : (count ? fillColor : 'rgba(10,35,64,.22)'),
      weight: isSelected ? 2.5 : 1.2
    };
  }

  tooltipForFeature(feature) {
    const name = provinceName(feature);
    if (this.mode !== 'actors') return name;
    const count = this.actorCounts.get(provinceId(feature)) || 0;
    const filter = this.actorFilterLabel ? `<span>${this.actorFilterLabel}</span>` : '<span>Todos los ámbitos</span>';
    return `<div class="actor-map-tooltip"><strong>${name}</strong><b>${count} instituciones/actores</b>${filter}</div>`;
  }

  select(key) {
    this.selectedKey = Number(key);
    this.refreshStyles();
    this.zoomToSelected();
    if (this.schoolsActive) {
      this.renderSchoolsLayer();
      this.renderSchoolsPanel();
    }
  }

  clearSelection() {
    this.selectedKey = null;
    this.refreshStyles();
    if (this.map) this.map.setView([-40, -63], 4, { animate: true });
    if (this.schoolsActive) {
      this.renderSchoolsLayer();
      this.renderSchoolsPanel();
    }
  }

  refreshStyles() {
    if (!this.layer) return;
    this.layer.eachLayer(layer => {
      layer.setStyle(this.styleForFeature(layer.feature));
      layer.setTooltipContent(this.tooltipForFeature(layer.feature));
    });
  }

  zoomToSelected() {
    if (!this.map || !this.selectedKey) return;
    const layer = this.featureLayers.get(this.selectedKey);
    if (!layer) return;
    this.map.fitBounds(layer.getBounds(), {
      padding: [28, 28],
      maxZoom: 6,
      animate: true
    });
  }

  async toggleSchools() {
    this.schoolsActive = !this.schoolsActive;
    if (this.schoolsActive) {
      await this.ensureSchoolsData();
      this.renderSchoolsLayer();
      this.renderSchoolsPanel();
    } else {
      if (this.schoolsLayer) this.map.removeLayer(this.schoolsLayer);
      this.closeSchoolsPanel();
    }
    return this.schoolsActive;
  }

  async ensureSchoolsData() {
    if (this.schoolsData) return;
    const response = await fetch('assets/escuelas.geojson');
    if (!response.ok) throw new Error(`No se pudo cargar la capa de escuelas (HTTP ${response.status}).`);
    this.schoolsData = await response.json();

    Object.keys(GESTION_CONFIG).forEach(key => { this.gestionFilters[key] = true; });
    Object.keys(AMBITO_CONFIG).forEach(key => { this.ambitoFilters[key] = true; });

    this.schoolsData.features.forEach(feature => {
      const gestion = feature.properties.ges || '';
      const ambito = feature.properties.amg || '';
      if (gestion) this.gestionFilters[gestion] = true;
      if (ambito) this.ambitoFilters[ambito] = true;
    });
  }

  schoolsForSelectedProvince() {
    if (!this.schoolsData || !this.selectedKey) return this.schoolsData;
    const prefix = String(this.selectedKey).padStart(2, '0');
    return {
      type: 'FeatureCollection',
      features: this.schoolsData.features.filter(feature => String(feature.properties.cue || '').slice(0, 2) === prefix)
    };
  }

  renderSchoolsLayer() {
    if (!this.map || !this.schoolsData) return;
    if (this.schoolsLayer) this.map.removeLayer(this.schoolsLayer);

    const data = this.schoolsForSelectedProvince();
    this.schoolsLayer = L.geoJSON(data, {
      filter: feature => {
        const gestion = feature.properties.ges || '';
        const ambito = feature.properties.amg || '';
        return this.gestionFilters[gestion] !== false && this.ambitoFilters[ambito] !== false;
      },
      pointToLayer: (feature, latlng) => {
        const gestion = feature.properties.ges || '';
        const ambito = feature.properties.amg || '';
        const color = this.colorSchoolsBy === 'gestion'
          ? (GESTION_CONFIG[gestion] || {}).color || '#999'
          : (AMBITO_CONFIG[ambito] || {}).color || '#999';

        return L.circleMarker(latlng, {
          radius: 2.6,
          fillColor: color,
          color: '#fff',
          weight: 0.5,
          fillOpacity: 0.88
        });
      },
      onEachFeature: (feature, layer) => {
        const props = feature.properties;
        const nombre = props.fna || 'Escuela';
        const gestion = props.ges || '';
        const ambito = props.amg || '';
        const nivel = props.nen ? props.nen.replace(/;\s*$/, '').replace(/;/g, ' ·') : '';

        layer.bindTooltip(`
          <div class="school-tooltip">
            <strong>${nombre}</strong>
            <span>${gestion}${ambito ? ` · ${ambito}` : ''}</span>
            ${nivel ? `<em>${nivel}</em>` : ''}
          </div>
        `, { className: 'school-tooltip-wrap', sticky: true });
      }
    }).addTo(this.map);
  }

  renderSchoolsPanel() {
    const mapElement = document.getElementById(this.elementId);
    if (!mapElement) return;
    if (!this.schoolsPanel) {
      this.schoolsPanel = document.createElement('div');
      this.schoolsPanel.className = 'schools-panel';
      mapElement.appendChild(this.schoolsPanel);
    }

    const data = this.schoolsForSelectedProvince();
    const gestionCounts = {};
    const ambitoCounts = {};
    data.features.forEach(feature => {
      const gestion = feature.properties.ges || 'Sin dato';
      const ambito = feature.properties.amg || 'Sin dato';
      gestionCounts[gestion] = (gestionCounts[gestion] || 0) + 1;
      ambitoCounts[ambito] = (ambitoCounts[ambito] || 0) + 1;
    });

    this.schoolsPanel.innerHTML = `
      <div class="schools-panel-head">
        <div>
          <strong>Escuelas ETP</strong>
          <span>${this.selectedKey ? 'Provincia seleccionada' : 'Todo el país'}</span>
        </div>
        <button type="button" data-close>×</button>
      </div>
      <div class="schools-panel-body">
        <span class="panel-label">Colorear por</span>
        <div class="segmented">
          <button type="button" data-color="gestion" class="${this.colorSchoolsBy === 'gestion' ? 'active' : ''}">Gestión</button>
          <button type="button" data-color="ambito" class="${this.colorSchoolsBy === 'ambito' ? 'active' : ''}">Ámbito</button>
        </div>
        <span class="panel-label">Sector de gestión</span>
        ${this.filterRows('gestion', GESTION_CONFIG, gestionCounts)}
        <span class="panel-label">Ámbito</span>
        ${this.filterRows('ambito', AMBITO_CONFIG, ambitoCounts)}
      </div>
    `;

    this.schoolsPanel.querySelector('[data-close]').addEventListener('click', () => {
      this.schoolsActive = false;
      if (this.schoolsLayer) this.map.removeLayer(this.schoolsLayer);
      this.closeSchoolsPanel();
      document.getElementById('schoolsLayerBtn')?.classList.remove('active');
    });

    this.schoolsPanel.querySelectorAll('[data-color]').forEach(button => {
      button.addEventListener('click', () => {
        this.colorSchoolsBy = button.dataset.color;
        this.renderSchoolsLayer();
        this.renderSchoolsPanel();
      });
    });

    this.schoolsPanel.querySelectorAll('[data-filter]').forEach(input => {
      input.addEventListener('change', () => {
        const target = input.dataset.filter === 'gestion' ? this.gestionFilters : this.ambitoFilters;
        target[input.dataset.key] = input.checked;
        this.renderSchoolsLayer();
        this.renderSchoolsPanel();
      });
    });
  }

  filterRows(type, config, counts) {
    const filters = type === 'gestion' ? this.gestionFilters : this.ambitoFilters;
    return Object.entries(config).map(([key, cfg]) => `
      <label class="filter-row">
        <input type="checkbox" data-filter="${type}" data-key="${key}" ${filters[key] !== false ? 'checked' : ''}>
        <i style="background:${cfg.color}"></i>
        <span>${key}</span>
        <b>${counts[key] || 0}</b>
      </label>
    `).join('');
  }

  disableSchools() {
    this.schoolsActive = false;
    if (this.schoolsLayer && this.map) this.map.removeLayer(this.schoolsLayer);
    this.closeSchoolsPanel();
    document.getElementById('schoolsLayerBtn')?.classList.remove('active');
  }

  closeSchoolsPanel() {
    if (this.schoolsPanel) this.schoolsPanel.remove();
    this.schoolsPanel = null;
  }
}









