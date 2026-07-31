import { fmtInt } from "../utils/format.js";

const HEAT = ["#edf2f7", "#b9d8e8", "#6fb3cf", "#2583a7", "#0f4d73"];
const BORDER = "#ffffff";
const ACTIVE = "#d4a017";

function htmlAttr(value) {
  return String(value ?? "").replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

export class MapView {
  constructor({ mapId, legendId, groupSelect, jurisdictionSelect, onDepartmentSelected = null, onSchoolSelected = null }) {
    this.mapElement = document.getElementById(mapId);
    this.map = L.map(mapId, {
      preferCanvas: true,
      zoomControl: true,
      scrollWheelZoom: true,
    }).setView([-38.5, -63.5], 4);

    L.tileLayer("https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png", {
      maxZoom: 18,
      attribution: '<a href="https://www.ign.gob.ar/AreaServicios/Argenmap/Introduccion" target="_blank">Instituto Geográfico Nacional</a> + <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>',
    }).addTo(this.map);

    this.legend = document.getElementById(legendId);
    this.groupSelect = groupSelect;
    this.jurisdictionSelect = jurisdictionSelect;
    this.onDepartmentSelected = onDepartmentSelected;
    this.onSchoolSelected = onSchoolSelected;
    this.institutions = [];
    this.departmentsByCode = new Map();
    this.totalByDepartment = new Map();
    this.selectedByDepartment = new Map();
    this.filters = { jurisdiccion: null, codigoDepartamento: null, departamento: null, escuelaId: null, optionId: null };
    this.jurisdictionFilter = "";
    this.groupBy = "heat";
    this.optionRows = [];
    this.optionLabel = "";
    this.option = null;
    this.optionPanel = null;
    this.panelCollapsed = false;
    this.panelPosition = null;
    this.dragState = null;
    this.departmentLayer = null;
  }

  setDepartments(departments, topology) {
    this.departmentsByCode = departments.byCode;
    const object = topology.objects["03_Departamentos"] || topology.objects[Object.keys(topology.objects)[0]];
    const geojson = topojson.feature(topology, object);
    this.departmentLayer = L.geoJSON(geojson, {
      style: (feature) => this.styleFeature(feature),
      onEachFeature: (feature, layer) => {
        layer.bindPopup(() => this.popupHtml(feature));
        layer.on("click", () => {
          const code = this.featureCode(feature);
          const dept = this.featureDepartment(feature);
          this.onDepartmentSelected?.({
            codigoDepartamento: code,
            departamento: dept?.departamento || null,
            jurisdiccion: dept?.jurisdiccion || null,
          }, "map");
        });
      },
    }).addTo(this.map);
    this.renderLegend();
  }

  setInstitutions(institutions) {
    this.institutions = institutions;
    this.totalByDepartment = this.countByDepartment(institutions);
    this.populateJurisdictionFilter();
    this.updateStyles();
    this.fitVisible();
  }

  setGroupBy(groupBy) {
    this.groupBy = groupBy;
    if (this.groupSelect && this.groupSelect.value !== groupBy) this.groupSelect.value = groupBy;
    this.updateStyles();
  }

  setFilters(filters = {}, source = "") {
    this.filters = { ...this.filters, ...filters };
    this.jurisdictionFilter = this.filters.jurisdiccion || "";
    if (this.jurisdictionSelect && this.jurisdictionSelect.value !== this.jurisdictionFilter) {
      this.jurisdictionSelect.value = this.jurisdictionFilter;
    }
    this.updateStyles();
    this.renderOptionPanel();
    if (source !== "render") this.fitVisible();
  }

  setJurisdictionFilter(jurisdiction) {
    this.setFilters({ jurisdiccion: jurisdiction || null, codigoDepartamento: null, departamento: null, escuelaId: null }, "jurisdiction-select");
  }

  populateJurisdictionFilter() {
    if (!this.jurisdictionSelect) return;
    const jurisdictions = [...new Set(this.institutions.map((item) => item.jurisdiccion))]
      .sort((a, b) => a.localeCompare(b, "es"));
    this.jurisdictionSelect.innerHTML = `<option value="">Todas</option>${jurisdictions
      .map((jurisdiction) => `<option value="${htmlAttr(jurisdiction)}">${jurisdiction}</option>`)
      .join("")}`;
  }

  showOption(optionOrRows, label = "") {
    this.option = Array.isArray(optionOrRows) ? null : optionOrRows;
    const rows = Array.isArray(optionOrRows) ? optionOrRows : optionOrRows.sample;
    this.optionRows = [...rows].sort((a, b) => a.jurisdiccion.localeCompare(b.jurisdiccion, "es") || a.departamento.localeCompare(b.departamento, "es") || a.nombre.localeCompare(b.nombre, "es"));
    this.optionLabel = label || optionOrRows.label || "Opción seleccionada";
    this.selectedByDepartment = this.countByDepartment(this.optionRows);
    this.panelCollapsed = false;
    this.updateStyles();
    this.renderOptionPanel();
    this.fitVisible();
  }

  clearOption() {
    this.option = null;
    this.optionRows = [];
    this.optionLabel = "";
    this.selectedByDepartment = new Map();
    this.removeOptionPanel();
    this.updateStyles();
    this.fitVisible();
  }

  clearSelection() {
    this.clearOption();
  }

  invalidateSize() {
    this.map.invalidateSize();
  }

  countByDepartment(rows) {
    return rows.reduce((acc, item) => {
      if (!item.codigo_departamento) return acc;
      acc.set(item.codigo_departamento, (acc.get(item.codigo_departamento) || 0) + 1);
      return acc;
    }, new Map());
  }

  featureCode(feature) {
    return String(feature.properties?.CODDPTO || "").padStart(5, "0");
  }

  featureDepartment(feature) {
    return this.departmentsByCode.get(this.featureCode(feature));
  }

  maxSelected() {
    return Math.max(0, ...this.selectedByDepartment.values());
  }

  heatColor(count) {
    if (!count) return HEAT[0];
    const max = this.maxSelected();
    if (max <= 1) return HEAT[2];
    const index = Math.min(HEAT.length - 1, Math.max(1, Math.ceil((count / max) * (HEAT.length - 1))));
    return HEAT[index];
  }

  isVisibleFeature(feature) {
    if (!this.jurisdictionFilter) return true;
    const dept = this.featureDepartment(feature);
    return dept?.jurisdiccion === this.jurisdictionFilter;
  }

  styleFeature(feature) {
    const code = this.featureCode(feature);
    const count = this.selectedByDepartment.get(code) || 0;
    const visible = this.isVisibleFeature(feature);
    const active = this.filters.codigoDepartamento === code;
    return {
      color: active ? ACTIVE : BORDER,
      weight: active ? 2.5 : (count ? 1.2 : 0.7),
      opacity: visible ? 0.95 : 0,
      fillColor: active ? ACTIVE : this.heatColor(count),
      fillOpacity: visible ? (active ? 0.9 : (count ? 0.86 : 0.42)) : 0,
      interactive: visible,
    };
  }

  updateStyles() {
    this.departmentLayer?.eachLayer((layer) => {
      layer.setStyle(this.styleFeature(layer.feature));
    });
    this.renderLegend();
  }

  fitVisible() {
    if (!this.departmentLayer) return;
    const activeCode = this.filters.codigoDepartamento;
    const layers = [];
    this.departmentLayer.eachLayer((layer) => {
      if (activeCode && this.featureCode(layer.feature) === activeCode) layers.push(layer);
    });
    if (!layers.length) {
      this.departmentLayer.eachLayer((layer) => {
        if (this.isVisibleFeature(layer.feature)) layers.push(layer);
      });
    }
    if (layers.length) this.map.fitBounds(L.featureGroup(layers).getBounds().pad(0.08));
  }

  renderLegend() {
    const max = this.maxSelected();
    const entries = [
      { label: "Sin seleccionadas", color: HEAT[0] },
      { label: max ? "Menor concentración" : "Con muestra activa", color: HEAT[2] },
      { label: max ? `Mayor concentración (${fmtInt.format(max)})` : "Mayor concentración", color: HEAT[4] },
    ];
    if (this.filters.codigoDepartamento) entries.unshift({ label: this.filters.departamento || this.filters.codigoDepartamento, color: ACTIVE });
    else if (this.jurisdictionFilter) entries.unshift({ label: this.jurisdictionFilter, color: "#073b4c" });
    this.legend.innerHTML = entries
      .map((entry) => `<span><i class="dot" style="background:${entry.color};border-color:${entry.color}"></i>${entry.label}</span>`)
      .join("");
  }

  matchesFilters(item) {
    if (this.filters.jurisdiccion && item.jurisdiccion !== this.filters.jurisdiccion) return false;
    if (this.filters.codigoDepartamento && item.codigo_departamento !== this.filters.codigoDepartamento) return false;
    if (this.filters.escuelaId && item.id !== this.filters.escuelaId) return false;
    return true;
  }

  renderOptionPanel() {
    if (!this.optionRows.length) return;
    const panelRows = this.optionRows.filter((item) => this.matchesFilters(item));
    if (!this.optionPanel) {
      this.optionPanel = document.createElement("div");
      this.optionPanel.className = "schools-panel sample-panel";
      document.body.appendChild(this.optionPanel);
      this.ensurePanelPosition();
    }

    const label = [this.filters.jurisdiccion, this.filters.departamento, this.filters.escuelaId ? "escuela seleccionada" : ""].filter(Boolean).join(" / ");
    this.optionPanel.innerHTML = `
      <div class="schools-panel-head">
        <div>
          <strong>${this.optionLabel}</strong>
          <span>${fmtInt.format(panelRows.length)} de ${fmtInt.format(this.optionRows.length)} instituciones seleccionadas</span>
        </div>
        <div class="sample-panel-actions">
          <button type="button" data-minimize aria-label="Minimizar">${this.panelCollapsed ? "+" : "−"}</button>
          <button type="button" data-close aria-label="Ocultar">×</button>
        </div>
      </div>
      <div class="schools-panel-body ${this.panelCollapsed ? "hidden" : ""}">
        <span class="panel-label">${label ? `Filtro: ${label}` : "Listado de escuelas seleccionadas"}</span>
        <div class="sample-table-wrap">
          <table class="sample-table">
            <thead><tr><th>Escuela</th><th>Jurisdicción</th><th>Departamento</th><th>Gestión</th><th>Orientación</th><th>Tipo</th><th>Matrícula</th><th>Reemplazo 1</th><th>Reemplazo 2</th></tr></thead>
            <tbody>
              ${panelRows.map((item) => {
                const replacements = this.option?.replacements?.get(item.id) || [];
                return `
                  <tr data-school-id="${htmlAttr(item.id)}" data-jurisdiccion="${htmlAttr(item.jurisdiccion)}" data-codigo-departamento="${htmlAttr(item.codigo_departamento)}" class="${this.filters.escuelaId === item.id ? "selected" : ""}">
                    <td>${item.nombre}</td>
                    <td>${item.jurisdiccion}</td>
                    <td>${item.departamento}</td>
                    <td>${item.gestion}</td>
                    <td>${item.orientacion}</td>
                    <td>${item.tipo_institucion}</td>
                    <td>${fmtInt.format(item.matricula_total)}</td>
                    <td>${replacements[0]?.nombre || ""}</td>
                    <td>${replacements[1]?.nombre || ""}</td>
                  </tr>
                `;
              }).join("") || `<tr><td colspan="9">No hay instituciones para el filtro activo.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    `;

    this.applyPanelPosition();
    this.bindPanelDrag();
    this.optionPanel.querySelector("[data-close]").addEventListener("click", () => this.hideOptionPanel());
    this.optionPanel.querySelector("[data-minimize]").addEventListener("click", () => {
      this.panelCollapsed = !this.panelCollapsed;
      this.renderOptionPanel();
    });
    this.optionPanel.onclick = (event) => {
      if (event.target.closest("button")) return;
      const row = event.target.closest("[data-school-id]");
      if (row) this.onSchoolSelected?.(row.dataset.schoolId, "panel");
    };
  }

  removeOptionPanel() {
    if (this.optionPanel) this.optionPanel.remove();
    this.optionPanel = null;
  }

  hideOptionPanel() {
    this.removeOptionPanel();
  }

  ensurePanelPosition() {
    if (this.panelPosition) return;
    const mapRect = this.mapElement.getBoundingClientRect();
    this.panelPosition = {
      left: Math.min(window.innerWidth - 700, mapRect.right + 16),
      top: Math.max(76, mapRect.top + 18),
    };
    if (this.panelPosition.left < 16) this.panelPosition.left = Math.max(16, window.innerWidth - 700);
  }

  applyPanelPosition() {
    if (!this.optionPanel || !this.panelPosition) return;
    this.optionPanel.style.left = `${this.panelPosition.left}px`;
    this.optionPanel.style.top = `${this.panelPosition.top}px`;
  }

  bindPanelDrag() {
    const head = this.optionPanel?.querySelector(".schools-panel-head");
    if (!head) return;
    head.addEventListener("pointerdown", (event) => {
      if (event.target.closest("button")) return;
      this.dragState = {
        startX: event.clientX,
        startY: event.clientY,
        left: this.panelPosition.left,
        top: this.panelPosition.top,
      };
      head.setPointerCapture(event.pointerId);
    });
    head.addEventListener("pointermove", (event) => {
      if (!this.dragState) return;
      const width = this.optionPanel.offsetWidth;
      const height = this.optionPanel.offsetHeight;
      this.panelPosition = {
        left: Math.max(8, Math.min(window.innerWidth - width - 8, this.dragState.left + event.clientX - this.dragState.startX)),
        top: Math.max(58, Math.min(window.innerHeight - height - 8, this.dragState.top + event.clientY - this.dragState.startY)),
      };
      this.applyPanelPosition();
    });
    head.addEventListener("pointerup", () => { this.dragState = null; });
    head.addEventListener("pointercancel", () => { this.dragState = null; });
  }

  popupHtml(feature) {
    const code = this.featureCode(feature);
    const dept = this.departmentsByCode.get(code);
    const selected = this.selectedByDepartment.get(code) || 0;
    const total = this.totalByDepartment.get(code) || 0;
    return `
      <strong>${dept?.departamento || "Departamento sin metadatos"}</strong><br>
      ${dept?.jurisdiccion || "Sin jurisdicción"}<br>
      Código: ${code}<br>
      Seleccionadas: ${fmtInt.format(selected)}<br>
      Total universo: ${fmtInt.format(total)}
    `;
  }
}
