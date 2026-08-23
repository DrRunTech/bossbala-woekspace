import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Server, Cloud, CheckCircle2, AlertTriangle, RefreshCw, Loader2 } from "lucide-react";

// Surfaces the configured AI Gateway status. Banner variant (on AI pages) only
// renders when there's something to report (local gateway online/unavailable).
// Card variant (Settings) shows full provider/config status. The frontend calls
// the secure aiGateway backend function; it never touches the local server directly.

export default function AiGatewayStatus({ variant = "banner" }) {
  const [status, setStatus] = useState(null);
  const [models, setModels] = useState(null);
  const [loading, setLoading] = useState(true);

  const check = async () => {
    setLoading(true);
    try {
      const r = await base44.functions.invoke("aiGateway", { action: "health" });
      const s = r?.data ?? r;
      setStatus(s);
      if (s?.provider === "LOCAL") {
        const m = await base44.functions.invoke("aiGateway", { action: "models" });
        setModels(m?.data ?? m);
      } else setModels(null);
    } catch (e) {
      setStatus({ ok: false, provider: "CLOUD", status: "error", message: String(e?.message || e) });
    } finally { setLoading(false); }
  };

  useEffect(() => { check(); }, []);

  if (loading) return variant === "banner" ? null : <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 className="h-4 w-4 animate-spin" /> Checking AI gateway…</div>;

  const isCloud = (status?.provider || "CLOUD") !== "LOCAL";
  const online = !!status?.ok;
  const unavail = !isCloud && !online;

  if (variant === "banner") {
    if (isCloud) return null;
    if (online) return (
      <div className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
        <CheckCircle2 className="h-3.5 w-3.5" /> AI gateway: Local — online
      </div>
    );
    return (
      <div className="flex items-start gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 mb-3">
        <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
        <div>
          <div className="font-semibold">Local AI gateway unavailable</div>
          <div className="text-amber-700">{status?.message || "The configured local AI server is not reachable."} AI features that depend on it may not work until it is back online.</div>
        </div>
      </div>
    );
  }

  // Card variant (Settings)
  return (
    <div>
      <div className="flex items-center gap-2 mb-4">
        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${isCloud ? "bg-blue-50 text-blue-700" : "bg-violet-50 text-violet-700"}`}>
          {isCloud ? <Cloud className="h-4 w-4" /> : <Server className="h-4 w-4" />}
        </div>
        <h2 className="text-sm font-semibold text-slate-800">AI Gateway</h2>
        <Button variant="ghost" size="sm" onClick={check} className="ml-auto h-7 px-2 text-xs"><RefreshCw className="h-3.5 w-3.5" /> Refresh</Button>
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <Row label="Provider" value={isCloud ? "Cloud (Base44 Core)" : "Local gateway"} />
        <Row label="Status" value={online ? "Online" : (status?.status || "Unknown")} color={online ? "text-emerald-600" : "text-amber-600"} />
        <Row label="Chat model" value={status?.detail?.chat_model || "automatic"} />
        <Row label="Embedding model" value={status?.detail?.embedding_model || "—"} />
      </div>
      {unavail && (
        <div className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 flex gap-2"><AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />{status.message}</div>
      )}
      {models?.models?.length > 0 && (
        <div className="mt-3">
          <div className="text-xs text-slate-400 mb-1.5">Available models</div>
          <div className="flex flex-wrap gap-1.5">{models.models.map((m, i) => <span key={i} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full">{typeof m === "string" ? m : (m.id || m.name)}</span>)}</div>
        </div>
      )}
      <p className="mt-4 text-xs text-slate-400">All AI requests pass securely through the backend — API keys are never exposed to the browser. Configure the provider and local endpoint via app secrets: <code className="text-slate-500">AI_PROVIDER</code>, <code className="text-slate-500">LOCAL_AI_BASE_URL</code>, <code className="text-slate-500">LOCAL_AI_API_KEY</code>, <code className="text-slate-500">CHAT_MODEL</code>, <code className="text-slate-500">EMBEDDING_MODEL</code>.</p>
    </div>
  );
}

function Row({ label, value, color }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className={`text-sm font-medium ${color || "text-slate-700"}`}>{value || "—"}</div>
    </div>
  );
}