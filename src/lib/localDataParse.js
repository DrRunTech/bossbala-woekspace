// Parse local / network-drive files (CSV / TSV / JSON) entirely in the browser
// into the same dataset shape the Data Studio charts consume, so visualizing a
// file from disk reuses the existing chart pipeline without uploading it.

const NUM_RE = /^-?\d+(\.\d+)?$/;

function isNumeric(v) {
  if (v === null || v === undefined || v === "") return false;
  const s = String(v).trim().replace(/,/g, "");
  return NUM_RE.test(s);
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const s = String(v).trim().replace(/,/g, "");
  if (!NUM_RE.test(s)) return null;
  return Number(s);
}

function looksDateLike(s) {
  if (s === null || s === undefined) return false;
  const t = String(s).trim();
  if (!t) return false;
  if (/^\d{4}[-/]\d{1,2}([-/]\d{1,2})?/.test(t)) return true;
  if (/^\d{1,2}[-/]\d{1,2}([-/]\d{2,4})?/.test(t)) return true;
  const d = new Date(t);
  return !isNaN(d.getTime()) && t.length >= 4 && /\d/.test(t);
}

function detectDelimiter(text) {
  const firstLine = text.split(/\r?\n/)[0] || "";
  const counts = { ",": 0, "\t": 0, ";": 0, "|": 0 };
  for (const ch of firstLine) if (ch in counts) counts[ch]++;
  let best = ",", max = 0;
  for (const k in counts) if (counts[k] > max) { max = counts[k]; best = k; }
  return best;
}

function splitLine(line, delim) {
  const out = [];
  let cur = "", inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i + 1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === delim && !inQ) {
      out.push(cur); cur = "";
    } else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

function parseDelimited(text, { name }) {
  const delim = detectDelimiter(text);
  const rawLines = text.split(/\r?\n/).filter((l) => l.trim() !== "");
  if (rawLines.length === 0) return [];
  const rows = rawLines.map((l) => splitLine(l, delim));
  const ncols = Math.max(...rows.map((r) => r.length));
  if (ncols < 1) return [];

  // Single column of numbers → one series over an index axis.
  if (ncols === 1) {
    const values = rows.map((r) => toNum(r[0]));
    if (!values.some((v) => v !== null)) return [];
    const labels = values.map((_, i) => String(i + 1));
    return [{ name, unit: "", labels, values, chartType: "line", xLabel: "Index", yLabel: name }];
  }

  const header = rows[0];
  const firstRowNumeric = header.slice(1).every((c) => c === "" || isNumeric(c));
  let seriesNames, dataRows, labelCol;
  if (firstRowNumeric) {
    seriesNames = header.slice(1).map((_, i) => `Series ${i + 1}`);
    dataRows = rows;
  } else {
    seriesNames = header.slice(1);
    dataRows = rows.slice(1);
  }
  labelCol = dataRows.map((r) => r[0]);
  const xLabel = looksDateLike(labelCol[0]) ? "Date" : "Category";

  const temporal = looksDateLike(labelCol[0]) || labelCol.every(isNumeric);
  const datasets = seriesNames.map((sName, si) => {
    const values = dataRows.map((r) => toNum(r[si + 1]));
    if (!values.some((v) => v !== null)) return null;
    return {
      name: sName || `Series ${si + 1}`,
      unit: "",
      labels: labelCol,
      values,
      chartType: temporal ? "line" : "bar",
      xLabel,
      yLabel: sName,
    };
  }).filter(Boolean);

  return datasets;
}

