import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import { PageHeader, SkeletonCard } from "@/components/EmptyState";
import { StatusBadge, RiskBadge, ProgressBar, PriorityBadge, Avatar, TypeBadge } from "@/components/ui/badges";
import { formatDate, relativeTime, daysUntil, ACTIVITY_TYPE_COLORS, formatDuration } from "@/lib/bossai";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Calendar, FileText, ShieldAlert, Plus, Sparkles, Wand2, Gavel, Activity as ActivityIcon, ListChecks, LayoutDashboard, ChevronRight } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const SEVERITY_COLORS = { Critical: "bg-rose-50 text-rose-700", High: "bg-orange-50 text-orange-700", Medium: "bg-amber-50 text-amber-700", Low: "bg-slate-50 text-slate-600" };
const DECISION_TYPES = ["Direction", "Resource", "Scope", "Timeline", "Personnel", "Risk", "Other"];
const DECISION_STATUSES = ["Proposed", "Approved", "Rejected", "Implemented", "Superseded"];
const IMPACTS = ["Low", "Medium", "High"];
const emptyDecision = { title: "", decisionType: "Direction", impact: "Medium", status: "Approved", rationale: "" };

function Fact({ label, children }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="text-sm text-slate-800 mt-0.5">{children || "—"}</div>
    </div>
  );
}

