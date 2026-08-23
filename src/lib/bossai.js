// Shared helpers and label/color maps for BossAI Research

export const STATUS_COLORS = {
  // Project status
  PLANNED: "bg-slate-100 text-slate-600",
  ACTIVE: "bg-blue-100 text-blue-700",
  AT_RISK: "bg-amber-100 text-amber-700",
  DELAYED: "bg-orange-100 text-orange-700",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  ARCHIVED: "bg-slate-100 text-slate-400 line-through",
  // Task status
  TODO: "bg-slate-100 text-slate-600",
  IN_PROGRESS: "bg-blue-100 text-blue-700",
  BLOCKED: "bg-rose-100 text-rose-700",
  CANCELLED: "bg-slate-100 text-slate-400 line-through",
  COMPLETED: "bg-emerald-100 text-emerald-700",
  // Member status
  OnLeave: "bg-amber-100 text-amber-700",
  Inactive: "bg-slate-100 text-slate-400",
  // Risk status
  Identified: "bg-blue-100 text-blue-700",
  Monitoring: "bg-amber-100 text-amber-700",
  Mitigating: "bg-orange-100 text-orange-700",
  Resolved: "bg-emerald-100 text-emerald-700",
  Ignored: "bg-slate-100 text-slate-400",
  // Milestone
  Planned: "bg-slate-100 text-slate-600",
  Achieved: "bg-emerald-100 text-emerald-700",
  Missed: "bg-rose-100 text-rose-700",
  Delayed: "bg-amber-100 text-amber-700",
};

export const STATUS_LABELS = {
  PLANNED: "Planned",
  ACTIVE: "Active",
  AT_RISK: "At Risk",
  DELAYED: "Delayed",
  COMPLETED: "Completed",
  ARCHIVED: "Archived",
  TODO: "To Do",
  IN_PROGRESS: "In Progress",
  BLOCKED: "Blocked",
  CANCELLED: "Cancelled",
};

export const INSIGHT_TYPE_COLORS = {
  SUMMARY: "bg-blue-100 text-blue-700",
  PROGRESS: "bg-emerald-100 text-emerald-700",
  RISK: "bg-rose-100 text-rose-700",
  ANOMALY: "bg-orange-100 text-orange-700",
  TREND: "bg-violet-100 text-violet-700",
  PREDICTION: "bg-indigo-100 text-indigo-700",
  RECOMMENDATION: "bg-teal-100 text-teal-700",
};

export const EVIDENCE_TYPE_COLORS = {
  ExperimentData: "bg-violet-100 text-violet-700",
  SimulationResults: "bg-blue-100 text-blue-700",
  Paper: "bg-emerald-100 text-emerald-700",
  Code: "bg-indigo-100 text-indigo-700",
  Report: "bg-amber-100 text-amber-700",
  Image: "bg-teal-100 text-teal-700",
  RawData: "bg-slate-100 text-slate-600",
  Other: "bg-slate-100 text-slate-500",
};

export const PRIORITY_COLORS = {
  P0: "bg-rose-100 text-rose-700",
  P1: "bg-orange-100 text-orange-700",
  P2: "bg-blue-100 text-blue-700",
  P3: "bg-slate-100 text-slate-500",
  High: "bg-rose-100 text-rose-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-slate-100 text-slate-500",
};

export const RISK_COLORS = {
  Low: "bg-emerald-100 text-emerald-700",
  Medium: "bg-amber-100 text-amber-700",
  High: "bg-orange-100 text-orange-700",
  Critical: "bg-rose-100 text-rose-700",
};

export const ROLE_COLORS = {
  PI: "bg-indigo-100 text-indigo-700",
  TEAM_LEADER: "bg-blue-100 text-blue-700",
  RESEARCHER: "bg-slate-100 text-slate-600",
  ADMIN: "bg-rose-100 text-rose-700",
  TeamLeader: "bg-blue-100 text-blue-700",
  Researcher: "bg-slate-100 text-slate-600",
  Student: "bg-teal-100 text-teal-700",
};

export const ACTIVITY_TYPES = [
  "FILE_UPLOAD", "FILE_UPDATE", "TASK_CREATED", "TASK_UPDATED", "TASK_COMPLETED",
  "EXPERIMENT", "MEETING", "CODE_COMMIT", "DATA_GENERATED", "REPORT_CREATED", "MANUAL_NOTE", "OTHER",
];

export const ACTIVITY_TYPE_LABELS = {
  FILE_UPLOAD: "File Upload",
  FILE_UPDATE: "File Update",
  TASK_CREATED: "Task Created",
  TASK_UPDATED: "Task Updated",
  TASK_COMPLETED: "Task Completed",
  EXPERIMENT: "Experiment",
  MEETING: "Meeting",
  CODE_COMMIT: "Code Commit",
  DATA_GENERATED: "Data Generated",
  REPORT_CREATED: "Report Created",
  MANUAL_NOTE: "Manual Note",
  OTHER: "Other",
};

export const ACTIVITY_TYPE_COLORS = {
  FILE_UPLOAD: "bg-blue-100 text-blue-700",
  FILE_UPDATE: "bg-sky-100 text-sky-700",
  TASK_CREATED: "bg-slate-100 text-slate-600",
  TASK_UPDATED: "bg-amber-100 text-amber-700",
  TASK_COMPLETED: "bg-emerald-100 text-emerald-700",
  EXPERIMENT: "bg-violet-100 text-violet-700",
  MEETING: "bg-teal-100 text-teal-700",
  CODE_COMMIT: "bg-indigo-100 text-indigo-700",
  DATA_GENERATED: "bg-cyan-100 text-cyan-700",
  REPORT_CREATED: "bg-orange-100 text-orange-700",
  MANUAL_NOTE: "bg-slate-100 text-slate-600",
  OTHER: "bg-slate-100 text-slate-500",
};

export const ACTIVITY_SOURCE_COLORS = {
  Manual: "bg-slate-100 text-slate-500",
  Auto: "bg-blue-50 text-blue-600",
  Imported: "bg-violet-50 text-violet-600",
};

export function formatDate(d) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date)) return "—";
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

export function formatDateTime(d) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  if (isNaN(date)) return "—";
  return date.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

export function relativeTime(d) {
  if (!d) return "";
  const date = typeof d === "string" ? new Date(d) : d;
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

export function isToday(d) {
  if (!d) return false;
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  return date.toDateString() === now.toDateString();
}

export function isThisWeek(d) {
  if (!d) return false;
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  const weekAgo = new Date(now);
  weekAgo.setDate(now.getDate() - 7);
  return date >= weekAgo && date <= now;
}

export function daysUntil(d) {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}

export function weekKey(d = new Date()) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - ((date.getDay() + 6) % 7)); // Monday
  const year = date.getFullYear();
  const start = new Date(date);
  start.setMonth(0, 1);
  const week = Math.ceil(((date - start) / 86400000 + start.getDay() + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function monthKey(d = new Date()) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export function formatDuration(mins) {
  if (!mins) return "—";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h && m) return `${h}h ${m}m`;
  if (h) return `${h}h`;
  return `${m}m`;
}

export function initials(name) {
  if (!name) return "?";
  return name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
}