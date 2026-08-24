import React, { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import {
  LayoutDashboard, FolderKanban, Users, ListChecks, Files, Activity,
  Sparkles, ShieldAlert, MessageSquareText, GitCompare, Settings, LogOut, ChevronLeft, Briefcase, BarChart3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n";

const NAV = [
  { to: "/", labelKey: "nav.today", icon: LayoutDashboard, end: true },
  { to: "/projects", labelKey: "nav.projects", icon: FolderKanban },
  { to: "/people", labelKey: "nav.people", icon: Users },
  { to: "/tasks", labelKey: "nav.tasks", icon: ListChecks },
  { to: "/files", labelKey: "nav.files", icon: Files },
  { to: "/data-studio", labelKey: "nav.dataStudio", icon: BarChart3 },
  { to: "/activities", labelKey: "nav.activities", icon: Activity },
  { to: "/ai-analysis", labelKey: "nav.aiAnalysis", icon: Sparkles },
  { to: "/clients", labelKey: "nav.clients", icon: Briefcase },
  { to: "/risks", labelKey: "nav.risks", icon: ShieldAlert },
  { to: "/ask-bossai", label: "Ask BossBala", icon: MessageSquareText },
  { to: "/comparison", labelKey: "nav.comparison", icon: GitCompare },
  { to: "/settings", labelKey: "nav.settings", icon: Settings },
];

export default function Sidebar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const [collapsed, setCollapsed] = useState(false);

  const handleLogout = () => {
    logout(false);
    navigate("/login");
  };

  return (
    <aside
      className={cn(
        "flex flex-col border-r border-slate-200 bg-white transition-all duration-200 z-30",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className="flex items-center h-16 px-4 border-b border-slate-100">
        <div className="flex items-center gap-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-700 text-white shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          {!collapsed && (
            <div className="leading-tight">
              <div className="text-sm font-semibold text-slate-900">BossBala</div>
              <div className="text-[11px] text-slate-400 -mt-0.5">{t("brand.research")}</div>
            </div>
          )}
        </div>
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="ml-auto text-slate-400 hover:text-slate-700 transition-colors"
          aria-label="Toggle sidebar"
        >
          <ChevronLeft className={cn("h-4 w-4 transition-transform", collapsed && "rotate-180")} />
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                isActive
                  ? "bg-blue-50 text-blue-700"
                  : "text-slate-600 hover:bg-slate-50 hover:text-slate-900",
                collapsed && "justify-center px-0"
              )
            }
            title={collapsed ? (item.label || t(item.labelKey)) : undefined}
          >
            <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
            {!collapsed && <span>{item.label || t(item.labelKey)}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-slate-100 p-3">
        <div className={cn("flex items-center gap-2.5", collapsed && "justify-center")}>
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-200 text-slate-600 text-xs font-medium shrink-0">
            {(user?.email || "U").slice(0, 1).toUpperCase()}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1 leading-tight">
              <div className="text-xs font-medium text-slate-700 truncate">{user?.email || "User"}</div>
              <button onClick={handleLogout} className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-slate-700">
                <LogOut className="h-3 w-3" /> Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}