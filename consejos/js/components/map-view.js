import { indexResultsByProvince, provinceKey, provinceName } from '../services/geo-service.js';
import { normalize } from '../utils/normalize.js';

const LEVEL_COLORS = {
  Consolidado: '#27AE60',
  Intermedio: '#C8A84B',
  Incipiente: '#C94A4A',
  SinDatos: '#D7E2EE'
};

const PROVINCE_ID = {
  'buenos aires': '6',
  caba: '2',
  catamarca: '10',
  cordoba: '14',
  corrientes: '18',
  chaco: '22',
  chubut: '26',
  'entre rios': '30',
  formosa: '34',
  jujuy: '38',
  'la pampa': '42',
  'la rioja': '46',
  mendoza: '50',
  misiones: '54',
  neuquen: '58',
  'rio negro': '62',
  salta: '66',
  'san juan': '70',
  'san luis': '74',
  'santa cruz': '78',
  'santa fe': '82',
  'santiago del estero': '86',
  tucuman: '90',
  'tierra del fuego': '94'
};

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

function featureStyle(result, isSelected) {
  if (isSelected) return selectedStyle();
  if (!result) {
    return {
      fillColor: LEVEL_COLORS.SinDatos,
      fillOpacity: 0.22,
      color: 'rgba(10,35,64,.22)',
      weight: 1
    };
  }

  return {
    fillColor: LEVEL_COLORS[result.level],
    fillOpacity: 0.62,
    color: LEVEL_COLORS[result.level],
    weight: 1.2
  };
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
    const geojson = await response.json();

    this.layer = L.geoJSON(geojson, {
      style: feature => {
        const key = provinceKey(feature);
        return featureStyle(this.resultIndex.get(key), key === this.selectedKey);
      },
      onEachFeature: (feature, layer) => {
        const key = provinceKey(feature);
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

  select(key) {
    this.selectedKey = normalize(key);
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
      const key = provinceKey(layer.feature);
      layer.setStyle(featureStyle(this.resultIndex.get(key), key === this.selectedKey));
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
    const provinceId = PROVINCE_ID[this.selectedKey];
    if (!provinceId) return this.schoolsData;
    const prefix = provinceId.padStart(2, '0');
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

  closeSchoolsPanel() {
    if (this.schoolsPanel) this.schoolsPanel.remove();
    this.schoolsPanel = null;
  }
}
