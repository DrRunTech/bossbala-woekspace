import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Wand2, TrendingUp, AlertTriangle, ShieldCheck, Link2 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { formatDate } from "@/lib/bossai";

const TYPE_LABELS = {
  PROGRESS: "Project Progress",
  MEMBER_ACTIVITY: "Member Activity",
  WEEKLY_SUMMARY: "Weekly Summary",
  MONTHLY_SUMMARY: "Monthly Summary",
  TREND: "Trend Analysis",
  RISK: "Risk Detection",
  ANOMALY: "Anomaly Detection",
  ACTIVITY_COMPARISON: "Research Activity Comparison",
};

const TYPE_COLORS = {
  PROGRESS: "bg-blue-50 text-blue-700",
  MEMBER_ACTIVITY: "bg-violet-50 text-violet-700",
  WEEKLY_SUMMARY: "bg-emerald-50 text-emerald-700",
  MONTHLY_SUMMARY: "bg-teal-50 text-teal-700",
  TREND: "bg-amber-50 text-amber-700",
  RISK: "bg-rose-50 text-rose-700",
  ANOMALY: "bg-orange-50 text-orange-700",
  ACTIVITY_COMPARISON: "bg-indigo-50 text-indigo-700",
};

const SEVERITY_COLORS = {
  Low: "bg-slate-100 text-slate-600",
  Medium: "bg-amber-100 text-amber-700",
  High: "bg-orange-100 text-orange-700",
  Critical: "bg-rose-100 text-rose-700",
};

const NEEDS_MEMBER = ["MEMBER_ACTIVITY"];

