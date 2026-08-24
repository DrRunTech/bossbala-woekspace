import React, { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader, SkeletonCard } from "@/components/EmptyState";
import { StatusBadge, RiskBadge, ProgressBar, Avatar, PriorityBadge } from "@/components/ui/badges";
import { isToday, isThisWeek, relativeTime, formatDate, daysUntil, formatDuration, ACTIVITY_TYPE_COLORS } from "@/lib/bossai";
import { useLanguage } from "@/lib/i18n";
import { Sparkles, Send, AlertTriangle, Clock, FolderKanban, ListChecks, Activity as ActivityIcon, Building2, FileCheck2, Users, ArrowRight, TrendingDown, ChevronRight, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";

const SEVERITY_COLORS = {
  Critical: "bg-rose-50 text-rose-700",
  High: "bg-orange-50 text-orange-700",
  Medium: "bg-amber-50 text-amber-700",
  Low: "bg-slate-50 text-slate-600"
};
const INSIGHT_TYPE_LABELS = {
  SUMMARY: "Summary", PROGRESS: "Progress", RISK: "Risk", ANOMALY: "Anomaly",
  TREND: "Trend", PREDICTION: "Prediction", RECOMMENDATION: "Recommendation"
};

const ASK_SUGGESTION_KEYS = ["today.ask.sug1", "today.ask.sug2", "today.ask.sug3", "today.ask.sug4"];

function StatCard({ icon: Icon, label, value, to, accent, hint }) {
  return (
    <Link to={to} className="rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm transition-shadow">
      <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent || "bg-blue-50 text-blue-700"}`}>
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <div className="mt-3 text-3xl font-semibold text-slate-900 tracking-tight">{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
      {hint && <div className="text-xs text-slate-400 mt-1">{hint}</div>}
    </Link>);

}

function SectionCard({ title, icon: Icon, to, children, action }) {
  const { t } = useLanguage();
  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          {Icon && <Icon className="h-4 w-4 text-slate-400" strokeWidth={1.75} />}
          {title}
        </h2>
        {to ?
        <Link to={to} className="text-xs text-blue-700 hover:underline flex items-center gap-1">
            {action || t("today.action.viewAll")} <ArrowRight className="h-3 w-3" />
          </Link> :
        null}
      </div>
      {children}
    </div>);

}

export default function Today() {
  const { user } = useAuth();
  const { members, projects, memberName, projectName, memberById } = useLookups();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const askSuggestions = ASK_SUGGESTION_KEYS.map((k) => t(k));
  const [tasks, setTasks] = useState(null);
  const [activities, setActivities] = useState(null);
  const [insights, setInsights] = useState(null);
  const [files, setFiles] = useState(null);
  const [org, setOrg] = useState(null);
  const [ask, setAsk] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const [t, a, ins, f, orgs] = await Promise.all([
        base44.entities.Task.list("-created_date", 300),
        base44.entities.Activity.list("-date", 100),
        base44.entities.AIInsight.list("-created_date", 6),
        base44.entities.FileItem.list("-created_date", 8),
        base44.entities.Organization.list()]
        );
        setTasks(t);setActivities(a);setInsights(ins);setFiles(f);setOrg(orgs[0] || null);
      } catch {
        setTasks([]);setActivities([]);setInsights([]);setFiles([]);setOrg(null);
      }
    })();
  }, []);

  const myMember = user?.email ? members.find((m) => m.email?.toLowerCase() === user.email.toLowerCase()) : null;

  const derived = useMemo(() => {
    if (!tasks || !activities) return null;
    const activeProjects = projects.filter((p) => p.status === "ACTIVE");
    const atRisk = projects.filter((p) => p.status === "AT_RISK" || p.riskLevel === "High" || p.riskLevel === "Critical");
    const delayed = projects.filter((p) => p.status === "DELAYED");
    const openTasks = tasks.filter((t) => t.status !== "COMPLETED" && t.status !== "CANCELLED");
    const overdueTasks = openTasks.filter((t) => t.dueDate && daysUntil(t.dueDate) < 0);
    const todayActivities = activities.filter((a) => isToday(a.date));
    const weekActs = activities.filter((a) => isThisWeek(a.date));
    const memberStats = members.
    map((m) => ({ member: m, count: weekActs.filter((a) => a.memberId === m.id).length, last: weekActs.find((a) => a.memberId === m.id)?.date })).
    filter((x) => x.count > 0).
    sort((a, b) => b.count - a.count).
    slice(0, 6);
    const progressFor = (pid) => {
      const pt = tasks.filter((t) => t.projectId === pid);
      if (!pt.length) return 0;
      return Math.round(pt.filter((t) => t.status === "COMPLETED").length / pt.length * 100);
    };
    return { activeProjects, atRisk, delayed, openTasks, overdueTasks, todayActivities, memberStats, progressFor };
  }, [tasks, activities, projects, members]);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return t("greeting.morning");
    if (h < 18) return t("greeting.afternoon");
    return t("greeting.evening");
  })();

  const loading = !derived || !insights || !files;

  const submitAsk = (q) => {
    const text = (q ?? ask).trim();
    if (!text) return;
    setAsk("");
    navigate(`/ask-bossai?q=${encodeURIComponent(text)}`);
  };

  // Attention items: actionable signals for the PI
  const attention = [];
  if (derived) {
    derived.delayed.forEach((p) => attention.push({ key: `d-${p.id}`, kind: "delayed", label: p.name, sub: t("today.delayedProject"), to: `/projects/${p.id}`, tone: "rose" }));
    derived.atRisk.forEach((p) => attention.push({ key: `r-${p.id}`, kind: "risk", label: p.name, sub: `${t("today.atRisk")} · ${p.riskLevel || "—"} ${t("today.riskUnit")}`, to: `/projects/${p.id}`, tone: "orange" }));
    derived.overdueTasks.slice(0, 4).forEach((tk) => attention.push({ key: `o-${tk.id}`, kind: "overdue", label: tk.title, sub: `${projectName(tk.projectId)} · ${Math.abs(daysUntil(tk.dueDate))}${t("today.daysOverdue")}`, to: "/tasks", tone: "amber" }));
  }
  (insights || []).filter((i) => i.severity === "High" || i.severity === "Critical").slice(0, 3).forEach((i) => attention.push({ key: `i-${i.id}`, kind: "insight", label: i.summary, sub: `${t("today.aiInsight")} · ${i.severity}`, to: "/ai-analysis", tone: "violet" }));

  return (
    <div>
      <PageHeader
        title={`${greeting}${myMember ? `, ${myMember.name.split(" ")[0]}` : user?.full_name ? `, ${user.full_name.split(" ")[0]}` : ""}`}
        subtitle={formatDate(new Date())}
        actions={org ?
        <span className="hidden sm:inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600">
            <Building2 className="h-3.5 w-3.5 text-blue-700" />
            {org.name}
            <span className="text-slate-300">·</span>
            
          </span> :
        null} />
      

      {/* Ask BossBala — prominent */}
      <div className="rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-white p-5">
        <div className="flex items-center gap-2 mb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-white"><Sparkles className="h-4 w-4" /></div>
          <div>
            <h2 className="text-sm font-semibold text-slate-800">Ask BossBala</h2>
            <p className="text-xs text-slate-500">{t("today.ask.subtitle")}</p>
          </div>
        </div>
        <form onSubmit={(e) => {e.preventDefault();submitAsk();}} className="flex items-center gap-2">
          <input
            value={ask}
            onChange={(e) => setAsk(e.target.value)}
            placeholder={t("today.ask.placeholder")}
            className="flex-1 h-11 rounded-lg border border-slate-200 bg-white px-4 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/40" />
          
          <Button type="submit" disabled={!ask.trim()} className="h-11"><Send className="h-4 w-4" /></Button>
        </form>
        <div className="flex flex-wrap gap-2 mt-3">
          {askSuggestions.map((s) =>
          <button key={s} onClick={() => submitAsk(s)} className="text-xs text-slate-600 bg-white hover:bg-blue-700 hover:text-white border border-slate-200 rounded-full px-3 py-1.5 transition-colors">{s}</button>
          )}
        </div>
      </div>

      {/* Stat row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatCard icon={FolderKanban} label={t("today.stat.activeProjects")} value={derived ? derived.activeProjects.length : "—"} to="/projects" accent="bg-blue-50 text-blue-700" />
        <StatCard icon={AlertTriangle} label={t("today.stat.atRisk")} value={derived ? derived.atRisk.length : "—"} to="/projects" accent="bg-orange-50 text-orange-700" hint={t("today.stat.needsAttention")} />
        <StatCard icon={TrendingDown} label={t("today.stat.delayed")} value={derived ? derived.delayed.length : "—"} to="/projects" accent="bg-rose-50 text-rose-700" />
        <StatCard icon={ActivityIcon} label={t("today.stat.activityToday")} value={derived ? derived.todayActivities.length : "—"} to="/activities" accent="bg-emerald-50 text-emerald-700" />
      </div>

      {/* Needs attention */}
      <div className="mt-8">
        <SectionCard title={t("today.section.needsAttention")} icon={Zap}>
          {loading ?
          <div className="p-4 space-y-2"><SkeletonCard /><SkeletonCard /></div> :
          attention.length === 0 ?
          <div className="px-5 py-10 text-center text-sm text-slate-400">{t("today.empty.needsAttention")}</div> :

          <div className="divide-y divide-slate-50">
              {attention.slice(0, 8).map((a) =>
            <Link key={a.key} to={a.to} className="flex items-center gap-3 px-5 py-3 hover:bg-slate-50">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-lg shrink-0 ${
              a.tone === "rose" ? "bg-rose-50 text-rose-600" :
              a.tone === "orange" ? "bg-orange-50 text-orange-600" :
              a.tone === "amber" ? "bg-amber-50 text-amber-600" :
              "bg-violet-50 text-violet-600"}`}>
                    {a.kind === "insight" ? <Sparkles className="h-3.5 w-3.5" /> : a.kind === "overdue" ? <Clock className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-slate-800 truncate">{a.label}</div>
                    <div className="text-xs text-slate-400">{a.sub}</div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-slate-300" />
                </Link>
            )}
            </div>
          }
        </SectionCard>
      </div>

      {/* Progressing + today's activities */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <div className="lg:col-span-2">
          <SectionCard title={t("today.section.projectProgress")} icon={FolderKanban} to="/projects" action={t("today.action.allProjects")}>
            {loading ?
            <div className="p-4 space-y-3"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div> :
            derived.activeProjects.length === 0 ?
            <div className="px-5 py-10 text-center text-sm text-slate-400">{t("today.empty.activeProjects")}</div> :

            <div className="divide-y divide-slate-50">
                {derived.activeProjects.slice(0, 6).map((p) => {
                const prog = derived.progressFor(p.id);
                return (
                  <Link key={p.id} to={`/projects/${p.id}`} className="block px-5 py-4 hover:bg-slate-50">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-slate-800 truncate">{p.name}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusBadge status={p.status} />
                            {p.riskLevel && p.riskLevel !== "Low" && <RiskBadge level={p.riskLevel} />}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <div className="text-sm font-semibold text-slate-800">{prog}%</div>
                          <div className="text-xs text-slate-400">{derived ? tasks.filter((tk) => tk.projectId === p.id && tk.status !== "COMPLETED" && tk.status !== "CANCELLED").length : 0} {t("today.openTasks")}</div>
                        </div>
                      </div>
                      <div className="mt-3"><ProgressBar value={prog} /></div>
                    </Link>);

              })}
              </div>
            }
          </SectionCard>
        </div>

        <SectionCard title={t("today.section.todaysResearch")} icon={ActivityIcon} to="/activities" action={t("today.action.allActivity")}>
          {loading ?
          <div className="p-4 space-y-2"><SkeletonCard /><SkeletonCard /></div> :
          derived.todayActivities.length === 0 ?
          <div className="px-5 py-10 text-center text-sm text-slate-400">{t("today.empty.noActivityToday")}</div> :

          <div className="divide-y divide-slate-50">
              {derived.todayActivities.slice(0, 6).map((a) => {
              const m = memberById(a.memberId);
              return (
                <div key={a.id} className="flex items-start gap-3 px-5 py-3">
                    <Avatar name={m?.name} src={m?.avatarUrl} size={30} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-slate-800">{m?.name || "—"}</span>
                        <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${ACTIVITY_TYPE_COLORS[a.type] || "bg-slate-100 text-slate-500"}`}>{a.type}</span>
                      </div>
                      <div className="text-sm text-slate-600 truncate">{a.title}</div>
                      <div className="text-xs text-slate-400">{projectName(a.projectId)}{a.durationMinutes ? ` · ${formatDuration(a.durationMinutes)}` : ""}</div>
                    </div>
                  </div>);

            })}
            </div>
          }
        </SectionCard>
      </div>

      {/* Member activity + recent evidence */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-6">
        <SectionCard title={t("today.section.memberActivity")} icon={Users} to="/people" action={t("today.action.people")}>
          {loading ?
          <div className="p-4 space-y-2"><SkeletonCard /><SkeletonCard /></div> :
          derived.memberStats.length === 0 ?
          <div className="px-5 py-10 text-center text-sm text-slate-400">{t("today.empty.noActivityWeek")}</div> :

          <div className="divide-y divide-slate-50">
              {derived.memberStats.map((s) =>
            <div key={s.member.id} className="flex items-center gap-3 px-5 py-3">
                  <Avatar name={s.member.name} src={s.member.avatarUrl} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{s.member.name}</div>
                    <div className="text-xs text-slate-400">{s.last ? `${t("today.lastPrefix")} ${relativeTime(s.last)}` : "—"}</div>
                  </div>
                  <span className="text-xs font-semibold text-slate-600 bg-slate-100 rounded-full px-2.5 py-1">{s.count} {t("today.actUnit")}</span>
                </div>
            )}
            </div>
          }
        </SectionCard>

        <div className="lg:col-span-2">
          <SectionCard title={t("today.section.recentEvidence")} icon={FileCheck2} to="/files" action={t("today.action.allFiles")}>
            {loading ?
            <div className="p-4 space-y-2"><SkeletonCard /><SkeletonCard /></div> :
            (files || []).length === 0 ?
            <div className="px-5 py-10 text-center text-sm text-slate-400">{t("today.empty.noFiles")}</div> :

            <div className="divide-y divide-slate-50">
                {(files || []).slice(0, 5).map((f) =>
              <div key={f.id} className="flex items-center gap-3 px-5 py-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${f.isEvidence ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                      <FileCheck2 className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-800 truncate">{f.name}</span>
                        {f.isEvidence && <span className="text-[10px] font-semibold text-emerald-700 bg-emerald-50 rounded-full px-1.5 py-0.5">{t("today.evidence")}</span>}
                      </div>
                      <div className="text-xs text-slate-400">{f.category || f.type} · {projectName(f.projectId)} · {f.created_date ? relativeTime(f.created_date) : ""}</div>
                    </div>
                  </div>
              )}
              </div>
            }
          </SectionCard>
        </div>
      </div>

      {/* AI insights */}
      <div className="mt-6">
        <SectionCard title={t("today.section.aiInsights")} icon={Sparkles} to="/ai-analysis" action={t("today.action.aiAnalysis")}>
          {loading ?
          <div className="p-4 space-y-2"><SkeletonCard /><SkeletonCard /></div> :
          (insights || []).length === 0 ?
          <div className="px-5 py-10 text-center text-sm text-slate-400">{t("today.empty.noInsights")}</div> :

          <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-slate-100">
              {(insights || []).slice(0, 4).map((i) =>
            <div key={i.id} className="bg-white p-5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-blue-700 bg-blue-50 rounded-full px-2 py-0.5">{INSIGHT_TYPE_LABELS[i.type] || i.type}</span>
                    <span className={`text-[11px] font-medium rounded-full px-2 py-0.5 ${SEVERITY_COLORS[i.severity] || SEVERITY_COLORS.Low}`}>{i.severity}</span>
                  </div>
                  <p className="text-sm text-slate-700 mt-3 line-clamp-3">{i.summary || i.content}</p>
                  <div className="flex items-center justify-between mt-3 pt-3 border-t border-slate-50">
                    <span className="text-xs text-slate-400">{i.projectId ? projectName(i.projectId) : "Org-wide"}</span>
                    <span className="text-xs text-slate-400">Confidence {Math.round((i.confidence || 0) * 100)}%</span>
                  </div>
                </div>
            )}
            </div>
          }
        </SectionCard>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3 mt-6">
        <Button asChild><Link to="/activities"><ActivityIcon className="h-4 w-4 mr-1.5" /> {t("today.action.logActivity")}</Link></Button>
        <Button variant="outline" asChild><Link to="/tasks"><ListChecks className="h-4 w-4 mr-1.5" /> {t("today.action.createTask")}</Link></Button>
        <Button variant="outline" asChild><Link to="/files"><FileCheck2 className="h-4 w-4 mr-1.5" /> {t("today.action.uploadFile")}</Link></Button>
        <Button variant="outline" asChild><Link to="/ask-bossai"><Sparkles className="h-4 w-4 mr-1.5" /> {t("today.action.openBossBala")}</Link></Button>
      </div>
    </div>);

}