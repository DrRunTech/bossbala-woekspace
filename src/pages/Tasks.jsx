import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader } from "@/components/EmptyState";
import { StatusBadge, PriorityBadge, TypeBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ListChecks, Plus } from "lucide-react";
import { formatDate, daysUntil } from "@/lib/bossai";
import { useLanguage } from "@/lib/i18n";
import { logActivity } from "@/lib/logActivity";

const COLUMNS = ["TODO", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"];
const TYPES = ["Experiment", "Simulation", "Writing", "Reading", "Analysis", "Meeting", "Code", "Fabrication", "Other"];
const empty = { title: "", description: "", projectId: "", assigneeId: "", status: "TODO", priority: "P2", type: "Other", dueDate: "", estimatedHours: "" };

export default function Tasks() {
  const { members, projects, memberName, projectName } = useLookups();
  const { t } = useLanguage();
  const enumLabel = (k) => (k ? t("enum." + k) : k);
  const [tasks, setTasks] = useState(null);
  const [view, setView] = useState("board");
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ project: "all", assignee: "all", priority: "all" });

  const load = async () => {
    const t = await base44.entities.Task.list("-created_date", 500);
    setTasks(t);
  };
  useEffect(() => { load(); }, []);

  const filtered = (list) => list.filter((t) =>
    (filters.project === "all" || t.projectId === filters.project) &&
    (filters.assignee === "all" || t.assigneeId === filters.assignee) &&
    (filters.priority === "all" || t.priority === filters.priority)
  );

  const move = async (task, status) => {
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status } : t)));
    const patch = { status, completedAt: status === "COMPLETED" ? new Date().toISOString().slice(0, 10) : undefined };
    await base44.entities.Task.update(task.id, patch);
    logActivity({
      type: status === "COMPLETED" ? "TASK_COMPLETED" : "TASK_UPDATED",
      projectId: task.projectId,
      taskId: task.id,
      title: status === "COMPLETED" ? `Task completed: ${task.title}` : `Task updated: ${task.title}`,
      description: `Status → ${status}`,
      source: "Auto",
    });
  };

  const save = async () => {
    if (!form.title.trim() || !form.projectId || !form.assigneeId) return;
    setSaving(true);
    try {
      const me = await base44.auth.me();
      const created = await base44.entities.Task.create({ ...form, organizationId: me.organizationId, estimatedHours: form.estimatedHours ? Number(form.estimatedHours) : undefined, tags: [], dependencies: [], evidenceRefs: [] });
      logActivity({ type: "TASK_CREATED", projectId: created.projectId, taskId: created.id, title: `Task created: ${created.title}`, source: "Auto" });
      setForm(empty); setOpen(false); await load();
    } finally { setSaving(false); }
  };

  const SelectFilter = ({ value, onChange, options, label }) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-40"><SelectValue placeholder={label} /></SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("common.all")} {label}</SelectItem>
        {options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
      </SelectContent>
    </Select>
  );

  return (
    <div>
      <PageHeader
        title={t("tasks.title")}
        subtitle={t("tasks.subtitle")}
        actions={<Button onClick={() => { setForm(empty); setOpen(true); }} disabled={!members.length || !projects.length}><Plus className="h-4 w-4 mr-1.5" /> {t("tasks.new")}</Button>}
      />

      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <Tabs value={view} onValueChange={setView}>
          <TabsList>
            <TabsTrigger value="board">{t("tasks.board")}</TabsTrigger>
            <TabsTrigger value="list">{t("tasks.list")}</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="flex items-center gap-2 flex-wrap">
          <SelectFilter value={filters.project} onChange={(v) => setFilters({ ...filters, project: v })} label={t("tasks.allProjects")} options={projects.map((p) => ({ value: p.id, label: p.name }))} />
          <SelectFilter value={filters.assignee} onChange={(v) => setFilters({ ...filters, assignee: v })} label={t("tasks.allAssignees")} options={members.map((m) => ({ value: m.id, label: m.name }))} />
          <SelectFilter value={filters.priority} onChange={(v) => setFilters({ ...filters, priority: v })} label={t("tasks.allPriority")} options={["P0", "P1", "P2", "P3"].map((p) => ({ value: p, label: p }))} />
        </div>
      </div>

      {!tasks ? (
        <div className="grid grid-cols-5 gap-4">{COLUMNS.map((c) => <div key={c} className="h-64 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : tasks.length === 0 ? (
        <EmptyState icon={ListChecks} title={t("tasks.empty.title")} description={!projects.length ? t("tasks.empty.noProject") : t("tasks.empty.desc")} action={projects.length ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> {t("tasks.new")}</Button> : null} />
      ) : view === "board" ? (
        <div className="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-4">
          {COLUMNS.map((col) => {
            const colTasks = filtered(tasks.filter((t) => t.status === col));
            return (
              <div key={col} className="rounded-xl bg-slate-100/70 p-3">
                <div className="flex items-center justify-between px-1.5 mb-2">
                  <span className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{enumLabel(col)}</span>
                  <span className="text-xs text-slate-400">{colTasks.length}</span>
                </div>
                <div className="space-y-2">
                  {colTasks.map((t) => {
                    const d = daysUntil(t.dueDate);
                    return (
                      <div key={t.id} className="rounded-lg bg-white border border-slate-200 p-3 hover:shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <span className="text-sm font-medium text-slate-800 line-clamp-2">{t.title}</span>
                          <PriorityBadge priority={t.priority} />
                        </div>
                        <div className="flex items-center gap-2 mt-2">
                          <TypeBadge type={t.type} />
                        </div>
                        <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
                          <span className="text-xs text-slate-400 truncate max-w-[80px]">{memberName(t.assigneeId)}</span>
                          {t.dueDate && <span className={`text-xs ${d !== null && d < 0 ? "text-rose-600" : "text-slate-400"}`}>{formatDate(t.dueDate)}</span>}
                        </div>
                        {col !== "COMPLETED" && (
                          <select
                            value={t.status}
                            onChange={(e) => move(t, e.target.value)}
                            className="mt-2 w-full text-xs text-slate-500 border border-slate-200 rounded px-1.5 py-1 bg-white"
                          >
                            {COLUMNS.map((c) => <option key={c} value={c}>{enumLabel(c)}</option>)}
                          </select>
                        )}
                      </div>
                    );
                  })}
                  {colTasks.length === 0 && <div className="text-xs text-slate-300 text-center py-4">{t("common.empty")}</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">{t("tasks.th.task")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("tasks.th.project")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("tasks.th.assignee")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("tasks.th.priority")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("tasks.th.status")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("tasks.th.due")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered(tasks).map((t) => {
                  const d = daysUntil(t.dueDate);
                  return (
                    <tr key={t.id} className="hover:bg-slate-50">
                      <td className="px-4 py-3 text-slate-800">{t.title}</td>
                      <td className="px-4 py-3 text-slate-500">{projectName(t.projectId)}</td>
                      <td className="px-4 py-3 text-slate-500">{memberName(t.assigneeId)}</td>
                      <td className="px-4 py-3"><PriorityBadge priority={t.priority} /></td>
                      <td className="px-4 py-3"><StatusBadge status={t.status} /></td>
                      <td className={`px-4 py-3 ${d !== null && d < 0 ? "text-rose-600" : "text-slate-500"}`}>{t.dueDate ? formatDate(t.dueDate) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("tasks.dlg.title")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>{t("tasks.f.title")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></div>
            <div><Label>{t("tasks.f.description")}</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("tasks.f.project")}</Label>
                <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                  <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                  <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("tasks.f.assignee")}</Label>
                <Select value={form.assigneeId} onValueChange={(v) => setForm({ ...form, assigneeId: v })}>
                  <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("tasks.f.priority")}</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["P0", "P1", "P2", "P3"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("tasks.f.type")}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{TYPES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("tasks.f.dueDate")}</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
              <div><Label>{t("tasks.f.estHours")}</Label><Input type="number" value={form.estimatedHours} onChange={(e) => setForm({ ...form, estimatedHours: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.projectId || !form.assigneeId}>{saving ? t("common.creating") : t("tasks.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}