export default function AIAnalysisPage() {
  const { members, projects, projectName, memberName } = useLookups();
  const [insights, setInsights] = useState(null);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [genType, setGenType] = useState("PROGRESS");
  const [genProject, setGenProject] = useState("");
  const [genMember, setGenMember] = useState("");
  const [generating, setGenerating] = useState(false);
  const [filters, setFilters] = useState({ type: "all", project: "all" });

  const load = async () => setInsights(await base44.entities.AIInsight.list("-created_date", 100));
  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => (insights || []).filter((a) =>
    (filters.type === "all" || a.type === filters.type) &&
    (filters.project === "all" || a.projectId === filters.project)
  ), [insights, filters]);

  const generate = async () => {
    setGenerating(true);
    try {
      await base44.functions.invoke("generateAnalysis", {
        type: genType,
        projectId: genProject || undefined,
        memberId: genMember || undefined,
      });
      setOpen(false);
      await load();
    } finally { setGenerating(false); }
  };

  return (
    <div>
      <PageHeader
        title="AI Analysis"
        subtitle="Evidence-first insights — every conclusion references real activities, tasks, files, or evidence."
        actions={<Button onClick={() => setOpen(true)}><Wand2 className="h-4 w-4 mr-1.5" /> Generate Analysis</Button>}
      />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Types</SelectItem>{Object.keys(TYPE_LABELS).map((s) => <SelectItem key={s} value={s}>{TYPE_LABELS[s]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.project} onValueChange={(v) => setFilters({ ...filters, project: v })}>
          <SelectTrigger className="w-48"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Projects</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!insights ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-40 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Sparkles} title="No analyses yet" description="Generate evidence-based analyses: project progress, member activity, weekly/monthly summaries, trends, risks, anomalies, and activity comparison. The AI never fabricates progress — if evidence is thin, it says so." action={<Button onClick={() => setOpen(true)}><Wand2 className="h-4 w-4 mr-1.5" /> Generate Analysis</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((a) => {
            const insufficient = a.summary === "Insufficient evidence.";
            return (
              <button key={a.id} onClick={() => setSelected(a)} className="text-left rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm hover:border-slate-300 transition-all">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[a.type] || "bg-slate-100 text-slate-600"}`}>{TYPE_LABELS[a.type] || a.type}</span>
                  <span className="text-xs text-slate-400">{formatDate(a.created_date)}</span>
                </div>
                {a.projectId && <div className="text-xs text-slate-400 mt-2">{projectName(a.projectId)}{a.memberId ? ` · ${memberName(a.memberId)}` : ""}</div>}
                <p className={`text-sm mt-2 line-clamp-3 ${insufficient ? "text-slate-400 italic" : "text-slate-700"}`}>{a.summary}</p>
                <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100 flex-wrap">
                  {!insufficient && <span className="flex items-center gap-1 text-xs text-slate-400"><TrendingUp className="h-3.5 w-3.5" /> {Math.round((a.confidence || 0) * 100)}%</span>}
                  <span className="flex items-center gap-1 text-xs text-slate-400"><Link2 className="h-3.5 w-3.5" /> {(a.evidenceRefs || []).length} refs</span>
                  {(a.risks || []).length > 0 && <span className="flex items-center gap-1 text-xs text-rose-500"><AlertTriangle className="h-3.5 w-3.5" /> {(a.risks || []).length} risks</span>}
                  {a.severity && a.severity !== "Low" && <span className={`text-xs px-1.5 py-0.5 rounded-full ${SEVERITY_COLORS[a.severity] || ""}`}>{a.severity}</span>}
                  {insufficient && <span className="text-xs text-amber-600">Insufficient evidence</span>}
                  <span className="text-xs text-slate-400 ml-auto">{a.period}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {selected && <InsightDetail insight={selected} onClose={() => setSelected(null)} projectName={projectName} memberName={memberName} />}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Generate AI Analysis</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <label className="text-sm font-medium text-slate-700">Analysis Type</label>
              <Select value={genType} onValueChange={setGenType}>
                <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>{Object.keys(TYPE_LABELS).map((s) => <SelectItem key={s} value={s}>{TYPE_LABELS[s]}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Project (optional)</label>
              <Select value={genProject} onValueChange={setGenProject}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="All projects" /></SelectTrigger>
                <SelectContent><SelectItem value={null}>All projects</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <label className="text-sm font-medium text-slate-700">Member (optional)</label>
              <Select value={genMember} onValueChange={setGenMember}>
                <SelectTrigger className="mt-1"><SelectValue placeholder="All members" /></SelectTrigger>
                <SelectContent><SelectItem value={null}>All members</SelectItem>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <p className="text-xs text-slate-400 flex items-start gap-1.5"><ShieldCheck className="h-3.5 w-3.5 mt-0.5 shrink-0" />Evidence-first: the AI identifies real activities, tasks, files, and evidence before drawing conclusions. If evidence is insufficient, it reports that honestly — never fabricated progress.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={generate} disabled={generating || (NEEDS_MEMBER.includes(genType) && !genMember)}>{generating ? "Analyzing…" : "Generate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InsightDetail({ insight, onClose, projectName, memberName }) {
  const insufficient = insight.summary === "Insufficient evidence.";
  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[82vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${TYPE_COLORS[insight.type] || "bg-slate-100 text-slate-600"}`}>{TYPE_LABELS[insight.type] || insight.type}</span>
            {insight.projectId && <span className="text-sm font-normal text-slate-500">{projectName(insight.projectId)}</span>}
            {insight.memberId && <span className="text-sm font-normal text-slate-500">· {memberName(insight.memberId)}</span>}
            <span className="text-xs font-normal text-slate-400 ml-auto">{insight.period}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5 text-sm"><TrendingUp className="h-4 w-4 text-blue-600" /> Confidence: <span className="font-medium">{Math.round((insight.confidence || 0) * 100)}%</span></div>
            {insight.severity && insight.severity !== "Low" && <span className={`text-xs px-2 py-0.5 rounded-full ${SEVERITY_COLORS[insight.severity]}`}>{insight.severity} severity</span>}
          </div>

          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Summary</h4>
            <p className={`text-sm ${insufficient ? "text-amber-600 italic" : "text-slate-700"}`}>{insight.summary}</p>
          </section>

          {insight.evidence && (
            <section>
              <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Evidence Identified</h4>
              <pre className="text-xs text-slate-600 whitespace-pre-wrap font-sans bg-slate-50 rounded-lg p-3 border border-slate-100">{insight.evidence}</pre>
            </section>
          )}

          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Evidence References</h4>
            <div className="flex flex-wrap gap-1.5">
              {(insight.evidenceRefs || []).length === 0 ? <span className="text-xs text-slate-400">No references.</span> :
                (insight.evidenceRefs || []).map((r) => <span key={r} className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-mono">{r}</span>)}
            </div>
          </section>

          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Risks</h4>
            {(insight.risks || []).length === 0 ? <p className="text-xs text-slate-400">None identified.</p> : (
              <ul className="space-y-2">
                {insight.risks.map((r, i) => (
                  <li key={i} className="text-sm text-slate-700 border border-slate-100 rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      {r.severity && <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${SEVERITY_COLORS[r.severity] || ""}`}>{r.severity}</span>}
                      <span>{r.description}</span>
                    </div>
                    {r.refIds?.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{r.refIds.map((id) => <span key={id} className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1 rounded">{id}</span>)}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <h4 className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-1">Recommendations</h4>
            {(insight.recommendations || []).length === 0 ? <p className="text-xs text-slate-400">None.</p> : (
              <ul className="space-y-2">
                {insight.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-slate-700 border border-slate-100 rounded-lg p-2.5">
                    <span>{i + 1}. {r.action}</span>
                    {r.refIds?.length > 0 && <div className="flex flex-wrap gap-1 mt-1.5">{r.refIds.map((id) => <span key={id} className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1 rounded">{id}</span>)}</div>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <details className="text-sm">
            <summary className="cursor-pointer text-slate-500 text-xs">Full report</summary>
            <div className="prose prose-sm max-w-none text-slate-700 mt-2"><ReactMarkdown>{insight.content}</ReactMarkdown></div>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
}