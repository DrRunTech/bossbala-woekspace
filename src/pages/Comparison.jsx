import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { PageHeader } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { GitCompare, ArrowUp, ArrowDown, Minus, AlertCircle, Info, Loader2 } from "lucide-react";
import AiGatewayStatus from "@/components/AiGatewayStatus";
import { useLanguage } from "@/lib/i18n";

const TYPES = [
  "today_vs_yesterday",
  "this_week_vs_last_week",
  "this_month_vs_last_month",
  "project_vs_previous",
  "member_vs_previous",
];

export default function Comparison() {
  const { t } = useLanguage();
  const [type, setType] = useState("this_week_vs_last_week");
  const [projectId, setProjectId] = useState("");
  const [memberId, setMemberId] = useState("");
  const [projects, setProjects] = useState([]);
  const [members, setMembers] = useState([]);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    base44.entities.Project.list("name", 200).then(setProjects).catch(() => {});
    base44.entities.Member.list("name", 200).then(setMembers).catch(() => {});
  }, []);

  const run = async () => {
    setLoading(true); setResult(null);
    try {
      const payload = { comparisonType: type };
      if (type === "project_vs_previous" && projectId) payload.projectId = projectId;
      if (type === "member_vs_previous" && memberId) payload.memberId = memberId;
      const res = await base44.functions.invoke("comparePeriods", payload);
      setResult(res);
    } catch { setResult({ ok: false, error: t("cmp.failed") });
    } finally { setLoading(false); }
  };

  const needsProject = type === "project_vs_previous";
  const needsMember = type === "member_vs_previous";

  return (
    <div className="space-y-5">
      <PageHeader title={t("cmp.title")} subtitle={t("cmp.subtitle")} />
      <AiGatewayStatus variant="banner" />

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          <div className="md:col-span-2">
            <Label className="mb-1.5 block">{t("cmp.type")}</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{TYPES.map((v) => <SelectItem key={v} value={v}>{t("cmp.type." + v)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          {needsProject && (
            <div>
              <Label className="mb-1.5 block">{t("cmp.f.project")}</Label>
              <Select value={projectId} onValueChange={setProjectId}>
                <SelectTrigger><SelectValue placeholder={t("cmp.selectProject")} /></SelectTrigger>
                <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          {needsMember && (
            <div>
              <Label className="mb-1.5 block">{t("cmp.f.member")}</Label>
              <Select value={memberId} onValueChange={setMemberId}>
                <SelectTrigger><SelectValue placeholder={t("cmp.selectMember")} /></SelectTrigger>
                <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          )}
          <Button onClick={run} disabled={loading || (needsProject && !projectId) || (needsMember && !memberId)} className="w-full md:w-auto">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitCompare className="h-4 w-4" />} {t("cmp.run")}
          </Button>
        </div>
      </div>

      {loading && (
        <div className="bg-white rounded-xl border border-slate-200 p-10 flex items-center justify-center text-slate-400">
          <Loader2 className="h-5 w-5 animate-spin mr-2" /> {t("cmp.computing")}
        </div>
      )}

      {result && !result.ok && (
        <div className="bg-white rounded-xl border border-rose-200 p-5 text-sm text-rose-600 flex items-center gap-2"><AlertCircle className="h-4 w-4" /> {result.error}</div>
      )}

      {result && result.ok && (
        <ComparisonResult result={result} />
      )}
    </div>
  );
}

function ComparisonResult({ result }) {
  const { t } = useLanguage();
  const { metrics, summary, interpretation, limitations, confidence, period, scopeLabel, insufficient } = result;
  return (
    <div className="space-y-5">
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex items-center gap-2 text-xs text-slate-400 mb-1">
          <GitCompare className="h-3.5 w-3.5" /> {scopeLabel}
          <span className="ml-auto">{t("cmp.current")}: {period.current.start} → {period.current.end} · {t("cmp.previous")}: {period.previous.start} → {period.previous.end}</span>
        </div>
        <div className="flex items-center gap-3 mb-3">
          <h3 className="text-sm font-semibold text-slate-800">{t("cmp.aiSummary")}</h3>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            {t("cmp.confidence")} {Math.round((confidence || 0) * 100)}%
            <div className="h-1.5 w-20 rounded-full bg-slate-200 overflow-hidden"><div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.round((confidence || 0) * 100)}%` }} /></div>
          </div>
        </div>
        <p className={`text-sm ${insufficient ? "text-amber-600 italic" : "text-slate-700"}`}>{summary}</p>
        {interpretation && <p className="text-sm text-slate-600 mt-2">{interpretation}</p>}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-800">{t("cmp.metrics")}</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-100">
          {metrics.map((m) => <MetricCell key={m.label} m={m} />)}
        </div>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-800 mb-3 flex items-center gap-1.5"><Info className="h-4 w-4 text-slate-400" /> {t("cmp.limitations")}</h3>
        <ul className="space-y-2">
          {limitations.map((l, i) => (
            <li key={i} className="text-sm text-slate-600 flex gap-2"><span className="text-slate-300">•</span><span>{l}</span></li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function MetricCell({ m }) {
  const { t } = useLanguage();
  const dirIcon = m.snapshot ? null : m.direction === "up" ? <ArrowUp className="h-3.5 w-3.5 text-emerald-600" /> : m.direction === "down" ? <ArrowDown className="h-3.5 w-3.5 text-rose-600" /> : <Minus className="h-3.5 w-3.5 text-slate-400" />;
  const changeColor = m.snapshot ? "text-slate-400" : m.direction === "up" ? "text-emerald-600" : m.direction === "down" ? "text-rose-600" : "text-slate-400";
  return (
    <div className="bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-600">{m.label}</span>
        {m.snapshot && <span className="text-[10px] uppercase tracking-wide text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">{t("cmp.snapshot")}</span>}
      </div>
      <div className="flex items-end gap-3 mt-2">
        <div>
          <div className="text-[11px] text-slate-400">{t("cmp.current")}</div>
          <div className="text-xl font-semibold text-slate-900">{m.current}{m.unit}</div>
        </div>
        <div>
          <div className="text-[11px] text-slate-400">{t("cmp.previous")}</div>
          <div className="text-xl font-semibold text-slate-400">{m.snapshot ? "—" : m.previous}{m.unit}</div>
        </div>
        {!m.snapshot && (
          <div className={`flex items-center gap-1 text-sm font-medium ${changeColor} ml-auto`}>
            {dirIcon}
            {m.change > 0 ? "+" : ""}{m.change}
            {m.changePct !== null && <span className="text-xs">({m.changePct > 0 ? "+" : ""}{m.changePct}%)</span>}
          </div>
        )}
      </div>
    </div>
  );
}