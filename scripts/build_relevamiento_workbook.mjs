import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const [csvPath, outputPath] = process.argv.slice(2);
if (!csvPath || !outputPath) {
  throw new Error("Uso: node build_relevamiento_workbook.mjs <respuestas.csv> <salida.xlsx>");
}

function parseDelimited(text, delimiter) {
  const rows = [];
  let row = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (quoted && next === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(value);
      value = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") index += 1;
      row.push(value);
      if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
      row = [];
      value = "";
    } else {
      value += char;
    }
  }
  row.push(value);
  if (row.some((cell) => String(cell).trim() !== "")) rows.push(row);
  return rows;
}

function normalizeCue(value) {
  const digits = String(value ?? "").replace(/\D/g, "");
  return digits ? digits.padStart(9, "0") : "";
}

const jurisdictions = [
  ["02", "Ciudad de Buenos Aires", 54, 15],
  ["06", "Buenos Aires", 457, 91],
  ["10", "Catamarca", 18, 15],
  ["14", "Córdoba", 256, 51],
  ["18", "Corrientes", 61, 15],
  ["22", "Chaco", 40, 15],
  ["26", "Chubut", 28, 15],
  ["30", "Entre Ríos", 88, 18],
  ["34", "Formosa", 24, 15],
  ["38", "Jujuy", 29, 15],
  ["42", "La Pampa", 17, 15],
  ["46", "La Rioja", 25, 15],
  ["50", "Mendoza", 84, 17],
  ["54", "Misiones", 87, 17],
  ["58", "Neuquén", 35, 15],
  ["62", "Río Negro", 40, 15],
  ["66", "Salta", 70, 15],
  ["70", "San Juan", 32, 15],
  ["74", "San Luis", 32, 15],
  ["78", "Santa Cruz", 20, 15],
  ["82", "Santa Fe", 173, 35],
  ["86", "Santiago del Estero", 30, 15],
  ["90", "Tucumán", 42, 15],
  ["94", "Tierra del Fuego", 8, 8],
];

const questionRows = [
  ["q_2_1_1", "2.1.1.", "Personal asignado formalmente para la gestión de PP", 1],
  ["q_2_2_3", "2.2.3.", "Remisión y aprobación jurisdiccional del plan de PP", 2],
  ["q_2_2_5", "2.2.5.", "Formato predominante de las prácticas", 3],
  ["q_3_4", "3.4.", "Registro actualizado de oferentes externos", 4],
  ["q_4_2", "4.2.", "Suficiencia de la vinculación socioproductiva", 5],
  ["q_5_6", "5.6.", "Evaluación de la relación con las capacidades profesionales", 6],
];

const csvText = (await fs.readFile(csvPath, "utf8")).replace(/^\uFEFF/, "");
const responseRows = parseDelimited(csvText, ",");
if (responseRows.length < 2) throw new Error("La fuente de respuestas no contiene registros.");
const cueColumnIndex = responseRows[0].findIndex((header) => String(header).includes("1.1.4. CUE"));
if (cueColumnIndex < 0) throw new Error("No se encontró la columna CUE en la fuente de respuestas.");

const uniqueCues = [];
const seenCues = new Set();
for (const row of responseRows.slice(1)) {
  const cue = normalizeCue(row[cueColumnIndex]);
  if (cue && !seenCues.has(cue)) {
    seenCues.add(cue);
    uniqueCues.push(cue);
  }
}

const workbook = Workbook.create();
const config = workbook.worksheets.add("CONFIGURACION");
const sample = workbook.worksheets.add("MUESTRA");
const classification = workbook.worksheets.add("CLASIFICACION");
const responses = workbook.worksheets.add("RESPUESTAS");
const questions = workbook.worksheets.add("PREGUNTAS");

const navy = "#0A2340";
const blue = "#1A4A7A";
const gold = "#C8A84B";
const pale = "#EEF2F7";
const inputFill = "#FFF2CC";
const bodyFont = "Arial";

function styleSheet(sheet) {
  sheet.showGridLines = false;
  const used = sheet.getUsedRange();
  if (used) used.format.font = { name: bodyFont, size: 10, color: navy };
}

function styleTable(sheet, rangeAddress, headerAddress) {
  const range = sheet.getRange(rangeAddress);
  range.format.verticalAlignment = "center";
  const header = sheet.getRange(headerAddress);
  header.format = {
    fill: navy,
    font: { name: bodyFont, size: 10, bold: true, color: "#FFFFFF" },
    horizontalAlignment: "center",
    verticalAlignment: "center",
    wrapText: true,
    borders: { preset: "inside", style: "thin", color: "#FFFFFF" },
  };
}

