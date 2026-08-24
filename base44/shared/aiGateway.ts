import { secrets } from "base44:runtime";

// ============================================================================
// LocalAIGatewayService
// ----------------------------------------------------------------------------
// Centralized abstraction over the private Local AI Gateway (FastAPI).
// Base44 NEVER calls Ollama / Qwen / DeepSeek directly. Every request flows:
//
//     Base44 (this module)  ──HTTPS──▶  Local AI Gateway  ──▶  Ollama  ──▶  models
//
// The gateway exposes:
//   GET  /v1/health           GET  /v1/models          POST /v1/chat
//   POST /v1/analyze          POST /v1/embeddings      POST /v1/document/analyze
//
// Auth: `Authorization: Bearer <LOCAL_AI_GATEWAY_API_KEY>`.
//
// Configuration (read from server-side secrets ONLY — never sent to browser):
//   AI_PROVIDER               CLOUD | LOCAL   (default CLOUD)
//   LOCAL_AI_GATEWAY_URL      Base URL of the FastAPI gateway
//   LOCAL_AI_GATEWAY_API_KEY  Bearer key for the gateway
//   CHAT_MODEL                Default chat model
//   ANALYSIS_MODEL            Research analysis model
//   REASONING_MODEL           Reasoning model
//   EMBEDDING_MODEL           Embedding model
//
// Guarantees:
//   - 30s timeout per request, aborted cleanly.
//   - Retry ONLY for safe/idempotent GETs (health, models) on network/5xx/429.
//   - Auth errors (401/403), HTTP errors, and unreachable state are classified.
//   - Structured JSON parsing for analysis/chat payloads (fenced or embedded).
//   - Structured, non-throwing service methods → graceful fallback.
//   - Backend logging for every request and failure.
// ============================================================================

const TIMEOUT_MS = 30000;
const MAX_RETRIES = 2; // only applied to idempotent GETs
const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

function log(level, msg, extra) {
  const line = `[aiGateway:${level}] ${msg}`;
  if (extra !== undefined) console.log(line, extra); else console.log(line);
}

export function getConfig() {
  const raw = (secrets.get("AI_PROVIDER") || "CLOUD").toUpperCase();
  const provider = raw === "LOCAL" ? "LOCAL" : "CLOUD";
  return {
    provider,
    baseUrl: (secrets.get("LOCAL_AI_GATEWAY_URL") || "").replace(/\/$/, ""),
    hasKey: !!secrets.get("LOCAL_AI_GATEWAY_API_KEY"),
    chatModel: secrets.get("CHAT_MODEL") || "qwen3:8b",
    analysisModel: secrets.get("ANALYSIS_MODEL") || secrets.get("CHAT_MODEL") || "qwen3:8b",
    reasoningModel: secrets.get("REASONING_MODEL") || "deepseek-r1:8b",
    embeddingModel: secrets.get("EMBEDDING_MODEL") || "nomic-embed-text",
  };
}

function authHeaders() {
  const h = { "Content-Type": "application/json" };
  const key = secrets.get("LOCAL_AI_GATEWAY_API_KEY");
  if (key) h["Authorization"] = `Bearer ${key}`;
  return h;
}

function classifyError(e) {
  const msg = String(e?.message || e);
  if (e?.name === "AbortError") return { kind: "timeout", message: `Request timed out after ${TIMEOUT_MS}ms` };
  if (/failed to fetch|network|econn|connect|hang up|dns/i.test(msg)) return { kind: "unreachable", message: `Gateway unreachable: ${msg}` };
  if (e?.status === 401 || e?.status === 403) return { kind: "auth", message: `Authentication failed (HTTP ${e.status}). LOCAL_AI_GATEWAY_API_KEY may be missing or invalid.` };
  return { kind: "http", message: msg };
}

// Core HTTP helper. Throws enriched errors (kind, status) on failure.
async function rawRequest(cfg, method, path, body, { idempotent = false } = {}) {
  const url = `${cfg.baseUrl}${path}`;
  if (!cfg.baseUrl) {
    const err = new Error("LOCAL_AI_GATEWAY_URL is not configured.");
    err.kind = "unconfigured";
    throw err;
  }

  const attempt = async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      log("info", `${method} ${path}`);
      const res = await fetch(url, {
        method,
        headers: authHeaders(),
        body: body !== undefined && body !== null ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      let parsed;
      try { parsed = text ? JSON.parse(text) : null; } catch { parsed = text; }
      if (!res.ok) {
        const snippet = typeof parsed === "string" ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200);
        const err = new Error(`HTTP ${res.status} ${res.statusText} — ${snippet}`);
        err.status = res.status;
        err.body = parsed;
        throw err;
      }
      return parsed;
    } finally {
      clearTimeout(timer);
    }
  };

  const attempts = idempotent ? MAX_RETRIES + 1 : 1;
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await attempt();
    } catch (e) {
      lastErr = e;
      const retryable = idempotent && (e?.name === "AbortError" || RETRYABLE_STATUS.has(e?.status));
      if (!retryable || i === attempts - 1) break;
      const backoff = Math.min(1000 * Math.pow(2, i), 4000);
      log("warn", `retrying ${method} ${path} in ${backoff}ms (attempt ${i + 1}/${MAX_RETRIES})`);
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  const cls = classifyError(lastErr);
  log("error", `${method} ${path} → ${cls.kind}: ${cls.message}`);
  const enriched = new Error(cls.message);
  enriched.kind = cls.kind;
  enriched.status = lastErr?.status;
  throw enriched;
}

