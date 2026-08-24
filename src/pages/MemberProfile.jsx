import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import { PageHeader, SkeletonCard } from "@/components/EmptyState";
import { StatusBadge, RoleBadge, Avatar, PriorityBadge, TypeBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { formatDate, relativeTime, formatDuration } from "@/lib/bossai";
import { useLanguage } from "@/lib/i18n";
import { ArrowLeft, FileText, Trash2 } from "lucide-react";

export default function MemberProfile() {
  const { id } = useParams();
  const { projectName } = useLookups();
  const { t } = useLanguage();
  const enumLabel = (k) => (k ? t("enum." + k) : k);
  const [member, setMember] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [activities, setActivities] = useState([]);
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [delOpen, setDelOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const navigate = useNavigate();

  const deleteMember = async () => {
    setDeleting(true);
    try {
      await base44.entities.Member.delete(id);
      navigate("/people");
    } catch { setDeleting(false); setDelOpen(false); }
  };

  useEffect(() => {
    (async () => {
      try {
        const [m, t, a, f] = await Promise.all([
          base44.entities.Member.get(id),
          base44.entities.Task.filter({ assigneeId: id }, "-created_date", 100),
          base44.entities.Activity.filter({ memberId: id }, "-date", 100),
          base44.entities.FileItem.filter({ uploadedBy: id }, "-created_date", 50),
        ]);
        setMember(m); setTasks(t); setActivities(a); setFiles(f);
      } finally { setLoading(false); }
    })();
  }, [id]);

  if (loading) return <div className="space-y-3">{[...Array(3)].map((_, i) => <SkeletonCard key={i} />)}</div>;
  if (!member) return <div className="text-slate-500">{t("mp.notFound")}</div>;

  // weekly heatmap (last 12 weeks)
  const weeks = [];
  for (let w = 11; w >= 0; w--) {
    const end = new Date(); end.setHours(23, 59, 59, 999);
    end.setDate(end.getDate() - w * 7);
    const start = new Date(end); start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0);
    const mins = activities.filter((a) => { const d = new Date(a.date); return d >= start && d <= end; }).reduce((s, a) => s + (a.durationMinutes || 0), 0);
    weeks.push({ mins });
  }
  const maxMins = Math.max(1, ...weeks.map((w) => w.mins));

  const totalHours = activities.reduce((s, a) => s + (a.durationMinutes || 0), 0) / 60;
  const doneTasks = tasks.filter((t) => t.status === "Done").length;

  return (
    <div>
      <Link to="/people" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="h-4 w-4" /> {t("mp.back")}
      </Link>

      <div className="flex items-start gap-4 mb-6 relative">
        <Avatar name={member.name} src={member.avatarUrl} size={64} />
        <div className="flex-1">
          <h1 className="text-2xl font-semibold text-slate-900 tracking-tight">{member.name}</h1>
          <p className="text-sm text-slate-500">{member.title || enumLabel(member.role)} · {member.email}</p>
          <div className="flex items-center gap-2 mt-2">
            <RoleBadge role={member.role} />
            <StatusBadge status={member.status} />
          </div>
          {member.researchFocus && <p className="text-sm text-slate-600 mt-3 max-w-2xl">{member.researchFocus}</p>}
          {member.skills?.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {member.skills.map((s) => <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{s}</span>)}
            </div>
          )}
        </div>
        <div className="grid grid-cols-3 gap-4 text-center">
          <div><div className="text-2xl font-semibold text-slate-900">{totalHours.toFixed(0)}</div><div className="text-xs text-slate-400">{t("mp.totalHours")}</div></div>
          <div><div className="text-2xl font-semibold text-slate-900">{doneTasks}</div><div className="text-xs text-slate-400">{t("mp.tasksDone")}</div></div>
          <div><div className="text-2xl font-semibold text-slate-900">{files.length}</div><div className="text-xs text-slate-400">{t("mp.files")}</div></div>
        </div>
        <Button variant="outline" className="absolute top-0 right-0 text-rose-600 hover:text-rose-700 hover:bg-rose-50" onClick={() => setDelOpen(true)}>
          <Trash2 className="h-4 w-4 mr-1.5" /> {t("common.delete")}
        </Button>
      </div>

      {/* Activity heatmap */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 mb-6">
        <h2 className="text-sm font-semibold text-slate-800 mb-3">{t("mp.activity12")}</h2>
        <div className="flex items-end gap-1.5 h-20">
          {weeks.map((w, i) => (
            <div key={i} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-md transition-all"
                style={{ height: `${Math.max(4, (w.mins / maxMins) * 100)}%`, background: w.mins ? "#1e40af" : "#e2e8f0", opacity: w.mins ? 0.4 + (w.mins / maxMins) * 0.6 : 1 }}
                title={t("mp.minUnit", { n: w.mins })}
              />
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-4 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-800">{t("mp.assignedTasks")}</h2></div>
          <div className="p-2">
            {tasks.length === 0 ? <div className="text-sm text-slate-400 py-8 text-center">{t("mp.noTasks")}</div> : tasks.slice(0, 8).map((t) => (
              <Link key={t.id} to="/tasks" className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-lg">
                <PriorityBadge priority={t.priority} />
                <span className="text-sm text-slate-800 flex-1 truncate">{t.title}</span>
                <StatusBadge status={t.status} />
              </Link>
            ))}
          </div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-4 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-800">{t("mp.recentActivity")}</h2></div>
          <div className="p-2">
            {activities.length === 0 ? <div className="text-sm text-slate-400 py-8 text-center">{t("mp.noActivity")}</div> : activities.slice(0, 8).map((a) => (
              <div key={a.id} className="flex items-start gap-3 px-3 py-2.5">
                <TypeBadge type={a.type} />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-slate-800 truncate">{a.title}</div>
                  <div className="text-xs text-slate-400">{projectName(a.projectId)} · {relativeTime(a.date)}{a.durationMinutes ? ` · ${formatDuration(a.durationMinutes)}` : ""}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {files.length > 0 && (
        <div className="rounded-xl border border-slate-200 bg-white mt-6">
          <div className="px-5 py-4 border-b border-slate-100"><h2 className="text-sm font-semibold text-slate-800">{t("mp.uploadedFiles")}</h2></div>
          <div className="p-2">
            {files.map((f) => (
              <div key={f.id} className="flex items-center gap-3 px-3 py-2.5 hover:bg-slate-50 rounded-lg">
                <FileText className="h-4 w-4 text-slate-400" />
                <span className="text-sm text-slate-800 flex-1 truncate">{f.name}</span>
                <span className="text-xs text-slate-400">{enumLabel(f.type)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <AlertDialog open={delOpen} onOpenChange={setDelOpen}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("people.delete.confirm.title")}</AlertDialogTitle>
            <AlertDialogDescription>{t("people.delete.confirm.msg", { name: member.name })}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={deleteMember} disabled={deleting} className="bg-rose-600 hover:bg-rose-700 text-white">
              {deleting ? t("common.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}