config.getRange("A2:D2").values = [["Resultados del relevamiento de Prácticas Profesionalizantes", "", "", ""]];
config.mergeCells("A2:D2");
config.getRange("A2:D2").format = { font: { name: bodyFont, size: 16, bold: true, color: navy } };
config.getRange("A4:B13").values = [
  ["Parámetro", "Valor"],
  ["universo_operativo", 1750],
  ["muestra_proyectada", 492],
  ["porcentaje_muestra", 492 / 1750],
  ["respuestas_fuente", responseRows.length - 1],
  ["cue_unicos_fuente", uniqueCues.length],
  ["criterio_duplicados", "El proceso informa duplicados y usa provisoriamente el último registro por CUE; no modifica RESPUESTAS."],
  ["clasificacion_pendiente", "Completar CLASIFICACION para identificar titular, reemplazo o complementaria."],
  ["fecha_actualizacion", new Date()],
  ["fuente", "https://docs.google.com/spreadsheets/d/e/2PACX-1vREEFOWh_9ug9zit8aqPZH9GZNsEmTIeMLDIN2R6osnCiE416gdxBbfdyqp7t62U4-ctv4coIY9YIKq/pubhtml?gid=1117232014&single=true"],
];
styleTable(config, "A4:B13", "A4:B4");
config.getRange("B5:B6").format.numberFormat = "#,##0";
config.getRange("B7").format.numberFormat = "0.0%";
config.getRange("B8:B9").format.numberFormat = "#,##0";
config.getRange("B12").format.numberFormat = "yyyy-mm-dd";
config.getRange("B5:B7").format.fill = pale;
config.getRange("B10:B11").format.fill = inputFill;
config.getRange("A15:D17").values = [
  ["Actualización", "", "", ""],
  ["1", "Reemplazar únicamente los datos de la hoja RESPUESTAS, conservando los encabezados.", "", ""],
  ["2", "Completar CLASIFICACION y MUESTRA cuando se disponga del vínculo entre titulares y reemplazos. Luego ejecutar el generador local.", "", ""],
];
config.mergeCells("A15:D15");
config.mergeCells("B16:D16");
config.mergeCells("B17:D17");
config.getRange("A15:D15").format = { fill: blue, font: { name: bodyFont, bold: true, color: "#FFFFFF" } };
config.getRange("A16:D17").format.wrapText = true;
config.getRange("A16:D17").format.rowHeight = 34;
config.getRange("A:A").format.columnWidth = 26;
config.getRange("B:B").format.columnWidth = 90;
config.getRange("C:D").format.columnWidth = 12;

const sampleRows = [["id_muestra", "jurisdiccion_id", "jurisdiccion", "universo_jurisdiccional", "muestra_jurisdiccional", "cue_titular", "cue_reemplazo_1", "cue_reemplazo_2"]];
for (const [code, name, universe, target] of jurisdictions) {
  for (let index = 1; index <= target; index += 1) {
    sampleRows.push([`${code}-${String(index).padStart(3, "0")}`, code, name, universe, target, "", "", ""]);
  }
}
sample.getRangeByIndexes(0, 0, sampleRows.length, sampleRows[0].length).values = sampleRows;
styleTable(sample, `A1:H${sampleRows.length}`, "A1:H1");
sample.getRange(`F2:H${sampleRows.length}`).format.fill = inputFill;
sample.getRange(`B2:B${sampleRows.length}`).format.numberFormat = "00";
sample.getRange(`F2:H${sampleRows.length}`).format.numberFormat = "000000000";
sample.freezePanes.freezeRows(1);
sample.getRange("A:H").format.autofitColumns();
sample.getRange("C:C").format.columnWidth = 24;

const classificationRows = [["cue", "tipo_caso", "id_muestra", "observacion"]];
for (const cue of uniqueCues) classificationRows.push([cue, "", "", ""]);
classification.getRangeByIndexes(0, 0, classificationRows.length, 4).values = classificationRows;
styleTable(classification, `A1:D${classificationRows.length}`, "A1:D1");
classification.getRange(`A2:A${classificationRows.length}`).format.numberFormat = "000000000";
classification.getRange(`B2:D${classificationRows.length}`).format.fill = inputFill;
classification.getRange(`B2:B${classificationRows.length}`).dataValidation = {
  rule: { type: "list", values: ["titular", "reemplazo", "complementaria"] },
};
classification.freezePanes.freezeRows(1);
classification.getRange("A:D").format.autofitColumns();
classification.getRange("D:D").format.columnWidth = 42;