const CLOUD_MODELS = new Set([
  "automatic", "gpt_5_mini", "gemini_3_flash", "gpt_5_4", "gpt_5_6_sol", "gpt_5_6_luna",
  "gemini_3_1_pro", "claude_sonnet_4_6", "claude_opus_4_6", "claude_opus_4_7", "claude_opus_4_8", "claude-sonnet-5",
]);
// Local (Ollama) model names like "qwen2.5:7b" are invalid for the CLOUD
// InvokeLLM path and cause it to throw. Map any non-cloud model to "automatic".
function cloudModel(name) {
  return typeof name === "string" && CLOUD_MODELS.has(name) ? name : "automatic";
}

function parseJsonContent(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const trimmed = value.trim();
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let p = tryParse(trimmed);
  if (p !== undefined) return p;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { p = tryParse(fence[1].trim()); if (p !== undefined) return p; }
  const m = trimmed.match(/[{[][\s\S]*[}\]]/);
  if (m) { p = tryParse(m[0]); if (p !== undefined) return p; }
  return trimmed;
}

// ---------------------------------------------------------------------------
// LocalAIGatewayService — structured, non-throwing methods.
// Each returns { ok, status, ... } and never throws (graceful fallback).
// ---------------------------------------------------------------------------
export const LocalAIGatewayService = {
  // GET /v1/health
  async health() {
    const cfg = getConfig();
    if (cfg.provider !== "LOCAL") return { ok: true, provider: "CLOUD", status: "online", ollama: "n/a", detail: null, message: null };
    if (!cfg.baseUrl) return { ok: false, provider: "LOCAL", status: "unconfigured", ollama: "unknown", error: "LOCAL_AI_GATEWAY_URL is not set.", message: "LOCAL_AI_GATEWAY_URL is not set." };
    try {
      const r = await rawRequest(cfg, "GET", "/v1/health", null, { idempotent: true });
      const ok = r?.ok !== false;
      const ollama = r?.ollama?.status || r?.ollama || (ok ? "online" : "offline");
      return { ok, provider: "LOCAL", status: ok ? "online" : "offline", ollama, detail: r, message: null };
    } catch (e) {
      return { ok: false, provider: "LOCAL", status: e.kind === "auth" ? "auth_error" : "unreachable", ollama: "unknown", error: e.message, message: e.message, kind: e.kind };
    }
  },

  // GET /v1/models
  async listModels() {
    const cfg = getConfig();
    if (cfg.provider !== "LOCAL") return { ok: true, provider: "CLOUD", models: [] };
    if (!cfg.baseUrl) return { ok: false, provider: "LOCAL", models: [], error: "LOCAL_AI_GATEWAY_URL is not set." };
    try {
      const r = await rawRequest(cfg, "GET", "/v1/models", null, { idempotent: true });
      const models = (r?.models || []).map((m) => (typeof m === "string" ? m : (m.id || m.name))).filter(Boolean);
      return { ok: true, provider: "LOCAL", models };
    } catch (e) {
      return { ok: false, provider: "LOCAL", models: [], error: e.message, kind: e.kind };
    }
  },

  // POST /v1/chat
  async chat({ messages, model } = {}) {
    const cfg = getConfig();
    if (cfg.provider !== "LOCAL") return { ok: true, provider: "CLOUD", content: null, note: "Cloud chat handled via Core.InvokeLLM compat layer." };
    try {
      const r = await rawRequest(cfg, "POST", "/v1/chat", { messages, model: model || cfg.chatModel });
      const content = r?.content || r?.message?.content || (typeof r === "string" ? r : JSON.stringify(r));
      return { ok: true, provider: "LOCAL", content, raw: r };
    } catch (e) {
      return { ok: false, provider: "LOCAL", content: null, error: e.message, kind: e.kind };
    }
  },

  // POST /v1/analyze
  async analyze({ prompt, response_json_schema, model } = {}) {
    const cfg = getConfig();
    if (cfg.provider !== "LOCAL") return { ok: true, provider: "CLOUD", result: null, note: "Cloud analyze handled via Core.InvokeLLM compat layer." };
    try {
      const r = await rawRequest(cfg, "POST", "/v1/analyze", { prompt, response_json_schema, model: model || cfg.analysisModel });
      const result = response_json_schema ? parseJsonContent(r?.result ?? r) : (r?.result ?? r);
      return { ok: true, provider: "LOCAL", result, raw: r };
    } catch (e) {
      return { ok: false, provider: "LOCAL", result: null, error: e.message, kind: e.kind };
    }
  },

  // POST /v1/embeddings
  async embeddings({ input, model } = {}) {
    const cfg = getConfig();
    if (cfg.provider !== "LOCAL") return { ok: false, provider: "CLOUD", embedding: null, error: "Embeddings require LOCAL provider (LOCAL_AI_GATEWAY_URL)." };
    try {
      const r = await rawRequest(cfg, "POST", "/v1/embeddings", { input, model: model || cfg.embeddingModel });
      const embedding = r?.embedding || r?.data || r;
      return { ok: true, provider: "LOCAL", embedding, raw: r };
    } catch (e) {
      return { ok: false, provider: "LOCAL", embedding: null, error: e.message, kind: e.kind };
    }
  },

  // POST /v1/document/analyze
  async analyzeDocument({ file_url, prompt, response_json_schema, model } = {}) {
    const cfg = getConfig();
    if (cfg.provider !== "LOCAL") return { ok: true, provider: "CLOUD", result: null, note: "Cloud document analysis handled via Core.InvokeLLM compat layer." };
    try {
      const r = await rawRequest(cfg, "POST", "/v1/document/analyze", { file_url, prompt, response_json_schema, model: model || cfg.analysisModel });
      const result = response_json_schema ? parseJsonContent(r?.result ?? r) : (r?.result ?? r);
      return { ok: true, provider: "LOCAL", result, raw: r };
    } catch (e) {
      return { ok: false, provider: "LOCAL", result: null, error: e.message, kind: e.kind };
    }
  },
};

