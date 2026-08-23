import { base44 } from "@/api/base44Client";

// ---------------------------------------------------------------------------
// Storage abstraction
// ---------------------------------------------------------------------------
// FileAsset records (metadata) are stored in the Base44 database. The physical
// file bytes live in a storage backend. This module is the only place that
// knows how to talk to a specific backend, so the ingest pipeline and UI stay
// backend-agnostic.
//
// Each backend implements:
//   { name, label, upload(file, opts) -> { fileUrl, storageRef, backend } }
//
// To add a backend (local filesystem, NAS, Google Drive, OneDrive, ...),
// implement the interface and register it in `BACKENDS`. When a backend needs
// server-side credentials or OAuth (Drive / OneDrive / NAS), move its
// implementation into a backend function that this client calls instead of
// calling Core.UploadFile directly — the contract above stays the same.
// ---------------------------------------------------------------------------

const BACKENDS = {
  base44: {
    name: "base44",
    label: "Base44 Storage",
    async upload(file) {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      return { fileUrl: file_url, storageRef: file_url, backend: "base44" };
    },
  },
};

let activeBackend = "base44";

export const getStorageBackend = () => activeBackend;
export const setStorageBackend = (name) => { if (BACKENDS[name]) activeBackend = name; };
export const availableBackends = () => Object.values(BACKENDS).map((b) => ({ name: b.name, label: b.label }));

export async function uploadToStorage(file, opts = {}) {
  const backend = BACKENDS[activeBackend];
  if (!backend) throw new Error(`Unknown storage backend: ${activeBackend}`);
  return backend.upload(file, opts);
}

// ---------------------------------------------------------------------------
// Checksum (SHA-256, hex) — used for deduplication so we never store the same
// large file twice.
// ---------------------------------------------------------------------------
export async function computeChecksum(file) {
  const buf = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ---------------------------------------------------------------------------
// Allowed upload types + document-type detection
// ---------------------------------------------------------------------------
export const ALLOWED_DOCUMENT_TYPES = ["PDF", "Word", "Excel", "PowerPoint", "CSV", "TXT", "JPG", "PNG", "ZIP"];

const EXT_TO_DOCTYPE = {
  pdf: "PDF", doc: "Word", docx: "Word",
  xls: "Excel", xlsx: "Excel",
  ppt: "PowerPoint", pptx: "PowerPoint",
  csv: "CSV", txt: "TXT",
  jpg: "JPG", jpeg: "JPG", png: "PNG",
  zip: "ZIP",
};

export function detectDocumentType(file) {
  if (!file) return null;
  const ext = (file.name.split(".").pop() || "").toLowerCase();
  return EXT_TO_DOCTYPE[ext] || null;
}

export function isAllowedFile(file) {
  return !!detectDocumentType(file);
}

// Map document type -> FileAsset.type enum
export function entityTypeFor(documentType) {
  switch (documentType) {
    case "JPG":
    case "PNG": return "Image";
    case "Excel": return "Spreadsheet";
    case "PDF":
    case "Word":
    case "PowerPoint":
    case "TXT":
    case "CSV": return "Document";
    case "ZIP": return "Archive";
    default: return "Other";
  }
}

// Whether an AI summary should be attempted for this document type.
export function shouldSummarize(documentType) {
  return documentType && documentType !== "ZIP";
}