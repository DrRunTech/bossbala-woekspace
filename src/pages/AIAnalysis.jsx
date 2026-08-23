import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sparkles, Wand2, TrendingUp } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { formatDate, weekKey } from "@/lib/bossai";

const TYPE_LABELS = {
  ProjectProgress: "Project Progress",
  MemberPerformance: "Member Performance",
  RiskAssessment: "Risk Assessment",
  TrendAnalysis: "Trend Analysis",
  WeeklyDigest: "Weekly Digest",
  Recommendation: "Recommendation",
};

export default function AIAnalysisPage() {
  const { members, projects, projectName, memberName } = useLookups();
  const [analyses, setAnalyses] = useState(null);
  const [selected, setSelected] = useState(null);
  const [open, setOpen] = useState(false);
  const [genType, setGenType] = useState("ProjectProgress");
  const [genProject, setGenProject] = useState("");
  const [generating, setGenerating] = useState(false);
  const [filters, setFilters] = useState({ type: "all", project: "all" });

  const load = async () => setAnalyses(await base44.entities.AIAnalysis.list("-created_date", 100));
  useEffect(() => { load(); }, []);

  const filtered = (analyses || []).filter((a) =>
    (filters.type === "all" || a.type === filters.type) &&
    (filters.project === "all" || a.projectId === filters.project)
  );

  const generate = async () => {
    setGenerating(true);
    try {
      const pid = genProject || undefined;
      const [tasks, activities, risks] = await Promise.all([
        pid ? base44.entities.Task.filter({ projectId: pid }, "-created_date", 200) : base44.entities.Task.list("-created_date", 200),
        pid ? base44.entities.Activity.filter({ projectId: pid }, "-date", 100) : base44.entities.Activity.list("-date", 100),
        pid ? base44.entities.Risk.filter({ projectId: pid }, "-created_date", 100) : base44.entities.Risk.list("-created_date", 100),
      ]);

      const projName = pid ? projectName(pid) : "All projects";
      const taskSummary = tasks.map((t) => `- ${t.title} [${t.status}, ${t.priority}] assigned ${memberName(t.assigneeId)}${t.dueDate ? `, due ${formatDate(t.dueDate)}` : ""}`).join("\n");
      const actSummary = activities.slice(0, 30).map((a) => `- ${formatDate(a.date)} ${memberName(a.memberId)}: ${a.title} (${a.type}${a.durationMinutes ? `, ${a.durationMinutes}min` : ""})`).join("\n");
      const riskSummary = risks.map((r) => `- ${r.title} [${r.level}, ${r.status}]`).join("\n");

      const prompt = `You are BossAI, a research group analyst. Analyze the following research data and produce an objective ${TYPE_LABELS[genType]} analysis for "${projName}".

Tasks:
${taskSummary || "(none)"}

Recent activities:
${actSummary || "(none)"}

Risks:
${riskSummary || "(none)"}

Produce a concise, evidence-based analysis in Markdown with these sections:
## Summary
A 2-3 sentence objective summary.
## Progress
What progress the data shows.
## Risks & Concerns
Risks or concerns evident from the data.
## Recommendations
2-3 concrete, actionable recommendations.

Be specific and reference actual tasks, members, and activities. Do not speculate beyond the data. Be objective — let the research work speak for itself.`;

      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            content: { type: "string" },
            summary: { type: "string" },
            confidence: { type: "number" },
          },
        },
      });

      await base44.entities.AIAnalysis.create({
        type: genType,
        projectId: pid || undefined,
        content: res.content,
        summary: res.summary,
        confidence: res.confidence ?? 0.8,
        period: weekKey(),
        tags: [],
        status: "Published",
      });
      setOpen(false);
      await load();
    } finally { setGenerating(false); }
  };

  return (
    <div>
      <PageHeader
        title="AI Analysis"
        subtitle="Objective insights generated from collected research data"
        actions={<Button onClick={() => setOpen(true)} disabled={!projects.length && genType !== "WeeklyDigest"}><Wand2 className="h-4 w-4 mr-1.5" /> Generate Analysis</Button>}
      />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Types</SelectItem>{Object.keys(TYPE_LABELS).map((s) => <SelectItem key={s} value={s}>{TYPE_LABELS[s]}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.project} onValueChange={(v) => setFilters({ ...filters, project: v })}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Projects</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!analyses ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{[...Array(4)].map((_, i) => <div key={i} className="h-40 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Sparkles} title="No analyses yet" description="Generate AI analyses from your collected tasks, activities, and risks. The AI observes the data — it doesn't replace judgment." action={<Button onClick={() => setOpen(true)}><Wand2 className="h-4 w-4 mr-1.5" /> Generate Analysis</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filtered.map((a) => (
            <button key={a.id} onClick={() => setSelected(a)} className="text-left rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm hover:border-slate-300 transition-all">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{TYPE_LABELS[a.type]}</span>
                <span className="text-xs text-slate-400">{formatDate(a.created_date)}</span>
              </div>
              {a.projectId && <div className="text-xs text-slate-400 mt-2">{projectName(a.projectId)}</div>}
              <p className="text-sm text-slate-700 mt-2 line-clamp-3">{a.summary}</p>
              <div className="flex items-center gap-2 mt-3 pt-3 border-t border-slate-100">
                <div className="flex items-center gap-1 text-xs text-slate-400"><TrendingUp className="h-3.5 w-3.5" /> Confidence {Math.round((a.confidence || 0) * 100)}%</div>
                <span className="text-xs text-slate-400 ml-auto">{a.period}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span className="text-xs font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full">{TYPE_LABELS[selected.type]}</span>
                {selected.projectId && <span className="text-sm font-normal text-slate-400">{projectName(selected.projectId)}</span>}
              </DialogTitle>
            </DialogHeader>
            <div className="prose prose-sm max-w-none text-slate-700">
              <ReactMarkdown>{selected.content}</ReactMarkdown>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Generate */}
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
            <p className="text-xs text-slate-400">The AI reads your tasks, activities, and risks to produce an objective analysis. This may take a few seconds.</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={generate} disabled={generating}>{generating ? "Analyzing…" : "Generate"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}