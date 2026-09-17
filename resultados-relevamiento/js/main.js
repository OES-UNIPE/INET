const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);
const DATA_URL = LOCAL_HOSTS.has(window.location.hostname)
  ? "assets/data/respuestas-internas.json"
  : "assets/data/respuestas-publicas.json";
const PROVINCES_URL = "../practicas-profesionalizantes/assets/Argentina.geojson";
const NATIONAL_VIEW = { center: [-39.5, -64], zoom: 4 };
const TIERRA_DEL_FUEGO_BOUNDS = [[-55.2, -68.9], [-52.8, -65.3]];

const state = {
  data: null,
  map: null,
  provinceLayer: null,
  pointLayer: null,
  jurisdictionId: null,
  schoolId: null,
  weightMode: "weighted",
};

const el = {
  status: document.getElementById("status"),
  privacy: document.getElementById("privacyText"),
  updatedAt: document.getElementById("updatedAt"),
  metrics: document.getElementById("metrics"),
  filter: document.getElementById("jurisdictionFilter"),
  clearFilter: document.getElementById("clearFilter"),
  mapLegend: document.getElementById("mapLegend"),
  activeTerritory: document.getElementById("activeTerritory"),
  coverageBody: document.getElementById("coverageBody"),
  questionGrid: document.getElementById("questionGrid"),
  responsesTitle: document.getElementById("responsesTitle"),
  responsesContext: document.getElementById("responsesContext"),
  weightModeButtons: Array.from(document.querySelectorAll("[data-weight-mode]")),
  clearSchool: document.getElementById("clearSchool"),
  methodBtn: document.getElementById("methodBtn"),
  methodModal: document.getElementById("methodModal"),
  methodClose: document.getElementById("methodClose"),
};

const intFormat = new Intl.NumberFormat("es-AR");
const decimalFormat = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pctFormat = new Intl.NumberFormat("es-AR", { style: "percent", maximumFractionDigits: 1 });