function parseJson(text, { name }) {
  let data;
  try { data = JSON.parse(text); } catch { return null; }

  if (Array.isArray(data) && data.every((d) => typeof d === "number")) {
    return [{ name, unit: "", labels: data.map((_, i) => String(i + 1)), values: data, chartType: "line", xLabel: "Index", yLabel: name }];
  }

  if (Array.isArray(data) && data.every((d) => typeof d === "object" && d && !Array.isArray(d))) {
    const keys = Array.from(new Set(data.flatMap((o) => Object.keys(o))));
    if (keys.length === 0) return [];
    const labels = data.map((o, i) => (keys[0] in o ? String(o[keys[0]]) : String(i + 1)));
    const xLabel = looksDateLike(labels[0]) ? "Date" : "Category";
    const temporal = looksDateLike(labels[0]) || labels.every(isNumeric);
    const datasets = keys.slice(1).map((k) => {
      const values = data.map((o) => toNum(o[k]));
      if (!values.some((v) => v !== null)) return null;
      return { name: k, unit: "", labels, values, chartType: temporal ? "line" : "bar", xLabel, yLabel: k };
    }).filter(Boolean);
    if (datasets.length) return datasets;
    const vals = data.map((o) => toNum(o[keys[0]]));
    if (vals.some((v) => v !== null)) {
      return [{ name, unit: "", labels: data.map((_, i) => String(i + 1)), values: vals, chartType: "bar", xLabel: "Index", yLabel: name }];
    }
    return [];
  }

  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (Array.isArray(data.labels) && Array.isArray(data.values) && data.values.length) {
      const values = data.values.map((v) => toNum(v));
      const labels = data.labels.map(String);
      const temporal = looksDateLike(labels[0]) || labels.every(isNumeric);
      return [{ name: data.name || name, unit: data.unit || "", labels, values, chartType: temporal ? "line" : "bar", xLabel: data.xLabel || "Category", yLabel: data.yLabel || data.name || name }];
    }
    const series = Object.entries(data).filter(([, v]) => Array.isArray(v) && v.every((x) => typeof x === "number"));
    if (series.length) {
      const len = Math.max(...series.map(([, v]) => v.length));
      const labels = Array.from({ length: len }, (_, i) => String(i + 1));
      return series.map(([k, v]) => ({ name: k, unit: "", labels, values: v, chartType: "line", xLabel: "Index", yLabel: k }));
    }
  }
  return null;
}

export async function fileToDatasets(file) {
  const lower = file.name.toLowerCase();
  const text = await file.text();
  if (lower.endsWith(".json")) return parseJson(text, { name: file.name }) ?? [];
  if (lower.endsWith(".csv") || lower.endsWith(".tsv") || lower.endsWith(".txt") || lower.endsWith(".dat")) {
    return parseDelimited(text, { name: file.name });
  }
  const trimmed = text.trimStart();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return parseJson(text, { name: file.name }) ?? [];
  }
  return parseDelimited(text, { name: file.name });
}

let localIdSeq = 0;
export async function fileToAssetShape(file) {
  const datasets = await fileToDatasets(file);
  const id = `local-${Date.now()}-${localIdSeq++}`;
  const lower = file.name.toLowerCase();
  let documentType = "Other";
  if (lower.endsWith(".csv")) documentType = "CSV";
  else if (lower.endsWith(".json")) documentType = "JSON";
  else if (lower.endsWith(".tsv")) documentType = "TSV";
  return {
    id,
    name: file.name,
    documentType,
    type: "Data",
    aiData: { datasets },
    aiSummary: "",
    keywords: [],
    created_date: new Date().toISOString(),
    _local: true,
  };
}

export function canPickViaFS() {
  return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
}

const CLIENT_EXTS = ["csv", "tsv", "txt", "dat", "json"];
const SPREADSHEET_EXTS = ["xls", "xlsx"];

export function isClientParseable(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return CLIENT_EXTS.includes(ext);
}

export function isSpreadsheet(file) {
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return SPREADSHEET_EXTS.includes(ext);
}

