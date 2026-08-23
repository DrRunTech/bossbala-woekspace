import React, { createContext, useContext, useState, useCallback, useMemo } from "react";

const STORAGE_KEY = "bossbala_lang";

export const LANGS = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
];

const translations = {
  en: {
    "brand.research": "Research",
    "nav.today": "Today",
    "nav.projects": "Projects",
    "nav.people": "People",
    "nav.tasks": "Tasks",
    "nav.files": "Files",
    "nav.activities": "Activities",
    "nav.aiAnalysis": "AI Analysis",
    "nav.risks": "Risks",
    "nav.comparison": "Comparison",
    "nav.settings": "Settings",

    "greeting.morning": "Good morning",
    "greeting.afternoon": "Good afternoon",
    "greeting.evening": "Good evening",

    "today.ask.subtitle": "Ask anything about your research group — answered from live data.",
    "today.ask.placeholder": "e.g. What needs my attention this week?",
    "today.ask.sug1": "What happened today?",
    "today.ask.sug2": "What needs my attention?",
    "today.ask.sug3": "What's delayed?",
    "today.ask.sug4": "Summarize this week's research",
    "today.stat.activeProjects": "Active Projects",
    "today.stat.atRisk": "At-Risk",
    "today.stat.delayed": "Delayed",
    "today.stat.activityToday": "Activity Today",
    "today.stat.needsAttention": "Needs attention",
    "today.section.needsAttention": "Needs Your Attention",
    "today.empty.needsAttention": "Nothing critical right now. Everything looks on track.",
    "today.section.projectProgress": "Project Progress",
    "today.action.allProjects": "All projects",
    "today.action.viewAll": "View all",
    "today.empty.activeProjects": "No active projects.",
    "today.section.todaysResearch": "Today's Research",
    "today.action.allActivity": "All activity",
    "today.empty.noActivityToday": "No activities logged today yet.",
    "today.section.memberActivity": "Member Activity (This Week)",
    "today.action.people": "People",
    "today.empty.noActivityWeek": "No activity this week.",
    "today.section.recentEvidence": "Recent Evidence & Files",
    "today.action.allFiles": "All files",
    "today.empty.noFiles": "No files uploaded yet.",
    "today.section.aiInsights": "AI-Generated Insights",
    "today.action.aiAnalysis": "AI Analysis",
    "today.empty.noInsights": "No AI insights generated yet.",
    "today.openTasks": "open tasks",
    "today.actUnit": "act.",
    "today.lastPrefix": "last",
    "today.daysOverdue": "d overdue",
    "today.evidence": "Evidence",
    "today.delayedProject": "Delayed project",
    "today.atRisk": "At risk",
    "today.riskUnit": "risk",
    "today.aiInsight": "AI insight",
    "today.action.logActivity": "Log Activity",
    "today.action.createTask": "Create Task",
    "today.action.uploadFile": "Upload File",
    "today.action.openBossBala": "Open BossBala",

    "settings.title": "Settings",
    "settings.subtitle": "Team profile, preferences, and configuration",
    "settings.appearance": "Appearance",
    "settings.appearanceDesc": "Choose the language for the application interface.",
    "settings.uiLanguage": "UI Language",
    "settings.teamProfile": "Team Profile",
    "settings.teamName": "Team Name",
    "settings.teamNamePh": "e.g. Advanced Photonics Lab",
    "settings.institution": "Institution",
    "settings.institutionPh": "e.g. Nanjing University",
    "settings.description": "Description",
    "settings.yourAccount": "Your Account",
    "settings.signedInAs": "Signed in as",
    "settings.linked": "Linked to team member",
    "settings.notLinked": "Not linked to a team member — add a member with your email to see your tasks on the Today page.",
    "settings.aiPrefs": "AI Preferences",
    "settings.frequency": "Analysis Frequency",
    "settings.language": "Language",
    "settings.detailLevel": "Detail Level",
    "settings.notif": "Notifications",
    "settings.notif.weeklyDigest": "Weekly AI digest",
    "settings.notif.riskAlerts": "Risk alerts",
    "settings.notif.deadlines": "Deadline reminders",
    "settings.dataExport": "Data Export",
    "settings.exportDesc": "Export your team settings and preferences as JSON.",
    "settings.exportBtn": "Export Settings",
    "settings.save": "Save Changes",
    "settings.saved": "Saved",
    "opt.daily": "daily",
    "opt.weekly": "weekly",
    "opt.monthly": "monthly",
    "opt.brief": "brief",
    "opt.standard": "standard",
    "opt.detailed": "detailed",
  },
  zh: {
    "brand.research": "科研",
    "nav.today": "今天",
    "nav.projects": "项目",
    "nav.people": "成员",
    "nav.tasks": "任务",
    "nav.files": "文件",
    "nav.activities": "活动",
    "nav.aiAnalysis": "AI 分析",
    "nav.risks": "风险",
    "nav.comparison": "对比",
    "nav.settings": "设置",

    "greeting.morning": "早上好",
    "greeting.afternoon": "下午好",
    "greeting.evening": "晚上好",

    "today.ask.subtitle": "向科研团队提问 — 基于实时数据回答。",
    "today.ask.placeholder": "例如：本周哪些事项需要我关注？",
    "today.ask.sug1": "今天发生了什么？",
    "today.ask.sug2": "哪些需要我关注？",
    "today.ask.sug3": "什么延期了？",
    "today.ask.sug4": "总结本周科研进展",
    "today.stat.activeProjects": "进行中的项目",
    "today.stat.atRisk": "风险项目",
    "today.stat.delayed": "已延期",
    "today.stat.activityToday": "今日活动",
    "today.stat.needsAttention": "需关注",
    "today.section.needsAttention": "需要您关注",
    "today.empty.needsAttention": "当前没有紧急事项，一切进展顺利。",
    "today.section.projectProgress": "项目进度",
    "today.action.allProjects": "全部项目",
    "today.action.viewAll": "查看全部",
    "today.empty.activeProjects": "暂无进行中的项目。",
    "today.section.todaysResearch": "今日科研",
    "today.action.allActivity": "全部活动",
    "today.empty.noActivityToday": "今日尚未记录活动。",
    "today.section.memberActivity": "本周成员活动",
    "today.action.people": "成员",
    "today.empty.noActivityWeek": "本周暂无活动。",
    "today.section.recentEvidence": "近期证据与文件",
    "today.action.allFiles": "全部文件",
    "today.empty.noFiles": "尚未上传文件。",
    "today.section.aiInsights": "AI 生成的洞察",
    "today.action.aiAnalysis": "AI 分析",
    "today.empty.noInsights": "尚未生成 AI 洞察。",
    "today.openTasks": "个待办任务",
    "today.actUnit": "次",
    "today.lastPrefix": "最近",
    "today.daysOverdue": "天延期",
    "today.evidence": "证据",
    "today.delayedProject": "延期项目",
    "today.atRisk": "风险",
    "today.riskUnit": "风险",
    "today.aiInsight": "AI 洞察",
    "today.action.logActivity": "记录活动",
    "today.action.createTask": "创建任务",
    "today.action.uploadFile": "上传文件",
    "today.action.openBossBala": "打开 BossBala",

    "settings.title": "设置",
    "settings.subtitle": "团队资料、偏好与配置",
    "settings.appearance": "外观",
    "settings.appearanceDesc": "选择应用界面语言。",
    "settings.uiLanguage": "界面语言",
    "settings.teamProfile": "团队资料",
    "settings.teamName": "团队名称",
    "settings.teamNamePh": "例如：先进光子学实验室",
    "settings.institution": "所属机构",
    "settings.institutionPh": "例如：南京大学",
    "settings.description": "描述",
    "settings.yourAccount": "您的账户",
    "settings.signedInAs": "登录身份",
    "settings.linked": "已关联团队成员",
    "settings.notLinked": "未关联团队成员 — 添加一个使用您邮箱的成员，即可在「今天」页面查看您的任务。",
    "settings.aiPrefs": "AI 偏好",
    "settings.frequency": "分析频率",
    "settings.language": "语言",
    "settings.detailLevel": "详细程度",
    "settings.notif": "通知",
    "settings.notif.weeklyDigest": "每周 AI 摘要",
    "settings.notif.riskAlerts": "风险提醒",
    "settings.notif.deadlines": "截止提醒",
    "settings.dataExport": "数据导出",
    "settings.exportDesc": "将团队设置与偏好导出为 JSON。",
    "settings.exportBtn": "导出设置",
    "settings.save": "保存更改",
    "settings.saved": "已保存",
    "opt.daily": "每日",
    "opt.weekly": "每周",
    "opt.monthly": "每月",
    "opt.brief": "简要",
    "opt.standard": "标准",
    "opt.detailed": "详细",
  },
};

const LanguageContext = createContext(null);

const FALLBACK = {
  lang: "en",
  setLang: () => {},
  t: (key) => translations.en[key] ?? key,
};

export function LanguageProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    if (typeof window === "undefined") return "en";
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved && translations[saved]) return saved;
    } catch {}
    const nav = (typeof navigator !== "undefined" ? navigator.language : "en") || "en";
    return nav.toLowerCase().startsWith("zh") ? "zh" : "en";
  });

  const setLang = useCallback((l) => {
    setLangState(l);
    try { localStorage.setItem(STORAGE_KEY, l); } catch {}
  }, []);

  const t = useCallback((key) => translations[lang]?.[key] ?? translations.en[key] ?? key, [lang]);

  const value = useMemo(() => ({ lang, setLang, t }), [lang, setLang, t]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  return ctx || FALLBACK;
}