function html(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function provinceId(feature) {
  const value = feature?.properties?.IN1 ?? "";
  const digits = String(value).replace(/\D/g, "");
  return digits ? digits.padStart(2, "0") : "";
}

function jurisdictionRow(id) {
  return state.data.jurisdictions.find((row) => row.id === id) || null;
}

function filteredResponses() {
  return state.data.responses.filter((row) => !state.jurisdictionId || row.jurisdictionId === state.jurisdictionId);
}

function coverageColor(value) {
  if (value == null) return "#DCE3E8";
  if (value >= 1) return "#176B52";
  if (value >= 0.75) return "#55A177";
  if (value >= 0.5) return "#AFC66D";
  if (value >= 0.25) return "#E2B65B";
  return "#D77A55";
}

function provinceStyle(feature) {
  const id = provinceId(feature);
  const row = jurisdictionRow(id);
  const selected = state.jurisdictionId === id;
  return {
    color: selected ? "#0A2340" : "#FFFFFF",
    weight: selected ? 3 : 1,
    fillColor: coverageColor(row?.coverage),
    fillOpacity: selected ? 0.82 : 0.67,
  };
}

function initMap(provinces) {
  state.map = L.map("map", { zoomControl: true, minZoom: 3 }).setView(NATIONAL_VIEW.center, NATIONAL_VIEW.zoom);
  state.map.zoomControl.setPosition("bottomleft");
  L.tileLayer("https://wms.ign.gob.ar/geoserver/gwc/service/tms/1.0.0/capabaseargenmap@EPSG%3A3857@png/{z}/{x}/{-y}.png", {
    maxZoom: 18,
    attribution: '&copy; <a href="https://www.ign.gob.ar/AreaServicios/Argenmap/Introduccion" target="_blank" rel="noopener">Instituto Geográfico Nacional</a>',
  }).addTo(state.map);

  state.provinceLayer = L.geoJSON(provinces, {
    style: provinceStyle,
    onEachFeature(feature, layer) {
      const id = provinceId(feature);
      const row = jurisdictionRow(id);
      const label = row
        ? `<strong>${html(row.name)}</strong><br>Sin ponderar: ${pctFormat.format(row.coverage || 0)}<br>Ponderada: ${pctFormat.format(row.weightedCoverage || 0)}<br>${intFormat.format(row.respondentSchools)} respuestas de ${intFormat.format(row.target)} posiciones`
        : "Sin datos";
      layer.bindTooltip(label, { sticky: true });
      layer.on("click", () => setJurisdiction(state.jurisdictionId === id ? null : id, true));
    },
  }).addTo(state.map);

  state.pointLayer = L.layerGroup().addTo(state.map);
  renderPoints();
  renderLegend();
}

function renderPoints() {
  if (!state.pointLayer) return;
  state.pointLayer.clearLayers();
  filteredResponses().forEach((record) => {
    if (!Array.isArray(record.coordinates)) return;
    const selected = state.schoolId === record.id;
    const marker = L.circleMarker([record.coordinates[1], record.coordinates[0]], {
      radius: selected ? 7 : 4.5,
      color: selected ? "#0A2340" : "#FFFFFF",
      weight: selected ? 3 : 1.5,
      fillColor: record.caseType === "complementaria" ? "#C8A84B" : "#00A8CC",
      fillOpacity: 0.9,
    });
    const schoolName = record.schoolName || "Escuela con respuesta";
    const responseType = record.caseType === "complementaria" ? "Respuesta complementaria" : "Escuela con respuesta";
    marker.bindTooltip(`<strong>${html(schoolName)}</strong><br>${responseType}`, { sticky: true });
    marker.on("click", () => setSchool(record.id));
    marker.addTo(state.pointLayer);
  });
}

function renderLegend() {
  const entries = [
    ["#D77A55", "Menos de 25%"],
    ["#E2B65B", "25% a 49,9%"],
    ["#AFC66D", "50% a 74,9%"],
    ["#55A177", "75% a 99,9%"],
    ["#176B52", "100%"],
  ];
  el.mapLegend.innerHTML = `<strong>Cobertura de la muestra</strong>${entries.map(([color, label]) => `<div class="legend-row"><span class="legend-swatch" style="background:${color}"></span>${label}</div>`).join("")}<div class="legend-row"><span class="legend-dot"></span>Escuela con respuesta</div>`;
}

function refreshMap() {
  state.provinceLayer?.setStyle(provinceStyle);
  renderPoints();
}

function resetNationalView() {
  state.map?.setView(NATIONAL_VIEW.center, NATIONAL_VIEW.zoom, { animate: true });
}

function setJurisdiction(id, fit = false) {
  state.jurisdictionId = id || null;
  state.schoolId = null;
  el.filter.value = state.jurisdictionId || "";
  if (fit && state.jurisdictionId && state.provinceLayer) {
    if (state.jurisdictionId === "94") {
      state.map.fitBounds(TIERRA_DEL_FUEGO_BOUNDS, { padding: [24, 24], maxZoom: 7 });
    } else {
      const layers = state.provinceLayer.getLayers().filter((layer) => provinceId(layer.feature) === state.jurisdictionId);
      if (layers[0]) state.map.fitBounds(layers[0].getBounds(), { padding: [24, 24], maxZoom: 7 });
    }
  } else if (!state.jurisdictionId && fit) {
    resetNationalView();
  }
  renderAll();
}

function setSchool(id) {
  const record = state.data.responses.find((row) => row.id === id);
  if (!record) return;
  state.schoolId = state.schoolId === id ? null : id;
  if (state.schoolId && !state.jurisdictionId) {
    state.jurisdictionId = record.jurisdictionId;
    el.filter.value = record.jurisdictionId;
  }
  renderAll();
  document.querySelector(".responses-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function metric(label, value, detail) {
  return `<article class="metric-card"><span>${html(label)}</span><strong>${html(value)}</strong><small>${html(detail)}</small></article>`;
}

function renderMetrics() {
  const meta = state.data.metadata;
  const row = state.jurisdictionId ? jurisdictionRow(state.jurisdictionId) : null;
  const universe = row?.universe ?? meta.universe;
  const target = row?.target ?? meta.sampleTarget;
  const respondents = row?.respondentSchools ?? meta.respondentSchools;
  const coverage = row?.coverage ?? meta.coverage;
  const weightedCoverage = row?.weightedCoverage ?? meta.weightedCoverage;
  el.metrics.innerHTML = [
    metric("Universo", intFormat.format(universe), row ? row.name : "Escuelas elegibles"),
    metric("Muestra proyectada", intFormat.format(target), pctFormat.format(target / universe)),
    metric("Escuelas con respuesta", intFormat.format(respondents), `${intFormat.format(target - respondents)} posiciones sin respuesta`),
    metric("Cobertura sin ponderar", pctFormat.format(coverage || 0), `Cobertura ponderada: ${pctFormat.format(weightedCoverage || 0)}`),
  ].join("");
}

function renderCoverageTable() {
  el.coverageBody.innerHTML = state.data.jurisdictions.map((row) => `
    <tr data-jurisdiction="${row.id}" class="${state.jurisdictionId === row.id ? "selected" : ""}" tabindex="0">
      <td>${html(row.name)}</td>
      <td>${intFormat.format(row.target)}</td>
      <td>${intFormat.format(row.respondentSchools)}</td>
      <td>${intFormat.format(row.nonResponse)}</td>
      <td>${pctFormat.format(row.coverage || 0)}</td>
      <td>${pctFormat.format(row.weightedCoverage || 0)}</td>
      <td>${decimalFormat.format(row.weightedBase || 0)}</td>
    </tr>`).join("");
}

function responseDistribution(records, questionId) {
  const counts = new Map();
  let rawBase = 0;
  let weightedBase = 0;
  records.forEach((record) => {
    const value = String(record.answers?.[questionId] || "").trim();
    if (!value) return;
    const weight = state.weightMode === "weighted" ? Number(record.weight) || 0 : 1;
    counts.set(value, (counts.get(value) || 0) + weight);
    rawBase += 1;
    weightedBase += Number(record.weight) || 0;
  });
  return {
    items: Array.from(counts, ([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value || a.label.localeCompare(b.label, "es")),
    base: state.weightMode === "weighted" ? weightedBase : rawBase,
    rawBase,
    weightedBase,
  };
}

function renderQuestions() {
  const records = filteredResponses();
  const selected = state.schoolId ? state.data.responses.find((row) => row.id === state.schoolId) : null;
  const territory = state.jurisdictionId ? jurisdictionRow(state.jurisdictionId)?.name : "todo el país";
  const modeLabel = state.weightMode === "weighted" ? "ponderadas" : "sin ponderar";
  el.responsesTitle.textContent = selected ? "Respuesta de la escuela seleccionada" : "Distribución de respuestas";
  el.responsesContext.textContent = selected
    ? `${selected.schoolName || "Escuela seleccionada"}. Se muestran sus respuestas y las distribuciones ${modeLabel} de referencia en ${territory}.`
    : `Distribuciones ${modeLabel} calculadas sobre las respuestas válidas de ${intFormat.format(records.length)} escuelas en ${territory}.`;
  el.clearSchool.hidden = !selected;
  el.questionGrid.innerHTML = state.data.questions.map((question) => {
    const distribution = responseDistribution(records, question.id);
    const base = distribution.base;
    const selectedAnswer = selected?.answers?.[question.id] || "Sin respuesta";
    return `<article class="question-card">
      <h3>${html(question.title)}</h3>
      ${selected ? `<div class="answer-selected"><span>Respuesta seleccionada</span>${html(selectedAnswer)}</div>` : ""}
      <div class="bar-list">${distribution.items.map((item) => `
        <div>
          <div class="bar-label"><span>${html(item.label)}</span><strong>${pctFormat.format(base ? item.value / base : 0)}</strong></div>
          <div class="bar-track"><div class="bar-fill" style="width:${base ? (item.value / base) * 100 : 0}%"></div></div>
        </div>`).join("")}</div>
      <p class="question-base">${state.weightMode === "weighted"
        ? `Base ponderada: ${decimalFormat.format(distribution.weightedBase)} escuelas representadas · ${intFormat.format(distribution.rawBase)} respuestas válidas`
        : `Base: ${intFormat.format(distribution.rawBase)} respuestas válidas`}</p>
    </article>`;
  }).join("");
}

function renderAll() {
  const row = state.jurisdictionId ? jurisdictionRow(state.jurisdictionId) : null;
  el.activeTerritory.textContent = row?.name || "Todo el país";
  renderMetrics();
  renderCoverageTable();
  renderQuestions();
  refreshMap();
}

function bindEvents() {
  el.filter.addEventListener("change", () => setJurisdiction(el.filter.value || null, true));
  el.clearFilter.addEventListener("click", () => setJurisdiction(null, true));
  el.clearSchool.addEventListener("click", () => { state.schoolId = null; renderAll(); });
  el.weightModeButtons.forEach((button) => button.addEventListener("click", () => {
    state.weightMode = button.dataset.weightMode;
    el.weightModeButtons.forEach((item) => item.setAttribute("aria-pressed", String(item.dataset.weightMode === state.weightMode)));
    renderQuestions();
  }));
  el.coverageBody.addEventListener("click", (event) => {
    const row = event.target.closest("tr[data-jurisdiction]");
    if (row) setJurisdiction(state.jurisdictionId === row.dataset.jurisdiction ? null : row.dataset.jurisdiction, true);
  });
  el.coverageBody.addEventListener("keydown", (event) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    const row = event.target.closest("tr[data-jurisdiction]");
    if (row) { event.preventDefault(); setJurisdiction(row.dataset.jurisdiction, true); }
  });
  el.methodBtn.addEventListener("click", () => el.methodModal.classList.add("open"));
  el.methodClose.addEventListener("click", () => el.methodModal.classList.remove("open"));
  el.methodModal.addEventListener("click", (event) => { if (event.target === el.methodModal) el.methodModal.classList.remove("open"); });
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") el.methodModal.classList.remove("open"); });
}

async function init() {
  bindEvents();
  try {
    const [dataResponse, provincesResponse] = await Promise.all([fetch(DATA_URL), fetch(PROVINCES_URL)]);
    if (!dataResponse.ok) throw new Error(`No se pudieron cargar los datos (${dataResponse.status}).`);
    if (!provincesResponse.ok) throw new Error(`No se pudo cargar el mapa (${provincesResponse.status}).`);
    state.data = await dataResponse.json();
    const provinces = await provincesResponse.json();
    const internalMode = state.data.metadata.access === "internal";
    el.privacy.textContent = internalMode
      ? "Esta versión de uso interno muestra el nombre institucional asociado a cada punto. No expone CUE, matrícula, archivos adjuntos ni comentarios abiertos."
      : "La versión pública no muestra nombres de escuelas, CUE, matrícula, archivos adjuntos ni comentarios abiertos. Los puntos conservan la localización exacta autorizada.";
    state.data.jurisdictions.forEach((row) => {
      const option = document.createElement("option");
      option.value = row.id;
      option.textContent = row.name;
      el.filter.append(option);
    });
    el.updatedAt.textContent = `Datos procesados: ${new Date(state.data.metadata.generatedAt).toLocaleString("es-AR")}`;
    initMap(provinces);
    renderAll();
    el.status.classList.remove("show");
  } catch (error) {
    console.error(error);
    el.status.textContent = error.message;
    el.status.classList.add("show", "error");
  }
}

init();
