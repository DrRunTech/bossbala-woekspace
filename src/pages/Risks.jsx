import React, { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader } from "@/components/EmptyState";
import { RiskBadge, StatusBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldAlert, Plus } from "lucide-react";
import { formatDate } from "@/lib/bossai";

const empty = { title: "", description: "", projectId: "", level: "Medium", status: "Identified", identifiedBy: "", dueDate: "", mitigation: "" };

export default function Risks() {
  const { members, projects, memberName, projectName } = useLookups();
  const [risks, setRisks] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ level: "all", status: "all", project: "all" });

  const load = async () => setRisks(await base44.entities.Risk.list("-created_date", 500));
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!form.title.trim() || !form.projectId) return;
    setSaving(true);
    try {
      await base44.entities.Risk.create({ ...form, relatedTaskIds: [] });
      setForm(empty); setOpen(false); await load();
    } finally { setSaving(false); }
  };

  const filtered = (risks || []).filter((r) =>
    (filters.level === "all" || r.level === filters.level) &&
    (filters.status === "all" || r.status === filters.status) &&
    (filters.project === "all" || r.projectId === filters.project)
  );

  // risk matrix counts
  const matrix = { High: { High: 0, Medium: 0, Low: 0 }, Medium: { High: 0, Medium: 0, Low: 0 }, Low: { High: 0, Medium: 0, Low: 0 } };

  return (
    <div>
      <PageHeader
        title="Risks"
        subtitle="Risk register and tracking"
        actions={<Button onClick={() => { setForm(empty); setOpen(true); }} disabled={!projects.length}><Plus className="h-4 w-4 mr-1.5" /> New Risk</Button>}
      />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Select value={filters.level} onValueChange={(v) => setFilters({ ...filters, level: v })}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Level" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Levels</SelectItem>{["Low", "Medium", "High", "Critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Statuses</SelectItem>{["Identified", "Monitoring", "Mitigating", "Resolved", "Ignored"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.project} onValueChange={(v) => setFilters({ ...filters, project: v })}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Projects</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!risks ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ShieldAlert} title="No risks tracked" description="Identify and track research risks — technical, schedule, resource, or funding." action={projects.length ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New Risk</Button> : null} />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Risk</th>
                  <th className="text-left px-4 py-3 font-medium">Project</th>
                  <th className="text-left px-4 py-3 font-medium">Level</th>
                  <th className="text-left px-4 py-3 font-medium">Status</th>
                  <th className="text-left px-4 py-3 font-medium">Identified By</th>
                  <th className="text-left px-4 py-3 font-medium">Due</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-slate-800">{r.title}</td>
                    <td className="px-4 py-3 text-slate-500">{projectName(r.projectId)}</td>
                    <td className="px-4 py-3"><RiskBadge level={r.level} /></td>
                    <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
                    <td className="px-4 py-3 text-slate-500">{memberName(r.identifiedBy)}</td>
                    <td className="px-4 py-3 text-slate-500">{formatDate(r.dueDate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Risk</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Title</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Equipment downtime may delay fabrication" /></div>
            <div><Label>Description</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Project</Label>
                <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Level</Label>
                <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Low", "Medium", "High", "Critical"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Identified", "Monitoring", "Mitigating", "Resolved", "Ignored"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Identified By</Label>
                <Select value={form.identifiedBy} onValueChange={(v) => setForm({ ...form, identifiedBy: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            </div>
            <div><Label>Mitigation Plan</Label><Textarea rows={2} value={form.mitigation} onChange={(e) => setForm({ ...form, mitigation: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.projectId}>{saving ? "Saving…" : "Create Risk"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}