export async function pickLocalFiles() {
  if (canPickViaFS()) {
    try {
      const handles = await window.showOpenFilePicker({
        multiple: true,
        types: [{
          description: "Data, document or image files",
          accept: {
            "text/csv": [".csv", ".tsv", ".txt", ".dat"],
            "application/json": [".json"],
            "application/pdf": [".pdf"],
            "application/vnd.ms-excel": [".xls"],
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
            "application/msword": [".doc"],
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [".docx"],
            "application/vnd.ms-powerpoint": [".ppt"],
            "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
            "image/png": [".png"],
            "image/jpeg": [".jpg", ".jpeg"],
            "image/tiff": [".tif", ".tiff"],
            "image/bmp": [".bmp"],
            "image/gif": [".gif"],
            "image/webp": [".webp"],
            "text/plain": [".csv", ".tsv", ".txt"],
          },
        }],
      });
      return await Promise.all(handles.map((h) => h.getFile()));
    } catch (e) {
      if (e && e.name === "AbortError") return [];
      // fall through to the <input> fallback
    }
  }
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = ".csv,.tsv,.txt,.dat,.json,.xls,.xlsx,.doc,.docx,.ppt,.pptx,.pdf,.png,.jpg,.jpeg,.tif,.tiff,.bmp,.gif,.webp";
    input.onchange = () => resolve(Array.from(input.files || []));
    input.click();
  });
}

// For formats the browser can't turn into numeric datasets (PDF / images / office
// docs), upload the file and run the existing AI extraction pipeline so its
// chartable data lands on a real FileAsset we can visualize.
import { base44 } from "@/api/base44Client";
import { detectDocumentType, entityTypeFor } from "@/lib/storage";

export async function analyzeViaAI(file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  const me = await base44.auth.me();
  const documentType = detectDocumentType(file) || "Other";
  const created = await base44.entities.FileAsset.create({
    organizationId: me?.data?.organizationId || me?.organizationId,
    name: file.name,
    type: entityTypeFor(documentType),
    documentType,
    fileUrl: file_url,
    fileSize: file.size,
    mimeType: file.type,
    storageRef: file_url,
    storageBackend: "base44",
    uploadedBy: me?.id,
    category: "RawData",
    version: 1,
  });
  await base44.functions.invoke("processFileAsset", { fileAssetId: created.id });
  return await base44.entities.FileAsset.get(created.id);
}

// Build chartable datasets from generic spreadsheet rows (array of objects).
function rowsToDatasets(rows) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const cols = Object.keys(rows[0]);
  const isNum = (c) => rows.slice(0, 50).every((r) => r[c] === "" || r[c] == null || !Number.isNaN(Number(r[c])));
  const numCols = cols.filter(isNum);
  if (numCols.length === 0) return [];
  const labelCol = cols.find((c) => !numCols.includes(c));
  const labels = rows.map((r, i) => {
    const v = labelCol ? r[labelCol] : "";
    return (v === "" || v == null) ? String(i + 1) : String(v);
  });
  return numCols.map((c) => ({
    name: c,
    chartType: "bar",
    unit: "",
    labels,
    values: rows.map((r) => (r[c] === "" || r[c] == null ? 0 : Number(r[c]))),
    xLabel: labelCol || "Row",
    yLabel: c,
  }));
}

// Excel files: upload briefly so the extraction integration can read them, pull
// the tabular rows, and return a local-only asset (no FileAsset record created).
export async function extractSpreadsheet(file) {
  const { file_url } = await base44.integrations.Core.UploadFile({ file });
  let rows = [];
  try {
    const res = await base44.integrations.Core.ExtractDataFromUploadedFile({
      file_url,
      json_schema: {
        type: "object",
        properties: { rows: { type: "array", items: { type: "object", additionalProperties: true } } },
        required: ["rows"],
      },
    });
    rows = Array.isArray(res?.output?.rows) ? res.output.rows
      : Array.isArray(res?.output) ? res.output
      : [];
  } catch { rows = []; }
  return {
    id: "local-" + Math.random().toString(36).slice(2, 9) + "-" + file.name,
    name: file.name,
    type: "Spreadsheet",
    documentType: "Excel",
    fileUrl: file_url,
    fileSize: file.size,
    aiData: { datasets: rowsToDatasets(rows), source: "local-spreadsheet" },
    _local: true,
  };
}