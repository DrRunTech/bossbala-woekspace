import { createClientFromRequest } from 'npm:@base44/sdk@0.8.43';
import * as gateway from '../../shared/aiGateway.ts';

// Secure AI Gateway proxy. The frontend never reaches a local AI server
// directly — every AI request goes through this backend function, which
// dispatches to the configured provider (CLOUD or LOCAL) via the shared
// aiGateway module. LOCAL_AI_GATEWAY_API_KEY is read from secrets on the
// backend and is NEVER returned to the browser.

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const body = await req.json();
    const action = body.action;

    switch (action) {
      case 'health':
        return Response.json({ ok: true, ...await gateway.health() });
      case 'models':
        return Response.json({ ok: true, ...await gateway.models() });
      case 'chat':
        return Response.json({ ok: true, content: await gateway.chat(base44, body) });
      case 'analyze':
        return Response.json({ ok: true, result: await gateway.analyze(base44, body) });
      case 'embed':
        return Response.json(await gateway.embed(base44, body));
      case 'document_analyze':
        return Response.json({ ok: true, result: await gateway.documentAnalyze(base44, body) });
      case 'status':
        return Response.json(await buildStatus());
      case 'test':
        return Response.json(await runTest());
      default:
        return Response.json({ error: `unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// Safe status payload for the AI Infrastructure admin panel.
// Returns only non-sensitive config: provider, gateway URL (host shown),
// booleans for key presence, model names, live gateway/ollama status, and
// the model list. The API key itself is never included.
async function buildStatus() {
  const cfg = gateway.getConfig();
  const safe = {
    provider: cfg.provider,
    gatewayUrl: cfg.provider === 'LOCAL' ? cfg.baseUrl : '',
    configured: cfg.provider === 'LOCAL' ? (!!cfg.baseUrl && cfg.hasKey) : true,
    hasKey: cfg.hasKey,
    chatModel: cfg.chatModel,
    analysisModel: cfg.analysisModel,
    reasoningModel: cfg.reasoningModel,
    embeddingModel: cfg.embeddingModel,
  };
  if (cfg.provider !== 'LOCAL') {
    return { ok: true, ...safe, gatewayStatus: 'n/a (cloud)', ollamaStatus: 'n/a', models: [], message: null };
  }
  const [h, m] = await Promise.all([
    gateway.LocalAIGatewayService.health(),
    gateway.LocalAIGatewayService.listModels(),
  ]);
  return {
    ok: !!h.ok,
    ...safe,
    gatewayStatus: h.ok ? 'online' : (h.status || 'offline'),
    ollamaStatus: h.ollama || (h.ok ? 'online' : 'unknown'),
    models: m.ok ? m.models : [],
    message: h.error || m.error || null,
    kind: h.kind || null,
  };
}

// Connection test: health check + a minimal chat ping. Never returns the key.
async function runTest() {
  const cfg = gateway.getConfig();
  if (cfg.provider !== 'LOCAL') {
    return { ok: true, provider: 'CLOUD', gatewayStatus: 'n/a', chat: null, message: 'Cloud provider is active. Set AI_PROVIDER=LOCAL to test the Local AI Gateway.' };
  }
  const h = await gateway.LocalAIGatewayService.health();
  let chat = null;
  if (h.ok) {
    chat = await gateway.LocalAIGatewayService.chat({ messages: [{ role: 'user', content: 'ping' }], model: cfg.chatModel });
  }
  return {
    ok: !!(h.ok && chat?.ok),
    provider: 'LOCAL',
    gateway: { ok: h.ok, status: h.status, ollama: h.ollama },
    chat: chat ? { ok: chat.ok, content: (chat.content || '').toString().slice(0, 120) } : null,
    message: !h.ok
      ? (h.error || 'Gateway unreachable.')
      : (chat?.ok ? 'Connection successful — gateway online and chat responded.' : 'Gateway online but chat failed: ' + (chat?.error || 'unknown')),
  };
}