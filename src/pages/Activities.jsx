import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader } from "@/components/EmptyState";
import { Avatar } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Activity as ActivityIcon, Plus, Calendar, Paperclip, ChevronRight, FileText, Filter } from "lucide-react";
import { formatDate, formatDateTime, formatDuration, ACTIVITY_TYPES, ACTIVITY_TYPE_COLORS, ACTIVITY_SOURCE_COLORS } from "@/lib/bossai";
import { useLanguage } from "@/lib/i18n";
import { logActivity } from "@/lib/logActivity";

const SOURCE_OPTIONS = ["Manual", "Auto", "Imported"];
const emptyNote = { projectId: "", taskId: "", memberId: "", type: "MANUAL_NOTE", title: "", description: "", date: new Date().toISOString().slice(0, 16), durationMinutes: "", location: "" };

function TypePill({ type }) {
  const { t } = useLanguage();
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${ACTIVITY_TYPE_COLORS[type] || "bg-slate-100 text-slate-500"}`}>{type ? t("enum." + type) : type}</span>;
}

export default function Activities() {
  const { members, projects, memberById, projectName } = useLookups();
  const { t } = useLanguage();
  const enumLabel = (k) => (k ? t("enum." + k) : k);
  const [activities, setActivities] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [files, setFiles] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyNote);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ project: "all", type: "all", member: "all", source: "all", from: "", to: "" });
  const [view, setView] = useState("timeline");

  const load = async () => {
    const [a, t, f] = await Promise.all([
      base44.entities.Activity.list("-date", 500),
      base44.entities.Task.list("-created_date", 500),
      base44.entities.FileItem.list("-created_date", 200),
    ]);
    setActivities(a); setTasks(t); setFiles(f);
  };
  useEffect(() => { load(); }, []);

  const taskName = useMemo(() => {
    const map = {};
    tasks.forEach((t) => { map[t.id] = t.title; });
    return map;
  }, [tasks]);
  const fileById = useMemo(() => {
    const map = {};
    files.forEach((f) => { map[f.id] = f; });
    return map;
  }, [files]);

  const save = async () => {
    if (!form.title.trim() || !form.projectId) return;
    setSaving(true);
    try {
      await logActivity({
        type: form.type,
        projectId: form.projectId,
        taskId: form.taskId || undefined,
        memberId: form.memberId || undefined,
        title: form.title,
        description: form.description,
        source: "Manual",
      });
      setForm({ ...emptyNote, date: new Date().toISOString().slice(0, 16) }); setOpen(false); await load();
    } finally { setSaving(false); }
  };

  const filtered = useMemo(() => {
    if (!activities) return [];
    return activities.filter((a) => {
      if (filters.project !== "all" && a.projectId !== filters.project) return false;
      if (filters.type !== "all" && a.type !== filters.type) return false;
      if (filters.member !== "all" && a.memberId !== filters.member) return false;
      if (filters.source !== "all" && a.source !== filters.source) return false;
      if (filters.from && new Date(a.date) < new Date(filters.from)) return false;
      if (filters.to && new Date(a.date) > new Date(filters.to + "T23:59:59")) return false;
      return true;
    });
  }, [activities, filters]);

  // group by day
  const groups = {};
  filtered.forEach((a) => {
    const day = new Date(a.date).toDateString();
    (groups[day] = groups[day] || []).push(a);
  });
  const days = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

  const hasEvidence = (a) => (a.evidenceRefs?.length || 0) > 0 || (a.fileRefs || []).some((id) => fileById[id]?.isEvidence);

  const activeFilters = ["project", "type", "member", "source"].filter((k) => filters[k] !== "all").length + (filters.from ? 1 : 0) + (filters.to ? 1 : 0);

  return (
    <div>
      <PageHeader
        title={t("act.title")}
        subtitle={t("act.subtitle")}
        actions={<Button onClick={() => { setForm({ ...emptyNote, date: new Date().toISOString().slice(0, 16) }); setOpen(true); }} disabled={!projects.length}><Plus className="h-4 w-4 mr-1.5" /> {t("act.log")}</Button>}
      />

      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mr-1"><Filter className="h-3.5 w-3.5" /> {t("common.filter")}</div>
          <Select value={filters.project} onValueChange={(v) => setFilters({ ...filters, project: v })}>
            <SelectTrigger className="w-40"><SelectValue placeholder={t("act.f.project")} /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("act.allProjects")}</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("act.allTypes")}</SelectItem>{ACTIVITY_TYPES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.member} onValueChange={(v) => setFilters({ ...filters, member: v })}>
            <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("act.allUsers")}</SelectItem>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.source} onValueChange={(v) => setFilters({ ...filters, source: v })}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">{t("act.allSources")}</SelectItem>{SOURCE_OPTIONS.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })} className="w-36" />
          <Input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })} className="w-36" />
          {activeFilters > 0 && <Button variant="ghost" size="sm" onClick={() => setFilters({ project: "all", type: "all", member: "all", source: "all", from: "", to: "" })} className="text-xs text-slate-500">{t("common.clearCount", { n: activeFilters })}</Button>}
        </div>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => setView("timeline")} className={`px-3 py-1.5 rounded-lg ${view === "timeline" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{t("act.timeline")}</button>
          <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-lg ${view === "calendar" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>{t("act.calendar")}</button>
        </div>
      </div>

      {!activities ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ActivityIcon} title={t("act.empty.title")} description={t("act.empty.desc")} action={projects.length ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> {t("act.log")}</Button> : null} />
      ) : view === "timeline" ? (
        <div className="space-y-7">
          {days.map((day) => (
            <div key={day}>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-2">
                <Calendar className="h-3.5 w-3.5" /> {formatDate(day)} <span className="text-slate-300">·</span> <span>{t("act.events", { n: groups[day].length })}</span>
              </div>
              <div className="relative pl-6">
                <div className="absolute left-[11px] top-1 bottom-1 w-px bg-slate-200" />
                <div className="space-y-3">
                  {groups[day].map((a) => {
                    const m = memberById(a.memberId);
                    const evFiles = (a.fileRefs || []).map((id) => fileById[id]).filter(Boolean);
                    const hasEv = hasEvidence(a);
                    return (
                      <div key={a.id} className="relative">
                        <div className="absolute -left-[18px] top-3 flex h-3 w-3 items-center justify-center rounded-full bg-white ring-2 ring-slate-300" />
                        <div className="rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start gap-3">
                            <Avatar name={m?.name} src={m?.avatarUrl} size={34} />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium text-slate-800">{m?.name || t("common.system")}</span>
                                <TypePill type={a.type} />
                                <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${ACTIVITY_SOURCE_COLORS[a.source] || "bg-slate-100 text-slate-500"}`}>{enumLabel(a.source)}</span>
                                <span className="text-xs text-slate-400 ml-auto">{formatDateTime(a.date)}</span>
                              </div>
                              <div className="text-sm text-slate-800 mt-1">{a.title}</div>
                              {a.description && <p className="text-sm text-slate-500 mt-0.5">{a.description}</p>}
                              <div className="flex items-center gap-2 flex-wrap mt-2 text-xs text-slate-400">
                                <span>{projectName(a.projectId)}</span>
                                {a.taskId && taskName[a.taskId] && <><span className="text-slate-300">·</span><span className="truncate max-w-[200px]">{taskName[a.taskId]}</span></>}
                                {a.location && <><span className="text-slate-300">·</span><span>{a.location}</span></>}
                                {a.durationMinutes ? <><span className="text-slate-300">·</span><span>{formatDuration(a.durationMinutes)}</span></> : null}
                              </div>
                              {evFiles.length > 0 && (
                                <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-50">
                                  {hasEv && <span className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 rounded-full px-2 py-0.5"><Paperclip className="h-3 w-3" /> {t("common.evidence")}</span>}
                                  {evFiles.slice(0, 3).map((f) => (
                                    <a key={f.id} href={f.fileUrl} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-slate-500 hover:text-blue-700">
                                      <FileText className="h-3 w-3" /> {f.name}
                                    </a>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <CalendarView activities={filtered} />
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("act.dlg.title")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>{t("act.f.title")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("act.f.titlePh")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("act.f.project")}</Label>
                <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v, taskId: "" })}>
                  <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                  <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("act.f.task")}</Label>
                <Select value={form.taskId} onValueChange={(v) => setForm({ ...form, taskId: v })}>
                  <SelectTrigger><SelectValue placeholder={t("common.none")} /></SelectTrigger>
                  <SelectContent><SelectItem value={null}>{t("common.none")}</SelectItem>{tasks.filter((t) => !form.projectId || t.projectId === form.projectId).map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("act.f.type")}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ACTIVITY_TYPES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("act.f.member")}</Label>
                <Select value={form.memberId} onValueChange={(v) => setForm({ ...form, memberId: v })}>
                  <SelectTrigger><SelectValue placeholder={t("common.yourself")} /></SelectTrigger>
                  <SelectContent><SelectItem value={null}>{t("common.yourself")}</SelectItem>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("act.f.duration")}</Label><Input type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></div>
              <div><Label>{t("act.f.location")}</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder={t("act.f.locationPh")} /></div>
            </div>
            <div><Label>{t("act.f.description")}</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.projectId}>{saving ? t("common.saving") : t("act.save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CalendarView({ activities }) {
  const { t, lang } = useLanguage();
  const now = new Date();
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const calendarDays = [];
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    const date = new Date(now.getFullYear(), now.getMonth(), d);
    const dayActs = activities.filter((a) => new Date(a.date).toDateString() === date.toDateString());
    calendarDays.push({ date, count: dayActs.length, acts: dayActs });
  }
  const weekdays = t("act.weekdays").split(",");
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-slate-800">{now.toLocaleDateString(locale, { month: "long", year: "numeric" })}</h2>
        <Calendar className="h-4 w-4 text-slate-400" />
      </div>
      <div className="grid grid-cols-7 gap-2">
        {weekdays.map((d) => <div key={d} className="text-xs text-slate-400 text-center pb-1">{d}</div>)}
        {calendarDays.map(({ date, count, acts }) => {
          const isToday = date.toDateString() === new Date().toDateString();
          return (
            <div key={date.getDate()} className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm ${isToday ? "ring-2 ring-blue-500" : ""}`} style={{ background: count ? `rgba(30, 64, 175, ${0.08 + Math.min(count, 6) * 0.13})` : "#f8fafc" }} title={acts.map((a) => a.title).join("\n")}>
              <span className={count ? "text-slate-800 font-medium" : "text-slate-400"}>{date.getDate()}</span>
              {count > 0 && <span className="text-[10px] text-blue-700">{count}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}