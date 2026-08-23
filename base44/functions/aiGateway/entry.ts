import { createClientFromRequest } from 'npm:@base44/sdk@0.8.43';
import * as gateway from '../../shared/aiGateway.ts';

// Secure AI Gateway proxy. The frontend never reaches a local AI server directly —
// every AI request goes through this backend function, which dispatches to the
// configured provider (CLOUD or LOCAL) via the shared aiGateway module. API keys
// are read from secrets on the backend and never returned to the browser.

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
      default:
        return Response.json({ error: `unknown action: ${action}` }, { status: 400 });
    }
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}