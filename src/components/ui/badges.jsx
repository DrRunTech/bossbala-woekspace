import React from "react";
import { cn } from "@/lib/utils";
import { STATUS_COLORS, PRIORITY_COLORS, RISK_COLORS, ROLE_COLORS, ACTIVITY_TYPE_COLORS } from "@/lib/bossai";

export function Badge({ children, className }) {
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium", className)}>
      {children}
    </span>
  );
}

export function StatusBadge({ status }) {
  return <Badge className={STATUS_COLORS[status] || "bg-slate-100 text-slate-500"}>{status}</Badge>;
}

export function PriorityBadge({ priority }) {
  return <Badge className={PRIORITY_COLORS[priority] || "bg-slate-100 text-slate-500"}>{priority}</Badge>;
}

export function RiskBadge({ level }) {
  return <Badge className={RISK_COLORS[level] || "bg-slate-100 text-slate-500"}>{level}</Badge>;
}

export function RoleBadge({ role }) {
  return <Badge className={ROLE_COLORS[role] || "bg-slate-100 text-slate-500"}>{role}</Badge>;
}

export function TypeBadge({ type, colorMap = ACTIVITY_TYPE_COLORS }) {
  return <Badge className={colorMap[type] || "bg-slate-100 text-slate-500"}>{type}</Badge>;
}

export function ProgressBar({ value, className }) {
  return (
    <div className={cn("h-1.5 w-full rounded-full bg-slate-100 overflow-hidden", className)}>
      <div
        className="h-full rounded-full bg-blue-700 transition-all duration-500"
        style={{ width: `${Math.min(100, Math.max(0, value || 0))}%` }}
      />
    </div>
  );
}

export function Avatar({ name, src, size = 36 }) {
  const letter = (name || "?").split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  if (src) {
    return <img src={src} alt={name} className="rounded-full object-cover" style={{ width: size, height: size }} />;
  }
  return (
    <div
      className="flex items-center justify-center rounded-full bg-blue-100 text-blue-700 font-medium"
      style={{ width: size, height: size, fontSize: size * 0.36 }}
    >
      {letter}
    </div>
  );
}