// ---------------------------------------------------------------------------
// Backward-compatible exports used by existing business functions
// (askBossAI, generateAnalysis, comparePeriods). Signatures and return shapes
// are preserved — business logic is unchanged. CLOUD routes through
// Core.InvokeLLM; LOCAL unwraps LocalAIGatewayService results (throwing on
// failure, matching prior behavior).
// ---------------------------------------------------------------------------

export async function health() { return await LocalAIGatewayService.health(); }
export async function models() { return await LocalAIGatewayService.listModels(); }

export async function chat(base44, { messages, model } = {}) {
  const cfg = getConfig();
  if (cfg.provider === "CLOUD") {
    const prompt = (messages || []).map((m) => `${m.role || "user"}: ${m.content || ""}`).join("\n\n");
    const out = await base44.integrations.Core.InvokeLLM({ prompt, model: cloudModel(model || cfg.chatModel) });
    return typeof out === "string" ? out : (out?.content || JSON.stringify(out));
  }
  const r = await LocalAIGatewayService.chat({ messages, model: model || cfg.chatModel });
  if (!r.ok) throw new Error(r.error || "Local gateway chat failed");
  return r.content;
}

export async function analyze(base44, { prompt, response_json_schema, model } = {}) {
  const cfg = getConfig();
  if (cfg.provider === "CLOUD") {
    return await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema, model: cloudModel(model || cfg.chatModel) });
  }
  const r = await LocalAIGatewayService.analyze({ prompt, response_json_schema, model: model || cfg.analysisModel });
  if (!r.ok) throw new Error(r.error || "Local gateway analyze failed");
  return r.result;
}

export async function embed(base44, { input, model } = {}) {
  const cfg = getConfig();
  if (cfg.provider === "CLOUD") {
    return { ok: false, error: "Embeddings require LOCAL provider (LOCAL_AI_GATEWAY_URL)." };
  }
  const r = await LocalAIGatewayService.embeddings({ input, model: model || cfg.embeddingModel });
  return r.ok ? { ok: true, embedding: r.embedding } : { ok: false, error: r.error };
}

export async function documentAnalyze(base44, { file_url, prompt, response_json_schema, model } = {}) {
  const cfg = getConfig();
  if (cfg.provider === "CLOUD") {
    return await base44.integrations.Core.InvokeLLM({ prompt: prompt || "Analyze this document.", file_urls: file_url ? [file_url] : undefined, response_json_schema, model: cloudModel(model || cfg.chatModel) });
  }
  const r = await LocalAIGatewayService.analyzeDocument({ file_url, prompt, response_json_schema, model: model || cfg.analysisModel });
  if (!r.ok) throw new Error(r.error || "Local gateway document analysis failed");
  return r.result;
}