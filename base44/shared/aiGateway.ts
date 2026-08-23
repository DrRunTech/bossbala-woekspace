import { secrets } from "base44:runtime";

// Configurable AI Gateway abstraction.
// Provider types: CLOUD (Base44 Core.InvokeLLM) and LOCAL (a self-hosted HTTP
// gateway reachable at LOCAL_AI_BASE_URL). Configuration is read from secrets:
//   AI_PROVIDER (CLOUD|LOCAL), LOCAL_AI_BASE_URL, LOCAL_AI_API_KEY,
//   CHAT_MODEL, EMBEDDING_MODEL
// Secrets are only ever read here, on the backend — never exposed to the browser.
// Defaults to CLOUD when AI_PROVIDER is unset, so the app keeps working with no
// configuration. LOCAL is only contacted when explicitly selected.

export function getConfig() {
  const raw = (secrets.get("AI_PROVIDER") || "CLOUD").toUpperCase();
  const provider = raw === "LOCAL" ? "LOCAL" : "CLOUD";
  return {
    provider,
    baseUrl: (secrets.get("LOCAL_AI_BASE_URL") || "").replace(/\/$/, ""),
    hasKey: !!secrets.get("LOCAL_AI_API_KEY"),
    chatModel: secrets.get("CHAT_MODEL") || "automatic",
    embeddingModel: secrets.get("EMBEDDING_MODEL") || "",
  };
}

function localHeaders() {
  const h = { "Content-Type": "application/json" };
  const key = secrets.get("LOCAL_AI_API_KEY");
  if (key) h["Authorization"] = `Bearer ${key}`;
  return h;
}
async function localGet(cfg, path) {
  const res = await fetch(`${cfg.baseUrl}${path}`, { method: "GET", headers: localHeaders() });
  if (!res.ok) throw new Error(`GET ${path} → HTTP ${res.status}`);
  return res.json();
}
async function localPost(cfg, path, body) {
  const res = await fetch(`${cfg.baseUrl}${path}`, { method: "POST", headers: localHeaders(), body: JSON.stringify(body) });
  if (!res.ok) throw new Error(`POST ${path} → HTTP ${res.status}`);
  return res.json();
}

// GET /v1/health
export async function health() {
  const cfg = getConfig();
  if (cfg.provider === "CLOUD") {
    return { ok: true, provider: "CLOUD", status: "online", configured: true, detail: { chat_model: cfg.chatModel, embedding_model: cfg.embeddingModel } };
  }
  if (!cfg.baseUrl) {
    return { ok: false, provider: "LOCAL", status: "unconfigured", configured: false, message: "LOCAL_AI_BASE_URL is not set. Configure the AI_PROVIDER and LOCAL_AI_BASE_URL secrets to use a local gateway." };
  }
  try {
    const r = await localGet(cfg, "/v1/health");
    return { ok: !!r.ok, provider: "LOCAL", status: r.ok ? "online" : "offline", configured: true, detail: { ...r, chat_model: cfg.chatModel, embedding_model: cfg.embeddingModel } };
  } catch (e) {
    return { ok: false, provider: "LOCAL", status: "unreachable", configured: true, message: `Cannot reach local AI gateway at ${cfg.baseUrl}: ${e.message}` };
  }
}

// GET /v1/models
export async function models() {
  const cfg = getConfig();
  if (cfg.provider === "CLOUD") {
    return { ok: true, provider: "CLOUD", models: ["automatic", "gpt_5_mini", "gemini_3_flash", "gpt_5_4", "claude_sonnet_4_6"] };
  }
  if (!cfg.baseUrl) return { ok: false, provider: "LOCAL", models: [], message: "LOCAL_AI_BASE_URL not set." };
  try {
    const r = await localGet(cfg, "/v1/models");
    return { ok: true, provider: "LOCAL", models: r.models || [] };
  } catch (e) {
    return { ok: false, provider: "LOCAL", models: [], message: e.message };
  }
}

// POST /v1/analyze  (structured analysis, returns parsed JSON when a schema is given)
export async function analyze(base44, { prompt, response_json_schema, model } = {}) {
  const cfg = getConfig();
  if (cfg.provider === "CLOUD") {
    return await base44.integrations.Core.InvokeLLM({ prompt, response_json_schema, model: model || cfg.chatModel });
  }
  const r = await localPost(cfg, "/v1/analyze", { prompt, response_json_schema, model: model || cfg.chatModel });
  return r.result || r;
}

// POST /v1/chat
export async function chat(base44, { messages, model } = {}) {
  const cfg = getConfig();
  if (cfg.provider === "CLOUD") {
    const prompt = (messages || []).map((m) => `${m.role || "user"}: ${m.content || ""}`).join("\n\n");
    const out = await base44.integrations.Core.InvokeLLM({ prompt, model: model || cfg.chatModel });
    return typeof out === "string" ? out : (out?.content || JSON.stringify(out));
  }
  const r = await localPost(cfg, "/v1/chat", { messages, model: model || cfg.chatModel });
  return r.content || r;
}

// POST /v1/embeddings
export async function embed(base44, { input, model } = {}) {
  const cfg = getConfig();
  if (cfg.provider === "CLOUD") {
    return { ok: false, error: "Embeddings are not available on the CLOUD provider. Set AI_PROVIDER=LOCAL to use a local embeddings endpoint." };
  }
  const r = await localPost(cfg, "/v1/embeddings", { input, model: model || cfg.embeddingModel });
  return { ok: true, embedding: r.embedding || r.data || r };
}

// POST /v1/document/analyze
export async function documentAnalyze(base44, { file_url, prompt, response_json_schema, model } = {}) {
  const cfg = getConfig();
  if (cfg.provider === "CLOUD") {
    return await base44.integrations.Core.InvokeLLM({ prompt: prompt || "Analyze this document.", file_urls: file_url ? [file_url] : undefined, response_json_schema, model: model || cfg.chatModel });
  }
  return await localPost(cfg, "/v1/document/analyze", { file_url, prompt, response_json_schema, model: model || cfg.chatModel });
}