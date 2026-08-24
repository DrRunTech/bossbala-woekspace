import { secrets } from "base44:runtime";

// ============================================================================
// LocalAIGatewayService  (v2 — direct Ollama OpenAI-compatible)
// ----------------------------------------------------------------------------
// Abstraction over a LOCAL Ollama instance (qwen3 / deepseek-r1 / embeddings).
// Base44's backend functions run in a cloud sandbox and CANNOT reach
// 127.0.0.1 / private IPs (the platform blocks loopback as SSRF). So the user's
// Ollama must be exposed via a PUBLIC tunnel (cloudflared / ngrok) and that URL
// is stored in LOCAL_AI_GATEWAY_URL. This module then speaks Ollama's built-in
// OpenAI-compatible API directly — no separate FastAPI proxy is required:
//
//     Base44 (cloud)  ──HTTPS──▶  public tunnel  ──▶  user's Ollama  ──▶  models
//
// Endpoints used (Ollama OpenAI-compat):
//   GET  /v1/models             POST /v1/chat/completions   POST /v1/embeddings
//
// Auth: `Authorization: Bearer <LOCAL_AI_GATEWAY_API_KEY>` when set
// (Ollama ignores it unless the tunnel/proxy enforces it).
//
// Configuration (server-side secrets ONLY — never sent to the browser):
//   AI_PROVIDER               CLOUD | LOCAL   (default CLOUD)
//   LOCAL_AI_GATEWAY_URL      Public URL of the tunnel to Ollama
//   LOCAL_AI_GATEWAY_API_KEY  Optional Bearer key (only if the tunnel checks it)
//   CHAT_MODEL                Default chat model          e.g. qwen3
//   ANALYSIS_MODEL            Research analysis model    e.g. qwen3
//   REASONING_MODEL           Reasoning model            e.g. deepseek-r1:8b
//   EMBEDDING_MODEL           Embedding model            e.g. nomic-embed-text
//
// Robustness for qwen3/deepseek:
//   - Thinking models emit <think>…</think> blocks; stripped before JSON parse.
//   - JSON responses extracted via response_format + fence/brace fallback.
// Guarantees:
//   - 30s timeout, aborted cleanly; idempotent GETs retried on 5xx/429.
//   - Auth/unreachable/HTTP errors classified (auth_error / unreachable / http).
//   - Structured, non-throwing service methods → graceful fallback.
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

// qwen3 / deepseek-r1 interleave reasoning in <think>…</think> blocks before
// the final answer. Strip them (and stray control markers) before JSON parsing.
function stripReasoning(s) {
  return s
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<think>[\s\S]*$/i, "")            // unterminated thinking
    .replace(/<\|[^|]*\|>/g, "")                // <|im_start|> etc.
    .trim();
}

function parseJsonContent(value) {
  if (value == null) return null;
  if (typeof value === "object") return value;
  if (typeof value !== "string") return value;
  const cleaned = stripReasoning(value.trim());
  const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };
  let p = tryParse(cleaned);
  if (p !== undefined) return p;
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) { p = tryParse(fence[1].trim()); if (p !== undefined) return p; }
  const m = cleaned.match(/[{[][\s\S]*[}\]]/);
  if (m) { p = tryParse(m[0]); if (p !== undefined) return p; }
  return cleaned || value.trim();
}

