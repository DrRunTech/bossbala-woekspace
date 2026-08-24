import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader, SkeletonCard } from "@/components/EmptyState";
import { StatusBadge, RiskBadge, ProgressBar, PriorityBadge, Avatar } from "@/components/ui/badges";
import { formatDate, daysUntil } from "@/lib/bossai";
import { useLanguage } from "@/lib/i18n";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderKanban, Plus, Users, Filter, Calendar } from "lucide-react";

const PROJECT_STATUSES = ["PLANNED", "ACTIVE", "AT_RISK", "DELAYED", "COMPLETED", "ARCHIVED"];
const empty = { name: "", description: "", status: "PLANNED", startDate: "", endDate: "", priority: "Medium", fundingSource: "", budget: "" };

const inQuarter = (d) => {
  if (!d) return false;
  const date = new Date(d);
  const now = new Date();
  const diff = (date - now) / (1000 * 60 * 60 * 24);
  return diff >= -90 && diff <= 90;
};
const sameYear = (d) => d && new Date(d).getFullYear() === new Date().getFullYear();

export default function Projects() {
  const { members, memberName, memberById } = useLookups();
  const { t } = useLanguage();
  const enumLabel = (k) => (k ? t("enum." + k) : k);
  const [projects, setProjects] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ status: "all", owner: "all", priority: "all", date: "all" });

  const load = async () => {
    const [p, t] = await Promise.all([
      base44.entities.Project.list("-created_date"),
      base44.entities.Task.list("-created_date", 500),
    ]);
    setProjects(p);
    setTasks(t);
  };
  useEffect(() => { load(); }, []);

  const progressFor = (pid) => {
    const pt = tasks?.filter((t) => t.projectId === pid) || [];
    if (!pt.length) return 0;
    return Math.round((pt.filter((t) => t.status === "COMPLETED").length / pt.length) * 100);
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const me = await base44.auth.me();
      await base44.entities.Project.create({
        ...form,
        organizationId: me.organizationId,
        budget: form.budget ? Number(form.budget) : undefined,
        members: [],
        tags: [],
      });
      setForm(empty);
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!projects) return [];
    return projects.filter((p) => {
      if (filters.status !== "all" && p.status !== filters.status) return false;
      if (filters.owner !== "all" && p.leadId !== filters.owner) return false;
      if (filters.priority !== "all" && p.priority !== filters.priority) return false;
      if (filters.date !== "all") {
        if (filters.date === "no-date" && p.endDate) return false;
        if (filters.date === "overdue" && !(p.endDate && daysUntil(p.endDate) < 0 && p.status !== "COMPLETED" && p.status !== "ARCHIVED")) return false;
        if (filters.date === "quarter" && !inQuarter(p.endDate)) return false;
        if (filters.date === "year" && !sameYear(p.endDate)) return false;
      }
      return true;
    });
  }, [projects, filters]);

  const ownerOptions = useMemo(() => {
    const ids = new Set(projects?.map((p) => p.leadId).filter(Boolean) || []);
    return members.filter((m) => ids.has(m.id));
  }, [projects, members]);

  const activeFilters = Object.values(filters).filter((v) => v !== "all").length;

  return (
    <div>
      <PageHeader
        title={t("projects.title")}
        subtitle={t("projects.subtitle")}
        actions={<Button onClick={() => { setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> {t("projects.new")}</Button>}
      />

      {/* Filters */}
      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mr-1">
          <Filter className="h-3.5 w-3.5" /> {t("common.filter")}
        </div>
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
          <SelectTrigger className="w-40"><SelectValue placeholder={t("projects.f.status")} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("projects.allStatuses")}</SelectItem>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.owner} onValueChange={(v) => setFilters({ ...filters, owner: v })}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t("projects.f.status")} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("projects.allOwners")}</SelectItem>{ownerOptions.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.priority} onValueChange={(v) => setFilters({ ...filters, priority: v })}>
          <SelectTrigger className="w-36"><SelectValue placeholder={t("projects.f.priority")} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("projects.allPriorities")}</SelectItem>{["High", "Medium", "Low"].map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.date} onValueChange={(v) => setFilters({ ...filters, date: v })}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("projects.allDates")}</SelectItem>
            <SelectItem value="quarter">{t("projects.dueQuarter")}</SelectItem>
            <SelectItem value="year">{t("projects.dueYear")}</SelectItem>
            <SelectItem value="overdue">{t("projects.overdue")}</SelectItem>
            <SelectItem value="no-date">{t("projects.noEndDate")}</SelectItem>
          </SelectContent>
        </Select>
        {activeFilters > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setFilters({ status: "all", owner: "all", priority: "all", date: "all" })} className="text-xs text-slate-500">
            {t("common.clearCount", { n: activeFilters })}
          </Button>
        )}
      </div>

      {!projects ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FolderKanban} title={projects.length === 0 ? t("projects.empty.title") : t("projects.empty.noMatch")} description={projects.length === 0 ? t("projects.empty.desc") : t("projects.empty.adjust")} action={projects.length === 0 ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> {t("projects.new")}</Button> : null} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((p) => {
            const prog = progressFor(p.id);
            const pt = tasks?.filter((t) => t.projectId === p.id) || [];
            const completed = pt.filter((t) => t.status === "COMPLETED").length;
            const owner = memberById(p.leadId);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="group rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm hover:border-slate-300 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors line-clamp-1">{p.name}</h3>
                  <StatusBadge status={p.status} />
                </div>
                {p.description && <p className="text-sm text-slate-500 mt-1.5 line-clamp-2">{p.description}</p>}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span>{t("common.progress")} · {completed}/{pt.length} {t("common.tasksUnit")}</span>
                    <span className="font-medium text-slate-600">{prog}%</span>
                  </div>
                  <ProgressBar value={prog} />
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={p.priority} />
                    {p.riskLevel && p.riskLevel !== "Low" && <RiskBadge level={p.riskLevel} />}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    {p.endDate && <span className="flex items-center gap-1"><Calendar className="h-3.5 w-3.5" />{formatDate(p.endDate)}</span>}
                    {owner ? (
                      <span className="flex items-center gap-1"><Avatar name={owner.name} src={owner.avatarUrl} size={20} /><span className="text-slate-500">{owner.name.split(" ")[0]}</span></span>
                    ) : <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" />{(p.members?.length || 0)}</span>}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("projects.dlg.title")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>{t("projects.f.name")}</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={t("projects.f.namePh")} />
            </div>
            <div>
              <Label>{t("projects.f.description")}</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("projects.f.status")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PROJECT_STATUSES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("projects.f.priority")}</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["High", "Medium", "Low"].map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("projects.f.startDate")}</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
              <div><Label>{t("projects.f.targetDate")}</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
              <div><Label>{t("projects.f.funding")}</Label><Input value={form.fundingSource} onChange={(e) => setForm({ ...form, fundingSource: e.target.value })} placeholder={t("projects.f.fundingPh")} /></div>
              <div><Label>{t("projects.f.budget")}</Label><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? t("common.creating") : t("projects.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}