export default function ProjectDetail() {
  const { id } = useParams();
  const { memberName, memberById } = useLookups();
  const { t } = useLanguage();
  const enumLabel = (k) => (k ? t("enum." + k) : k);
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [activities, setActivities] = useState([]);
  const [files, setFiles] = useState([]);
  const [risks, setRisks] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [decOpen, setDecOpen] = useState(false);
  const [decForm, setDecForm] = useState(emptyDecision);

  const load = async () => {
    setLoading(true);
    try {
      const [p, t, a, f, r, dec, ins] = await Promise.all([
        base44.entities.Project.get(id),
        base44.entities.Task.filter({ projectId: id }, "-created_date", 200),
        base44.entities.Activity.filter({ projectId: id }, "-date", 50),
        base44.entities.FileAsset.filter({ projectId: id }, "-created_date", 100),
        base44.entities.Risk.filter({ projectId: id }, "-created_date", 100),
        base44.entities.Decision.filter({ projectId: id }, "-decidedAt", 50),
        base44.entities.AIInsight.filter({ projectId: id }, "-created_date", 20),
      ]);
      setProject(p); setTasks(t); setActivities(a); setFiles(f); setRisks(r); setDecisions(dec); setInsights(ins);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);

  const progress = tasks.length ? Math.round((tasks.filter((t) => t.status === "COMPLETED").length / tasks.length) * 100) : 0;
  const completedCount = tasks.filter((t) => t.status === "COMPLETED").length;
  const openCount = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED").length;
  const blockedCount = tasks.filter((t) => t.status === "BLOCKED").length;
  const owner = memberById(project?.leadId);
  const evidenceFiles = files.filter((f) => f.isEvidence);
  const latestInsight = insights[0];

  const generateAnalysis = async () => {
    setGenerating(true);
    try {
      const taskLines = tasks.map((t) => `- ${t.title} [${t.status}, ${t.priority}] assignee=${memberName(t.assigneeId)}${t.dueDate ? ` due=${formatDate(t.dueDate)}` : ""}`).join("\n");
      const actLines = activities.slice(0, 20).map((a) => `- ${formatDate(a.date)} ${memberName(a.memberId)}: ${a.title} (${a.type})`).join("\n");
      const riskLines = risks.map((r) => `- ${r.title} [${r.level}, ${r.status}]`).join("\n");
      const prompt = `You are BossAI, a research group analyst. Analyze the project "${project.name}" objectively based ONLY on this data.
${project.description ? `\nDescription: ${project.description}\n` : ""}
Tasks:
${taskLines || "(none)"}

Recent activities:
${actLines || "(none)"}

Risks:
${riskLines || "(none)"}

Produce an objective project analysis. Return JSON with: content (Markdown with ## Summary, ## Progress, ## Risks & Concerns, ## Recommendations), summary (one sentence), confidence (0-1), severity (Low|Medium|High|Critical).`;
      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: { type: "object", properties: { content: { type: "string" }, summary: { type: "string" }, confidence: { type: "number" }, severity: { type: "string" } } },
      });
      await base44.entities.AIInsight.create({
        organizationId: project.organizationId,
        type: "PROGRESS",
        projectId: id,
        content: res.content,
        summary: res.summary,
        confidence: res.confidence ?? 0.8,
        severity: res.severity || "Medium",
        period: new Date().toISOString().slice(0, 10),
        status: "Published",
      });
      await load();
    } finally {
      setGenerating(false);
    }
  };

  const addDecision = async () => {
    if (!decForm.title.trim()) return;
    const me = await base44.auth.me();
    await base44.entities.Decision.create({
      ...decForm,
      projectId: id,
      organizationId: project.organizationId,
      decidedBy: me.id,
      decidedAt: new Date().toISOString(),
      relatedInsightIds: [],
      relatedEvidenceIds: [],
      tags: [],
    });
    setDecForm(emptyDecision);
    setDecOpen(false);
    await load();
  };

  if (loading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>;
  if (!project) return <div className="text-slate-500">{t("pd.notFound")}</div>;

  const tabCount = (n) => (n ? ` (${n})` : "");

  return (
    <div>
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="h-4 w-4" /> {t("pd.back")}
      </Link>
      <PageHeader
        title={project.name}
        subtitle={project.description}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            {project.riskLevel && project.riskLevel !== "Low" && <RiskBadge level={project.riskLevel} />}
          </div>
        }
      />

      <Tabs defaultValue="overview">
        <TabsList className="flex-wrap h-auto">
          <TabsTrigger value="overview"><LayoutDashboard className="h-3.5 w-3.5 mr-1.5" />{t("pd.tab.overview")}</TabsTrigger>
          <TabsTrigger value="tasks"><ListChecks className="h-3.5 w-3.5 mr-1.5" />{t("pd.tab.tasks")}{tabCount(tasks.length)}</TabsTrigger>
          <TabsTrigger value="files"><FileText className="h-3.5 w-3.5 mr-1.5" />{t("pd.tab.files")}{tabCount(files.length)}</TabsTrigger>
          <TabsTrigger value="activities"><ActivityIcon className="h-3.5 w-3.5 mr-1.5" />{t("pd.tab.activities")}{tabCount(activities.length)}</TabsTrigger>
          <TabsTrigger value="ai"><Sparkles className="h-3.5 w-3.5 mr-1.5" />{t("pd.tab.ai")}{tabCount(insights.length)}</TabsTrigger>
          <TabsTrigger value="risks"><ShieldAlert className="h-3.5 w-3.5 mr-1.5" />{t("pd.tab.risks")}{tabCount(risks.length)}</TabsTrigger>
          <TabsTrigger value="decisions"><Gavel className="h-3.5 w-3.5 mr-1.5" />{t("pd.tab.decisions")}{tabCount(decisions.length)}</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="mt-5">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              {/* Key facts + progress */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Fact label={t("pd.fact.owner")}>{owner ? owner.name : project.principalInvestigator || t("pd.fact.unassigned")}</Fact>
                  <Fact label={t("pd.fact.status")}><StatusBadge status={project.status} /></Fact>
                  <Fact label={t("pd.fact.priority")}><PriorityBadge priority={project.priority} /></Fact>
                  <Fact label={t("pd.fact.targetDate")}>{formatDate(project.endDate)}</Fact>
                  <Fact label={t("pd.fact.startDate")}>{formatDate(project.startDate)}</Fact>
                  <Fact label={t("pd.fact.funding")}>{project.fundingSource || "—"}</Fact>
                </div>
                <div className="mt-5 pt-5 border-t border-slate-100">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-semibold text-slate-800">{t("pd.progress")}</h3>
                    <span className="text-sm font-medium text-slate-600">{progress}%</span>
                  </div>
                  <ProgressBar value={progress} />
                  <div className="grid grid-cols-3 gap-4 mt-4 text-center">
                    <div className="rounded-lg bg-slate-50 py-2"><div className="text-lg font-semibold text-slate-800">{completedCount}</div><div className="text-xs text-slate-400">{t("pd.stat.completed")}</div></div>
                    <div className="rounded-lg bg-slate-50 py-2"><div className="text-lg font-semibold text-slate-800">{openCount}</div><div className="text-xs text-slate-400">{t("pd.stat.open")}</div></div>
                    <div className="rounded-lg bg-rose-50 py-2"><div className="text-lg font-semibold text-rose-700">{blockedCount}</div><div className="text-xs text-rose-400">{t("pd.stat.blocked")}</div></div>
                  </div>
                </div>
              </div>

              {/* AI summary */}
              <div className="rounded-xl border border-slate-200 bg-white p-5">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Sparkles className="h-4 w-4 text-blue-700" /> {t("pd.aiSummary")}</h3>
                  <Button size="sm" variant="outline" onClick={generateAnalysis} disabled={generating}>
                    <Wand2 className="h-3.5 w-3.5 mr-1.5" /> {generating ? t("pd.analyzing") : latestInsight ? t("pd.regenerate") : t("pd.generate")}
                  </Button>
                </div>
                {latestInsight ? (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${SEVERITY_COLORS[latestInsight.severity] || SEVERITY_COLORS.Low}`}>{enumLabel(latestInsight.severity)}</span>
                      <span className="text-xs text-slate-400">{t("pd.confidence")} {Math.round((latestInsight.confidence || 0) * 100)}% · {formatDate(latestInsight.created_date)}</span>
                    </div>
                    <p className="text-sm text-slate-700">{latestInsight.summary}</p>
                  </div>
                ) : (
                  <p className="text-sm text-slate-400">{t("pd.aiEmpty")}</p>
                )}
              </div>

              {/* Recent activities */}
              <div className="rounded-xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                  <h3 className="text-sm font-semibold text-slate-800">{t("pd.recentActivities")}</h3>
                </div>
                {activities.length === 0 ? <div className="px-5 py-8 text-center text-sm text-slate-400">{t("pd.noActivities")}</div> : (
                  <div className="divide-y divide-slate-50">
                    {activities.slice(0, 4).map((a) => {
                      const m = memberById(a.memberId);
                      return (
                        <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                          <Avatar name={m?.name} src={m?.avatarUrl} size={28} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium text-slate-800">{m?.name || "—"}</span>
                              <TypeBadge type={a.type} />
                              <span className="text-xs text-slate-400">{relativeTime(a.date)}</span>
                            </div>
                            <div className="text-sm text-slate-600 truncate">{a.title}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Recent evidence */}
            <div className="rounded-xl border border-slate-200 bg-white">
              <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
                <h3 className="text-sm font-semibold text-slate-800">{t("pd.recentEvidence")}</h3>
              </div>
              <div className="p-3">
                {evidenceFiles.length === 0 ? (
                  <div className="px-2 py-8 text-center text-sm text-slate-400">{t("pd.noEvidence")}</div>
                ) : (
                  evidenceFiles.slice(0, 6).map((f) => (
                    <div key={f.id} className="flex items-center gap-3 px-2 py-2.5">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 shrink-0"><FileText className="h-4 w-4" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-800 truncate">{f.name}</div>
                        <div className="text-xs text-slate-400">{enumLabel(f.category || f.type)} · {f.created_date ? relativeTime(f.created_date) : ""}</div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* TASKS */}
        <TabsContent value="tasks" className="mt-5">
          {tasks.length === 0 ? <div className="text-sm text-slate-400 py-12 text-center">{t("pd.noTasks")}</div> : (
            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
              {tasks.map((t) => (
                <Link key={t.id} to="/tasks" className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50">
                  <PriorityBadge priority={t.priority} />
                  <span className="text-sm text-slate-800 flex-1 truncate">{t.title}</span>
                  <StatusBadge status={t.status} />
                  <span className="text-xs text-slate-400 w-28 text-right truncate">{memberName(t.assigneeId)}</span>
                </Link>
              ))}
            </div>
          )}
        </TabsContent>

        {/* FILES */}
        <TabsContent value="files" className="mt-5">
          {files.length === 0 ? <div className="text-sm text-slate-400 py-12 text-center">{t("pd.noFiles")}</div> : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {files.map((f) => (
                <div key={f.id} className="rounded-lg border border-slate-200 bg-white p-4 flex items-start gap-3">
                  <div className={`flex h-9 w-9 items-center justify-center rounded-lg shrink-0 ${f.isEvidence ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}><FileText className="h-4 w-4" /></div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-slate-800 truncate">{f.name}</div>
                    <div className="text-xs text-slate-400">{enumLabel(f.type)}{f.isEvidence ? ` · ${t("common.evidence")}` : ""} · {f.created_date ? relativeTime(f.created_date) : ""}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ACTIVITIES */}
        <TabsContent value="activities" className="mt-5">
          {activities.length === 0 ? <div className="text-sm text-slate-400 py-12 text-center">{t("pd.noActivities")}</div> : (
            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
              {activities.map((a) => {
                const m = memberById(a.memberId);
                return (
                  <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                    <Avatar name={m?.name} src={m?.avatarUrl} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">{m?.name || "—"}</span>
                        <TypeBadge type={a.type} />
                        <span className="text-xs text-slate-400">{relativeTime(a.date)}</span>
                      </div>
                      <div className="text-sm text-slate-600">{a.title}</div>
                      {a.durationMinutes ? <div className="text-xs text-slate-400">{formatDuration(a.durationMinutes)}</div> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* AI ANALYSIS */}
        <TabsContent value="ai" className="mt-5">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm text-slate-500">{t("pd.aiInsightsFor")}</p>
            <Button onClick={generateAnalysis} disabled={generating}><Wand2 className="h-4 w-4 mr-1.5" /> {generating ? t("pd.analyzing") : t("pd.generateAnalysis")}</Button>
          </div>
          {insights.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center text-sm text-slate-400">{t("pd.aiEmpty2")}</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {insights.map((i) => (
                <div key={i.id} className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">{enumLabel(i.type)}</span>
                    <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${SEVERITY_COLORS[i.severity] || SEVERITY_COLORS.Low}`}>{enumLabel(i.severity)}</span>
                  </div>
                  <p className="text-sm font-medium text-slate-800 mt-3">{i.summary}</p>
                  <p className="text-sm text-slate-600 mt-2 line-clamp-4 whitespace-pre-line">{i.content}</p>
                  <div className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-50">{t("pd.confidence")} {Math.round((i.confidence || 0) * 100)}% · {formatDate(i.created_date)}</div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* RISKS */}
        <TabsContent value="risks" className="mt-5">
          <div className="flex items-center justify-end mb-4">
            <Button variant="outline" asChild><Link to="/risks"><ShieldAlert className="h-4 w-4 mr-1.5" /> {t("pd.manageRisks")}</Link></Button>
          </div>
          {risks.length === 0 ? <div className="text-sm text-slate-400 py-12 text-center">{t("pd.noRisks")}</div> : (
            <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
              {risks.map((r) => (
                <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                  <ShieldAlert className="h-4 w-4 text-rose-500 shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800 truncate">{r.title}</div>
                    {r.mitigation && <div className="text-xs text-slate-400 truncate">{t("pd.mitigation")}: {r.mitigation}</div>}
                  </div>
                  <RiskBadge level={r.level} />
                  <StatusBadge status={r.status} />
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* DECISIONS */}
        <TabsContent value="decisions" className="mt-5">
          <div className="flex items-center justify-end mb-4">
            <Button onClick={() => setDecOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> {t("pd.logDecision")}</Button>
          </div>
          {decisions.length === 0 ? <div className="text-sm text-slate-400 py-12 text-center">{t("pd.noDecisions")}</div> : (
            <div className="space-y-3">
              {decisions.map((d) => (
                <div key={d.id} className="rounded-xl border border-slate-200 bg-white p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-800">{d.title}</div>
                      {d.rationale && <p className="text-sm text-slate-600 mt-1">{d.rationale}</p>}
                    </div>
                    <StatusBadge status={d.status} />
                  </div>
                  <div className="flex items-center gap-3 mt-3 text-xs text-slate-400">
                    <span className="text-slate-500 font-medium">{enumLabel(d.decisionType)}</span>
                    <span>·</span>
                    <span>{t("pd.impact")} {enumLabel(d.impact)}</span>
                    <span>·</span>
                    <span>{t("pd.by")} {memberName(d.decidedBy)}</span>
                    {d.decidedAt && <><span>·</span><span>{formatDate(d.decidedAt)}</span></>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={decOpen} onOpenChange={setDecOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("pd.dlg.title")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>{t("pd.dlg.f.title")}</Label><Input value={decForm.title} onChange={(e) => setDecForm({ ...decForm, title: e.target.value })} placeholder={t("pd.dlg.titlePh")} /></div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>{t("pd.dlg.f.type")}</Label>
                <Select value={decForm.decisionType} onValueChange={(v) => setDecForm({ ...decForm, decisionType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DECISION_TYPES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("pd.dlg.f.impact")}</Label>
                <Select value={decForm.impact} onValueChange={(v) => setDecForm({ ...decForm, impact: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{IMPACTS.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("pd.dlg.f.status")}</Label>
                <Select value={decForm.status} onValueChange={(v) => setDecForm({ ...decForm, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{DECISION_STATUSES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>{t("pd.dlg.f.rationale")}</Label><Textarea rows={3} value={decForm.rationale} onChange={(e) => setDecForm({ ...decForm, rationale: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDecOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={addDecision} disabled={!decForm.title.trim()}>{t("pd.logDecision")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}