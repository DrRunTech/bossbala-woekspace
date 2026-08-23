import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader, SkeletonCard } from "@/components/EmptyState";
import { StatusBadge, RiskBadge, ProgressBar, PriorityBadge } from "@/components/ui/badges";
import { formatDate, STATUS_LABELS } from "@/lib/bossai";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FolderKanban, Plus, Users } from "lucide-react";

const empty = { name: "", description: "", status: "PLANNED", startDate: "", endDate: "", priority: "Medium", fundingSource: "", budget: "" };

export default function Projects() {
  const { members, memberName } = useLookups();
  const [projects, setProjects] = useState(null);
  const [tasks, setTasks] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

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

  return (
    <div>
      <PageHeader
        title="Projects"
        subtitle="Research projects with auto-calculated progress"
        actions={<Button onClick={() => { setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> New Project</Button>}
      />

      {!projects ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : projects.length === 0 ? (
        <EmptyState icon={FolderKanban} title="No projects yet" description="Create your first research project to start tracking tasks, activities, and evidence." action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New Project</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map((p) => {
            const prog = progressFor(p.id);
            const memberCount = (p.members?.length || 0);
            return (
              <Link key={p.id} to={`/projects/${p.id}`} className="group rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm hover:border-slate-300 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors">{p.name}</h3>
                  <StatusBadge status={p.status} />
                </div>
                {p.description && <p className="text-sm text-slate-500 mt-1.5 line-clamp-2">{p.description}</p>}
                <div className="mt-4">
                  <div className="flex items-center justify-between text-xs text-slate-400 mb-1.5">
                    <span>Progress</span>
                    <span className="font-medium text-slate-600">{prog}%</span>
                  </div>
                  <ProgressBar value={prog} />
                </div>
                <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-100">
                  <div className="flex items-center gap-2">
                    <PriorityBadge priority={p.priority} />
                    <RiskBadge level={p.riskLevel} />
                  </div>
                  <div className="flex items-center gap-1 text-xs text-slate-400">
                    <Users className="h-3.5 w-3.5" /> {memberCount}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Project</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>Name</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Perovskite Solar Cell Stability" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{Object.keys(STATUS_LABELS).filter((s) => !["TODO", "IN_PROGRESS", "BLOCKED", "CANCELLED"].includes(s)).map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={form.priority} onValueChange={(v) => setForm({ ...form, priority: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["High", "Medium", "Low"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Start Date</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
              <div><Label>End Date</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
              <div><Label>Funding Source</Label><Input value={form.fundingSource} onChange={(e) => setForm({ ...form, fundingSource: e.target.value })} placeholder="NSFC, Industry…" /></div>
              <div><Label>Budget</Label><Input type="number" value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} /></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? "Creating…" : "Create Project"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}