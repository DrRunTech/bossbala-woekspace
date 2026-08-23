import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import { useAuth } from "@/lib/AuthContext";
import { PageHeader, SkeletonCard } from "@/components/EmptyState";
import { StatusBadge, PriorityBadge, ProgressBar, Avatar, RiskBadge } from "@/components/ui/badges";
import { isToday, isThisWeek, relativeTime, formatDate, daysUntil, ACTIVITY_TYPE_COLORS, formatDuration } from "@/lib/bossai";
import { Activity as ActivityIcon, FolderKanban, ListChecks, CalendarClock, Plus, Upload, FilePlus2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

function StatCard({ icon: Icon, label, value, to, accent }) {
  return (
    <Link to={to} className="rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm transition-shadow">
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accent || "bg-blue-50 text-blue-700"}`}>
          <Icon className="h-4 w-4" strokeWidth={1.75} />
        </div>
      </div>
      <div className="mt-3 text-3xl font-semibold text-slate-900 tracking-tight">{value}</div>
      <div className="text-sm text-slate-500 mt-0.5">{label}</div>
    </Link>
  );
}

export default function Today() {
  const { user } = useAuth();
  const { members, projects, memberName, projectName, memberById } = useLookups();
  const [tasks, setTasks] = useState(null);
  const [activities, setActivities] = useState(null);
  const [milestones, setMilestones] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const [t, a, ms] = await Promise.all([
          base44.entities.Task.list("-created_date", 200),
          base44.entities.Activity.list("-date", 50),
          base44.entities.ProjectMilestone.list("targetDate", 100),
        ]);
        setTasks(t);
        setActivities(a);
        setMilestones(ms);
      } catch (e) {
        setTasks([]);
        setActivities([]);
        setMilestones([]);
      }
    })();
  }, []);

  const activeProjects = projects.filter((p) => p.status === "ACTIVE");
  const openTasks = tasks ? tasks.filter((t) => t.status !== "COMPLETED") : [];
  const todayActivities = activities ? activities.filter((a) => isToday(a.date)) : [];
  const weekMilestones = milestones
    ? milestones.filter((m) => {
        const d = daysUntil(m.targetDate);
        return d !== null && d >= -2 && d <= 7 && m.status !== "Achieved";
      })
    : [];

  // Match current app user to a Member by email
  const myMember = user?.email ? members.find((m) => m.email?.toLowerCase() === user.email.toLowerCase()) : null;
  const myTasks = myMember ? openTasks.filter((t) => t.assigneeId === myMember.id) : [];

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 18) return "Good afternoon";
    return "Good evening";
  })();

  const loading = !tasks || !activities;

  return (
    <div>
      <PageHeader
        title={`${greeting}${myMember ? `, ${myMember.name.split(" ")[0]}` : ""}`}
        subtitle={formatDate(new Date())}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={FolderKanban} label="Active Projects" value={activeProjects.length} to="/projects" accent="bg-blue-50 text-blue-700" />
        <StatCard icon={ListChecks} label="Open Tasks" value={openTasks.length} to="/tasks" accent="bg-violet-50 text-violet-700" />
        <StatCard icon={ActivityIcon} label="Activity Today" value={todayActivities.length} to="/activities" accent="bg-emerald-50 text-emerald-700" />
        <StatCard icon={CalendarClock} label="My Tasks" value={myTasks.length} to="/tasks" accent="bg-amber-50 text-amber-700" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mt-8">
        {/* My tasks */}
        <div className="lg:col-span-2 rounded-xl border border-slate-200 bg-white">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">My Tasks</h2>
            <Link to="/tasks" className="text-xs text-blue-700 hover:underline flex items-center gap-1">
              All tasks <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          <div className="p-2">
            {loading ? (
              <div className="p-3 space-y-2"><SkeletonCard /><SkeletonCard /></div>
            ) : myTasks.length === 0 ? (
              <div className="px-5 py-10 text-center text-sm text-slate-400">
                {myMember ? "No tasks assigned to you. Enjoy the quiet." : "Link your email to a team member in Settings to see your tasks here."}
              </div>
            ) : (
              myTasks.slice(0, 6).map((t) => {
                const d = daysUntil(t.dueDate);
                return (
                  <Link key={t.id} to="/tasks" className="flex items-center gap-3 rounded-lg px-3 py-2.5 hover:bg-slate-50">
                    <PriorityBadge priority={t.priority} />
                    <span className="text-sm text-slate-800 flex-1 truncate">{t.title}</span>
                    <span className="text-xs text-slate-400">{projectName(t.projectId)}</span>
                    {t.dueDate && (
                      <span className={`text-xs ${d !== null && d < 0 ? "text-rose-600" : d !== null && d <= 2 ? "text-amber-600" : "text-slate-400"}`}>
                        {d < 0 ? `${Math.abs(d)}d overdue` : d === 0 ? "today" : `in ${d}d`}
                      </span>
                    )}
                  </Link>
                );
              })
            )}
          </div>
        </div>

        {/* This week */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-800">This Week</h2>
          </div>
          <div className="p-3">
            {weekMilestones.length === 0 ? (
              <div className="px-2 py-8 text-center text-sm text-slate-400">No upcoming milestones this week.</div>
            ) : (
              weekMilestones.map((m) => {
                const d = daysUntil(m.targetDate);
                return (
                  <div key={m.id} className="flex items-start gap-3 px-2 py-2.5">
                    <div className="mt-1 flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 text-slate-500 shrink-0">
                      <CalendarClock className="h-3.5 w-3.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm text-slate-800 truncate">{m.title}</div>
                      <div className="text-xs text-slate-400">{projectName(m.projectId)} · {formatDate(m.targetDate)}</div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="rounded-xl border border-slate-200 bg-white mt-6">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-800">Recent Activity</h2>
          <Link to="/activities" className="text-xs text-blue-700 hover:underline flex items-center gap-1">
            View all <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="p-3">
          {loading ? (
            <div className="p-3 space-y-2"><SkeletonCard /><SkeletonCard /><SkeletonCard /></div>
          ) : activities.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-400">No activities logged yet.</div>
          ) : (
            activities.slice(0, 8).map((a) => {
              const m = memberById(a.memberId);
              return (
                <div key={a.id} className="flex items-start gap-3 px-2 py-2.5">
                  <Avatar name={m?.name} src={m?.avatarUrl} size={32} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-800">{m?.name || "—"}</span>
                      <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${ACTIVITY_TYPE_COLORS[a.type] || "bg-slate-100 text-slate-500"}`}>{a.type}</span>
                      <span className="text-xs text-slate-400">{relativeTime(a.date)}</span>
                    </div>
                    <div className="text-sm text-slate-600 truncate">{a.title}</div>
                    <div className="text-xs text-slate-400">{projectName(a.projectId)}{a.durationMinutes ? ` · ${formatDuration(a.durationMinutes)}` : ""}</div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-3 mt-6">
        <Button asChild><Link to="/activities"><Plus className="h-4 w-4 mr-1.5" /> Log Activity</Link></Button>
        <Button variant="outline" asChild><Link to="/tasks"><ListChecks className="h-4 w-4 mr-1.5" /> Create Task</Link></Button>
        <Button variant="outline" asChild><Link to="/files"><Upload className="h-4 w-4 mr-1.5" /> Upload File</Link></Button>
      </div>
    </div>
  );
}