import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Server, Boxes, Activity, ShieldCheck, RefreshCw, Loader2, CheckCircle2, AlertTriangle, XCircle, Network } from "lucide-react";

// AI Infrastructure admin panel (Settings). Surfaces the Local AI Gateway
// status surfaced through the secure aiGateway backend function. The API key
// is never displayed; only a boolean "configured/hidden" indicator is shown.
// Base44 never calls Ollama directly — all data comes from the backend proxy.

const STATUS_STYLE = {
  online: { color: "text-emerald-600", Icon: CheckCircle2 },
  offline: { color: "text-amber-600", Icon: AlertTriangle },
  unreachable: { color: "text-red-600", Icon: XCircle },
  auth_error: { color: "text-red-600", Icon: XCircle },
  unconfigured: { color: "text-slate-400", Icon: AlertTriangle },
  unknown: { color: "text-slate-400", Icon: Activity },
  "n/a": { color: "text-slate-400", Icon: Activity },
  "n/a (cloud)": { color: "text-slate-400", Icon: Activity },
};

function StatusPill({ value }) {
  const v = (value || "unknown").toString();
  const s = STATUS_STYLE[v] || { color: "text-slate-500", Icon: Activity };
  const { Icon } = s;
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm font-medium ${s.color}`}>
      <Icon className="h-3.5 w-3.5" />{v}
    </span>
  );
}

function Field({ label, value, mono }) {
  return (
    <div>
      <div className="text-xs text-slate-400 mb-1">{label}</div>
      <div className={`text-sm font-medium text-slate-800 ${mono ? "font-mono text-xs break-all" : ""}`}>{value || "—"}</div>
    </div>
  );
}

export default function AiInfrastructure() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);

  const unwrap = (r) => (r && typeof r === "object" && "data" in r ? r.data : r);

  const load = async () => {
    setLoading(true);
    try {
      const r = await base44.functions.invoke("aiGateway", { action: "status" });
      setStatus(unwrap(r));
    } catch (e) {
      setStatus({ ok: false, provider: "LOCAL", gatewayStatus: "unreachable", message: String(e?.message || e) });
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await base44.functions.invoke("aiGateway", { action: "test" });
      setTestResult(unwrap(r));
    } catch (e) {
      setTestResult({ ok: false, message: String(e?.message || e) });
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => { load(); }, []);

  const isLocal = status?.provider === "LOCAL";

  return (
    <Card className="p-5">
      <div className="flex items-center gap-2 mb-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><Server className="h-4 w-4" /></div>
        <h2 className="text-sm font-semibold text-slate-800">AI Infrastructure</h2>
        <Button variant="ghost" size="sm" onClick={load} className="ml-auto h-7 px-2 text-xs" disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Checking gateway…</div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Gateway URL" value={isLocal ? status.gatewayUrl : "Cloud (Base44 Core)"} mono />
            <div>
              <div className="text-xs text-slate-400 mb-1">Gateway Status</div>
              <StatusPill value={isLocal ? status.gatewayStatus : "n/a (cloud)"} />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">Ollama Status</div>
              <StatusPill value={isLocal ? status.ollamaStatus : "n/a"} />
            </div>
            <div>
              <div className="text-xs text-slate-400 mb-1">API Key</div>
              <div className="text-sm font-medium text-slate-500 flex items-center gap-1.5">
                <ShieldCheck className={`h-3.5 w-3.5 ${status.hasKey ? "text-emerald-500" : "text-slate-300"}`} />
                {status.hasKey ? "Configured (hidden)" : "Not set"}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 pt-4 border-t border-slate-100">
            <Field label="Default Chat Model" value={status.chatModel} />
            <Field label="Research Analysis Model" value={status.analysisModel} />
            <Field label="Reasoning Model" value={status.reasoningModel} />
            <Field label="Embedding Model" value={status.embeddingModel} />
          </div>

          <div className="mt-5 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-400"><Boxes className="h-3.5 w-3.5" /> Available Models</div>
            {isLocal && status.models?.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {status.models.map((m, i) => (
                  <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-mono">{m}</span>
                ))}
              </div>
            ) : (
              <div className="text-xs text-slate-400">{isLocal ? "No models returned by gateway." : "Model list is only available for the Local provider."}</div>
            )}
          </div>

          <div className="mt-5 flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={runTest} disabled={testing || !isLocal}>
              {testing ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
              Test Connection
            </Button>
            {testResult && (
              <span className={`text-xs flex items-center gap-1.5 ${testResult.ok ? "text-emerald-600" : "text-red-600"}`}>
                {testResult.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <XCircle className="h-3.5 w-3.5" />}
                {testResult.message}
              </span>
            )}
          </div>

          {!isLocal && (
            <div className="mt-4 text-xs text-slate-400 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              Cloud provider is active. Set <code className="text-slate-500">AI_PROVIDER=LOCAL</code> and configure <code className="text-slate-500">LOCAL_AI_GATEWAY_URL</code> / <code className="text-slate-500">LOCAL_AI_GATEWAY_API_KEY</code> secrets to use the Local AI Gateway.
            </div>
          )}
          {isLocal && !status.ok && status.message && (
            <div className="mt-4 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{status.message}
            </div>
          )}

          <p className="mt-4 text-xs text-slate-400 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5" /> All requests are proxied server-side through the Local AI Gateway. The API key is never exposed to the browser, and Base44 never calls Ollama directly.
          </p>
        </>
      )}
    </Card>
  );
}