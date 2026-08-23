import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader } from "@/components/EmptyState";
import { TypeBadge, Avatar } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Activity as ActivityIcon, Plus, Calendar } from "lucide-react";
import { formatDate, formatDateTime, formatDuration, ACTIVITY_TYPE_COLORS } from "@/lib/bossai";

const empty = { memberId: "", projectId: "", type: "Experiment", title: "", description: "", date: new Date().toISOString().slice(0, 16), durationMinutes: "", location: "" };

export default function Activities() {
  const { members, projects, memberById, projectName } = useLookups();
  const [activities, setActivities] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ member: "all", project: "all", type: "all" });
  const [view, setView] = useState("feed");

  const load = async () => setActivities(await base44.entities.Activity.list("-date", 500));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title.trim() || !form.memberId || !form.projectId) return;
    setSaving(true);
    try {
      await base44.entities.Activity.create({
        ...form,
        date: new Date(form.date).toISOString(),
        durationMinutes: form.durationMinutes ? Number(form.durationMinutes) : undefined,
        tags: [], fileRefs: [],
      });
      setForm({ ...empty, date: new Date().toISOString().slice(0, 16) }); setOpen(false); await load();
    } finally { setSaving(false); }
  };

  const filtered = (activities || []).filter((a) =>
    (filters.member === "all" || a.memberId === filters.member) &&
    (filters.project === "all" || a.projectId === filters.project) &&
    (filters.type === "all" || a.type === filters.type)
  );

  // group by day
  const groups = {};
  filtered.forEach((a) => {
    const day = new Date(a.date).toDateString();
    (groups[day] = groups[day] || []).push(a);
  });
  const days = Object.keys(groups).sort((a, b) => new Date(b) - new Date(a));

  // calendar density (current month)
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const calendarDays = [];
  for (let d = 1; d <= monthEnd.getDate(); d++) {
    const date = new Date(now.getFullYear(), now.getMonth(), d);
    const count = filtered.filter((a) => new Date(a.date).toDateString() === date.toDateString()).length;
    calendarDays.push({ date, count });
  }

  return (
    <div>
      <PageHeader
        title="Activities"
        subtitle="Research activity log — evidence of work, not reports"
        actions={<Button onClick={() => { setForm({ ...empty, date: new Date().toISOString().slice(0, 16) }); setOpen(true); }} disabled={!members.length || !projects.length}><Plus className="h-4 w-4 mr-1.5" /> Log Activity</Button>}
      />

      <div className="flex items-center justify-between gap-3 mb-5 flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={filters.member} onValueChange={(v) => setFilters({ ...filters, member: v })}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Member" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Members</SelectItem>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.project} onValueChange={(v) => setFilters({ ...filters, project: v })}>
            <SelectTrigger className="w-44"><SelectValue placeholder="Project" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Projects</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
            <SelectContent><SelectItem value="all">All Types</SelectItem>{Object.keys(ACTIVITY_TYPE_COLORS).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex items-center gap-1 text-sm">
          <button onClick={() => setView("feed")} className={`px-3 py-1.5 rounded-lg ${view === "feed" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Feed</button>
          <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-lg ${view === "calendar" ? "bg-slate-900 text-white" : "text-slate-500 hover:bg-slate-100"}`}>Calendar</button>
        </div>
      </div>

      {!activities ? (
        <div className="space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ActivityIcon} title="No activities yet" description="Log research activities as they happen — experiments, writing, meetings, code. The system builds the narrative from collected data." action={members.length && projects.length ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> Log Activity</Button> : null} />
      ) : view === "feed" ? (
        <div className="space-y-6">
          {days.map((day) => (
            <div key={day}>
              <div className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 sticky top-0 bg-slate-50 py-1">{formatDate(day)}</div>
              <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                {groups[day].map((a) => {
                  const m = memberById(a.memberId);
                  return (
                    <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                      <Avatar name={m?.name} src={m?.avatarUrl} size={36} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-slate-800">{m?.name}</span>
                          <TypeBadge type={a.type} />
                          {a.source !== "Manual" && <span className="text-[11px] text-slate-400">{a.source}</span>}
                          <span className="text-xs text-slate-400 ml-auto">{formatDateTime(a.date)}</span>
                        </div>
                        <div className="text-sm text-slate-700 mt-0.5">{a.title}</div>
                        {a.description && <div className="text-sm text-slate-500 mt-1">{a.description}</div>}
                        <div className="text-xs text-slate-400 mt-1">{projectName(a.projectId)}{a.location ? ` · ${a.location}` : ""}{a.durationMinutes ? ` · ${formatDuration(a.durationMinutes)}` : ""}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">{now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}</h2>
            <Calendar className="h-4 w-4 text-slate-400" />
          </div>
          <div className="grid grid-cols-7 gap-2">
            {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="text-xs text-slate-400 text-center pb-1">{d}</div>)}
            {calendarDays.map(({ date, count }) => {
              const isToday = date.toDateString() === new Date().toDateString();
              return (
                <div key={date.getDate()} className={`aspect-square rounded-lg flex flex-col items-center justify-center text-sm ${isToday ? "ring-2 ring-blue-500" : ""}`} style={{ background: count ? `rgba(30, 64, 175, ${0.08 + Math.min(count, 6) * 0.13})` : "#f8fafc" }}>
                  <span className={count ? "text-slate-800 font-medium" : "text-slate-400"}>{date.getDate()}</span>
                  {count > 0 && <span className="text-[10px] text-blue-700">{count}</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Log Activity</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Grown perovskite film batch #14" /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Member</Label>
                <Select value={form.memberId} onValueChange={(v) => setForm({ ...form, memberId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Project</Label>
                <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(ACTIVITY_TYPE_COLORS).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Duration (min)</Label><Input type="number" value={form.durationMinutes} onChange={(e) => setForm({ ...form, durationMinutes: e.target.value })} /></div>
              <div><Label>Date & Time</Label><Input type="datetime-local" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} /></div>
              <div><Label>Location</Label><Input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Clean Room" /></div>
            </div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.memberId || !form.projectId}>{saving ? "Saving…" : "Log Activity"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}