// ---------------------------------------------------------------------------
// LocalAIGatewayService — structured, non-throwing methods.
// Each returns { ok, status, ... } and never throws (graceful fallback).
// ---------------------------------------------------------------------------
export const LocalAIGatewayService = {
  // GET /v1/models (Ollama OpenAI-compatible) — used as the health probe.
  async health() {
    const cfg = getConfig();
    if (cfg.provider !== "LOCAL") return { ok: true, provider: "CLOUD", status: "online", ollama: "n/a", detail: null, message: null };
    if (!cfg.baseUrl) return { ok: false, provider: "LOCAL", status: "unconfigured", ollama: "unknown", error: "LOCAL_AI_GATEWAY_URL is not set.", message: "LOCAL_AI_GATEWAY_URL is not set." };
    try {
      const r = await rawRequest(cfg, "GET", "/v1/models", null, { idempotent: true });
      return { ok: true, provider: "LOCAL", status: "online", ollama: "online", detail: r, message: null };
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
      const models = Array.isArray(r?.data) ? r.data.map((m) => m.id || m.name).filter(Boolean)
        : Array.isArray(r?.models) ? r.models.map((m) => (typeof m === "string" ? m : (m.id || m.name))).filter(Boolean)
        : [];
      return { ok: true, provider: "LOCAL", models };
    } catch (e) {
      return { ok: false, provider: "LOCAL", models: [], error: e.message, kind: e.kind };
    }
  },

  // POST /v1/chat/completions (Ollama OpenAI-compatible)
  async chat({ messages, model } = {}) {
    const cfg = getConfig();
    if (cfg.provider !== "LOCAL") return { ok: true, provider: "CLOUD", content: null, note: "Cloud chat handled via Core.InvokeLLM compat layer." };
    try {
      const r = await rawRequest(cfg, "POST", "/v1/chat/completions", {
        model: model || cfg.chatModel,
        messages: messages || [],
        stream: false,
      });
      const content = r?.choices?.[0]?.message?.content || r?.content || (typeof r === "string" ? r : JSON.stringify(r));
      return { ok: true, provider: "LOCAL", content, raw: r };
    } catch (e) {
      return { ok: false, provider: "LOCAL", content: null, error: e.message, kind: e.kind };
    }
  },

  // POST /v1/chat/completions with JSON response_format → structured analysis.
  async analyze({ prompt, response_json_schema, model } = {}) {
    const cfg = getConfig();
    if (cfg.provider !== "LOCAL") return { ok: true, provider: "CLOUD", result: null, note: "Cloud analyze handled via Core.InvokeLLM compat layer." };
    try {
      const body = {
        model: model || cfg.analysisModel,
        messages: [
          { role: "system", content: response_json_schema
            ? "You are a strict JSON generator. Output ONLY a single valid JSON object matching the requested schema. No prose, no markdown fences, no reasoning."
            : "You are a precise, evidence-based research analyst." },
          { role: "user", content: prompt },
        ],
        stream: false,
      };
      if (response_json_schema) body.response_format = { type: "json_object" };
      const r = await rawRequest(cfg, "POST", "/v1/chat/completions", body);
      const content = r?.choices?.[0]?.message?.content || "";
      const result = response_json_schema ? parseJsonContent(content) : stripReasoning(content);
      return { ok: true, provider: "LOCAL", result, raw: r };
    } catch (e) {
      return { ok: false, provider: "LOCAL", result: null, error: e.message, kind: e.kind };
    }
  },

  // POST /v1/embeddings (Ollama OpenAI-compatible)
  async embeddings({ input, model } = {}) {
    const cfg = getConfig();
    if (cfg.provider !== "LOCAL") return { ok: false, provider: "CLOUD", embedding: null, error: "Embeddings require LOCAL provider (LOCAL_AI_GATEWAY_URL)." };
    try {
      const r = await rawRequest(cfg, "POST", "/v1/embeddings", { model: model || cfg.embeddingModel, input });
      const embedding = r?.data?.[0]?.embedding || r?.embedding || r?.data || r;
      return { ok: true, provider: "LOCAL", embedding, raw: r };
    } catch (e) {
      return { ok: false, provider: "LOCAL", embedding: null, error: e.message, kind: e.kind };
    }
  },

  // Local document analysis: text-prompt only (no visual file reading unless a
  // vision model is configured). Keeps the contract without crashing.
  async analyzeDocument({ file_url, prompt, response_json_schema, model } = {}) {
    const cfg = getConfig();
    if (cfg.provider !== "LOCAL") return { ok: true, provider: "CLOUD", result: null, note: "Cloud document analysis handled via Core.InvokeLLM compat layer." };
    try {
      const body = {
        model: model || cfg.analysisModel,
        messages: [
          { role: "system", content: response_json_schema
            ? "You are a strict JSON generator. Output ONLY a single valid JSON object. No prose, no fences, no reasoning."
            : "You are a precise document analyst." },
          { role: "user", content: prompt || "Analyze this document." },
        ],
        stream: false,
      };
      if (response_json_schema) body.response_format = { type: "json_object" };
      const r = await rawRequest(cfg, "POST", "/v1/chat/completions", body);
      const content = r?.choices?.[0]?.message?.content || "";
      const result = response_json_schema ? parseJsonContent(content) : stripReasoning(content);
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