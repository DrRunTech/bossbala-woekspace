import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import { PageHeader, SkeletonCard } from "@/components/EmptyState";
import { StatusBadge, RiskBadge, ProgressBar, PriorityBadge, Avatar, TypeBadge } from "@/components/ui/badges";
import { formatDate, relativeTime, daysUntil, ACTIVITY_TYPE_COLORS, formatDuration } from "@/lib/bossai";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ArrowLeft, Calendar, Users, FileText, ShieldAlert, Plus, Flag } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function ProjectDetail() {
  const { id } = useParams();
  const { members, memberName, memberById } = useLookups();
  const [project, setProject] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [activities, setActivities] = useState([]);
  const [files, setFiles] = useState([]);
  const [risks, setRisks] = useState([]);
  const [milestones, setMilestones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [milestoneOpen, setMilestoneOpen] = useState(false);
  const [msForm, setMsForm] = useState({ title: "", targetDate: "", description: "" });

  const load = async () => {
    setLoading(true);
    try {
      const [p, t, a, f, r, m] = await Promise.all([
        base44.entities.Project.get(id),
        base44.entities.Task.filter({ projectId: id }, "-created_date", 200),
        base44.entities.Activity.filter({ projectId: id }, "-date", 50),
        base44.entities.FileItem.filter({ projectId: id }, "-created_date", 100),
        base44.entities.Risk.filter({ projectId: id }, "-created_date", 100),
        base44.entities.ProjectMilestone.filter({ projectId: id }, "targetDate", 100),
      ]);
      setProject(p); setTasks(t); setActivities(a); setFiles(f); setRisks(r); setMilestones(m);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);

  const progress = tasks.length ? Math.round((tasks.filter((t) => t.status === "Done").length / tasks.length) * 100) : 0;

  const addMilestone = async () => {
    if (!msForm.title.trim() || !msForm.targetDate) return;
    await base44.entities.ProjectMilestone.create({ ...msForm, projectId: id, status: "Planned" });
    setMsForm({ title: "", targetDate: "", description: "" });
    setMilestoneOpen(false);
    load();
  };

  if (loading) return <div className="space-y-3">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>;
  if (!project) return <div className="text-slate-500">Project not found.</div>;

  return (
    <div>
      <Link to="/projects" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="h-4 w-4" /> Projects
      </Link>
      <PageHeader
        title={project.name}
        subtitle={project.description}
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={project.status} />
            <PriorityBadge priority={project.priority} />
            <RiskBadge level={project.riskLevel} />
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* Progress */}
          <div className="rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-semibold text-slate-800">Progress</h2>
              <span className="text-sm font-medium text-slate-600">{progress}%</span>
            </div>
            <ProgressBar value={progress} />
            <div className="grid grid-cols-3 gap-4 mt-4 text-sm">
              <div><div className="text-slate-400 text-xs">Start</div><div className="text-slate-700">{formatDate(project.startDate)}</div></div>
              <div><div className="text-slate-400 text-xs">End</div><div className="text-slate-700">{formatDate(project.endDate)}</div></div>
              <div><div className="text-slate-400 text-xs">Funding</div><div className="text-slate-700">{project.fundingSource || "—"}</div></div>
            </div>
          </div>

          <Tabs defaultValue="tasks">
            <TabsList>
              <TabsTrigger value="tasks">Tasks ({tasks.length})</TabsTrigger>
              <TabsTrigger value="activities">Activity ({activities.length})</TabsTrigger>
              <TabsTrigger value="files">Files ({files.length})</TabsTrigger>
              <TabsTrigger value="risks">Risks ({risks.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="tasks" className="mt-4">
              {tasks.length === 0 ? <div className="text-sm text-slate-400 py-8 text-center">No tasks yet.</div> : (
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

            <TabsContent value="activities" className="mt-4">
              {activities.length === 0 ? <div className="text-sm text-slate-400 py-8 text-center">No activities logged.</div> : (
                <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {activities.map((a) => {
                    const m = memberById(a.memberId);
                    return (
                      <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                        <Avatar name={m?.name} src={m?.avatarUrl} size={28} />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium text-slate-800">{m?.name}</span>
                            <TypeBadge type={a.type} />
                            <span className="text-xs text-slate-400">{relativeTime(a.date)}</span>
                          </div>
                          <div className="text-sm text-slate-600">{a.title}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </TabsContent>

            <TabsContent value="files" className="mt-4">
              {files.length === 0 ? <div className="text-sm text-slate-400 py-8 text-center">No files uploaded.</div> : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {files.map((f) => (
                    <div key={f.id} className="rounded-lg border border-slate-200 bg-white p-4 flex items-start gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><FileText className="h-4 w-4" /></div>
                      <div className="min-w-0">
                        <div className="text-sm font-medium text-slate-800 truncate">{f.name}</div>
                        <div className="text-xs text-slate-400">{f.type}{f.isEvidence ? " · Evidence" : ""}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="risks" className="mt-4">
              {risks.length === 0 ? <div className="text-sm text-slate-400 py-8 text-center">No risks identified.</div> : (
                <div className="rounded-xl border border-slate-200 bg-white divide-y divide-slate-100">
                  {risks.map((r) => (
                    <div key={r.id} className="flex items-center gap-3 px-4 py-3">
                      <ShieldAlert className="h-4 w-4 text-rose-500" />
                      <span className="text-sm text-slate-800 flex-1 truncate">{r.title}</span>
                      <RiskBadge level={r.level} />
                      <StatusBadge status={r.status} />
                    </div>
                  ))}
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {/* Sidebar: milestones + members */}
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Milestones</h2>
              <Button size="sm" variant="ghost" onClick={() => setMilestoneOpen(true)}><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="p-3">
              {milestones.length === 0 ? <div className="text-sm text-slate-400 py-6 text-center">No milestones.</div> : (
                milestones.map((m) => {
                  const d = daysUntil(m.targetDate);
                  return (
                    <div key={m.id} className="flex items-start gap-3 px-2 py-2.5">
                      <div className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><Flag className="h-3.5 w-3.5" /></div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-800">{m.title}</div>
                        <div className="text-xs text-slate-400">{formatDate(m.targetDate)} · {m.status}</div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-5 py-4 border-b border-slate-100">
              <h2 className="text-sm font-semibold text-slate-800">Team</h2>
            </div>
            <div className="p-3">
              {project.members?.length ? project.members.map((mid) => {
                const m = memberById(mid);
                return (
                  <Link key={mid} to={`/people/${mid}`} className="flex items-center gap-3 px-2 py-2 hover:bg-slate-50 rounded-lg">
                    <Avatar name={m?.name} src={m?.avatarUrl} size={32} />
                    <div className="min-w-0">
                      <div className="text-sm text-slate-800 truncate">{m?.name || "—"}</div>
                      <div className="text-xs text-slate-400">{m?.title || m?.role}</div>
                    </div>
                  </Link>
                );
              }) : <div className="text-sm text-slate-400 py-6 text-center">No members assigned.</div>}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={milestoneOpen} onOpenChange={setMilestoneOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>New Milestone</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>Title</Label><Input value={msForm.title} onChange={(e) => setMsForm({ ...msForm, title: e.target.value })} /></div>
            <div><Label>Target Date</Label><Input type="date" value={msForm.targetDate} onChange={(e) => setMsForm({ ...msForm, targetDate: e.target.value })} /></div>
            <div><Label>Description</Label><Textarea rows={2} value={msForm.description} onChange={(e) => setMsForm({ ...msForm, description: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMilestoneOpen(false)}>Cancel</Button>
            <Button onClick={addMilestone} disabled={!msForm.title || !msForm.targetDate}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}