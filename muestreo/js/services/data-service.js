import { normalizeLookupText } from "../utils/format.js";

const LISTADO_URL = "assets/01_LISTADO.csv";
const DEPTOS_URL = "assets/02_Deptos_INDEC.csv";
const TOPO_URL = "assets/03_Departamentos.json";

const DEPARTMENT_ALIASES = new Map([
  [aliasKey("Buenos Aires", "Coronel Rosales"), "coronel de marina leonardo rosales"],
  [aliasKey("Buenos Aires", "San Nicolás de los Arroyos"), "san nicolas"],
  [aliasKey("Entre Ríos", "San José de Feliciano"), "feliciano"],
  [aliasKey("San Luis", "Juan Martín de Pueyrredón (Capital)"), "juan martin de pueyrredon"],
  [aliasKey("Chaco", "Mayor Jorge Luis Fontana"), "mayor luis j fontana"],
  [aliasKey("Chaco", "O´higgins"), "o higgins"],
  [aliasKey("Chaco", "Libertador General de San Martín"), "libertador general san martin"],
]);

function aliasKey(jurisdiction, department) {
  return `${normalizeJurisdiction(jurisdiction)}|${normalizeDepartment(department)}`;
}

function normalizeJurisdiction(value) {
  const normalized = normalizeLookupText(value)
    .replace(/^ciudad de buenos aires$/, "ciudad autonoma de buenos aires")
    .replace(/^caba$/, "ciudad autonoma de buenos aires")
    .replace(/^santa fe$/, "santa fe");
  if (normalized === "tierra del fuego") return "tierra del fuego antartida e islas del atlantico sur";
  return normalized;
}

function normalizeDepartment(value) {
  return normalizeLookupText(value)
    .replace(/\bnro\s*(?=\d)/g, "")
    .replace(/\bn\s*[º°]?\s*(?=\d)/g, "")
    .replace(/\bnueve de julio\b/g, "9 de julio")
    .replace(/\bveinticinco de mayo\b/g, "25 de mayo")
    .replace(/\bdoce de octubre\b/g, "12 de octubre")
    .replace(/\bdos de abril\b/g, "2 de abril")
    .replace(/\s+/g, " ")
    .trim();
}

function parseCsv(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(value);
      if (row.some((cell) => cell.trim() !== "")) rows.push(row);
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  row.push(value);
  if (row.some((cell) => cell.trim() !== "")) rows.push(row);
  if (!rows.length) return [];

  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((cells) => headers.reduce((acc, header, index) => {
    const cell = (cells[index] ?? "").trim();
    acc[header] = cell;
    acc[normalizeLookupText(header).replace(/\s+/g, "_")] = cell;
    return acc;
  }, {}));
}

function toNumber(value) {
  const clean = String(value ?? "").replace(/\./g, "").replace(",", ".").trim();
  const number = Number(clean);
  return Number.isFinite(number) ? number : 0;
}

function normalizeCode(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(5, "0") : "";
}

async function fetchText(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`No se pudo cargar ${url} (${response.status})`);
  return response.text();
}

export async function loadDepartmentMetadata() {
  const rows = parseCsv(await fetchText(DEPTOS_URL), ",");
  const byCode = new Map();
  const byName = new Map();

  rows.forEach((row) => {
    const code = normalizeCode(row.cde);
    if (!code) return;
    const item = {
      code,
      jurisdiccion: row.jur,
      departamento: row.nam,
      longitud: toNumber(row.LONGITUD_C),
      latitud: toNumber(row.LATITUD_CE),
      normalizedJurisdiction: normalizeJurisdiction(row.jur),
      normalizedDepartment: normalizeDepartment(row.nam),
    };
    byCode.set(code, item);
    byName.set(`${item.normalizedJurisdiction}|${item.normalizedDepartment}`, item);
  });

  return { byCode, byName };
}

function findDepartment(row, departments) {
  const normalizedJurisdiction = normalizeJurisdiction(row.jurisdiccion);
  const normalizedDepartment = normalizeDepartment(row.departamento);
  const key = `${normalizedJurisdiction}|${normalizedDepartment}`;
  const alias = DEPARTMENT_ALIASES.get(key);
  return departments.byName.get(key) || (alias ? departments.byName.get(`${normalizedJurisdiction}|${alias}`) : null);
}

export async function loadInstitutions(departments = null) {
  const deptos = departments || await loadDepartmentMetadata();
  const rows = parseCsv(await fetchText(LISTADO_URL), ";");
  const missing = [];

  const institutions = rows.map((row, index) => {
    const department = findDepartment(row, deptos);
    const item = {
      id: `${normalizeJurisdiction(row.jurisdiccion)}|${normalizeDepartment(row.departamento)}|${normalizeLookupText(row.nombre_institucion)}|${index}`,
      jurisdiccion: row.jurisdiccion || "Sin jurisdicción",
      departamento: row.departamento || "Sin departamento",
      nombre: row.nombre_institucion || "Institución sin nombre",
      estado_etp: row.estado_etp || "Sin información",
      gestion: row.gestion || "Sin información",
      matricula_total: toNumber(row.matricula_total),
      matricula_varones: toNumber(row.matricula_varones),
      matricula_mujeres: toNumber(row.matricula_mujeres),
      orientacion: row.orientacion || "Sin información",
      tipo_institucion: row.tipo_inst || "Sin información",
      codigo_departamento: department?.code || "",
      departamento_indec: department?.departamento || "",
    };
    if (!item.codigo_departamento && item.jurisdiccion !== "Sin jurisdicción") missing.push(item);
    return item;
  });

  if (missing.length) {
    console.warn(`Instituciones sin código de departamento: ${missing.length}`, missing.slice(0, 20));
  }

  return institutions;
}

export async function loadDepartmentTopology() {
  const response = await fetch(TOPO_URL);
  if (!response.ok) throw new Error(`No se pudo cargar ${TOPO_URL} (${response.status})`);
  return response.json();
}