const maxResponseColumns = Math.max(...responseRows.map((row) => row.length));
const paddedResponses = responseRows.map((row) => Array.from({ length: maxResponseColumns }, (_, index) => row[index] ?? ""));
responses.getRangeByIndexes(0, 0, paddedResponses.length, maxResponseColumns).values = paddedResponses;
styleTable(responses, `A1:${columnName(maxResponseColumns)}${paddedResponses.length}`, `A1:${columnName(maxResponseColumns)}1`);
responses.freezePanes.freezeRows(1);
responses.getUsedRange().format.wrapText = false;
responses.getRange("A:A").format.columnWidth = 20;
for (let index = 1; index < maxResponseColumns; index += 1) responses.getCell(0, index).format.columnWidth = 32;
responses.getRangeByIndexes(1, cueColumnIndex, paddedResponses.length - 1, 1).format.numberFormat = "000000000";

questions.getRange("A1:D7").values = [["id_pregunta", "prefijo_columna", "titulo_publico", "orden"], ...questionRows];
styleTable(questions, "A1:D7", "A1:D1");
questions.getRange("A:D").format.autofitColumns();
questions.getRange("C:C").format.columnWidth = 58;

for (const sheet of [config, sample, classification, responses, questions]) styleSheet(sheet);
styleTable(config, "A4:B13", "A4:B4");
styleTable(sample, `A1:H${sampleRows.length}`, "A1:H1");
styleTable(classification, `A1:D${classificationRows.length}`, "A1:D1");
styleTable(responses, `A1:${columnName(maxResponseColumns)}${paddedResponses.length}`, `A1:${columnName(maxResponseColumns)}1`);
styleTable(questions, "A1:D7", "A1:D1");
config.getRange("A2:D2").format.font = { name: bodyFont, size: 16, bold: true, color: navy };
config.getRange("A15:D15").format = { fill: blue, font: { name: bodyFont, bold: true, color: "#FFFFFF" } };
config.getRange("B13").format.wrapText = true;
config.getRange("B13").format.rowHeight = 42;
config.tabColor = navy;
sample.tabColor = blue;
classification.tabColor = gold;
questions.tabColor = "#5A7A9A";

workbook.recalculate();
const configCheck = await workbook.inspect({
  kind: "table",
  range: "CONFIGURACION!A2:B13",
  include: "values,formulas",
  tableMaxRows: 20,
  tableMaxCols: 4,
});
const sampleCheck = await workbook.inspect({
  kind: "table",
  range: "MUESTRA!A1:H8",
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 8,
});
const errorCheck = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A|#NUM!|#NULL!|#SPILL!|#CALC!",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});

await fs.mkdir(path.dirname(outputPath), { recursive: true });
const previewSpecs = [
  ["CONFIGURACION", "A1:D17", "relevamiento_pp_fuente_preview.png"],
  ["MUESTRA", "A1:H25", "relevamiento_pp_muestra_preview.png"],
  ["CLASIFICACION", "A1:D25", "relevamiento_pp_clasificacion_preview.png"],
  ["RESPUESTAS", "A1:H12", "relevamiento_pp_respuestas_preview.png"],
  ["PREGUNTAS", "A1:D7", "relevamiento_pp_preguntas_preview.png"],
];
for (const [sheetName, range, filename] of previewSpecs) {
  const preview = await workbook.render({ sheetName, range, scale: 1.2, format: "png" });
  await fs.writeFile(path.join(path.dirname(outputPath), filename), new Uint8Array(await preview.arrayBuffer()));
}
const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(outputPath);
console.log(JSON.stringify({
  outputPath,
  responseRows: responseRows.length - 1,
  uniqueCues: uniqueCues.length,
  sampleSlots: sampleRows.length - 1,
  configInspect: configCheck.ndjson,
  sampleInspect: sampleCheck.ndjson,
  errors: errorCheck.ndjson,
}, null, 2));

function columnName(count) {
  let value = count;
  let name = "";
  while (value > 0) {
    const remainder = (value - 1) % 26;
    name = String.fromCharCode(65 + remainder) + name;
    value = Math.floor((value - 1) / 26);
  }
  return name;
}
