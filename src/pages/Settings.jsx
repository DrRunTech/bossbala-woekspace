import React, { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { useLookups } from "@/lib/useLookups";
import { useLanguage, LANGS } from "@/lib/i18n";
import { PageHeader } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import AiGatewayStatus from "@/components/AiGatewayStatus";
import { Settings as SettingsIcon, Building2, Tags, Bell, Brain, Download, Languages } from "lucide-react";

export default function Settings() {
  const { user } = useAuth();
  const { members } = useLookups();
  const { t, lang, setLang } = useLanguage();
  const [team, setTeam] = useState({ name: "", institution: "", description: "" });
  const [aiPrefs, setAiPrefs] = useState({ frequency: "weekly", language: "English", detail: "standard" });
  const [notif, setNotif] = useState({ weeklyDigest: true, riskAlerts: true, deadlines: true });
  const [saved, setSaved] = useState(false);

  const myMember = user?.email ? members.find((m) => m.email?.toLowerCase() === user.email.toLowerCase()) : null;

  const save = () => { setSaved(true); setTimeout(() => setSaved(false), 2000); };

  const exportData = () => {
    const blob = new Blob([JSON.stringify({ team, aiPrefs, notif, exportedAt: new Date().toISOString() }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bossbala-settings.json"; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div>
      <PageHeader title={t("settings.title")} subtitle={t("settings.subtitle")} />

      <div className="space-y-6 max-w-3xl">
        {/* UI Language */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Languages className="h-4 w-4" /></div>
            <h2 className="text-sm font-semibold text-slate-800">{t("settings.appearance")}</h2>
          </div>
          <p className="text-sm text-slate-500 mb-3">{t("settings.appearanceDesc")}</p>
          <div className="max-w-xs">
            <Label>{t("settings.uiLanguage")}</Label>
            <Select value={lang} onValueChange={(v) => setLang(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LANGS.map((l) => <SelectItem key={l.code} value={l.code}>{l.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </Card>

        {/* Team profile */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Building2 className="h-4 w-4" /></div>
            <h2 className="text-sm font-semibold text-slate-800">{t("settings.teamProfile")}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><Label>{t("settings.teamName")}</Label><Input value={team.name} onChange={(e) => setTeam({ ...team, name: e.target.value })} placeholder={t("settings.teamNamePh")} /></div>
            <div><Label>{t("settings.institution")}</Label><Input value={team.institution} onChange={(e) => setTeam({ ...team, institution: e.target.value })} placeholder={t("settings.institutionPh")} /></div>
          </div>
          <div className="mt-4"><Label>{t("settings.description")}</Label><Textarea rows={2} value={team.description} onChange={(e) => setTeam({ ...team, description: e.target.value })} /></div>
        </Card>

        {/* Account / member link */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600"><SettingsIcon className="h-4 w-4" /></div>
            <h2 className="text-sm font-semibold text-slate-800">{t("settings.yourAccount")}</h2>
          </div>
          <div className="text-sm text-slate-600">
            <div className="text-slate-400 text-xs mb-1">{t("settings.signedInAs")}</div>
            <div>{user?.email}</div>
            <div className="mt-2 text-xs text-slate-400">
              {myMember ? `${t("settings.linked")}: ${myMember.name}` : t("settings.notLinked")}
            </div>
          </div>
        </Card>

        {/* AI preferences */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-50 text-violet-700"><Brain className="h-4 w-4" /></div>
            <h2 className="text-sm font-semibold text-slate-800">{t("settings.aiPrefs")}</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <Label>{t("settings.frequency")}</Label>
              <Select value={aiPrefs.frequency} onValueChange={(v) => setAiPrefs({ ...aiPrefs, frequency: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["daily", "weekly", "monthly"].map((s) => <SelectItem key={s} value={s}>{t(`opt.${s}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("settings.language")}</Label>
              <Select value={aiPrefs.language} onValueChange={(v) => setAiPrefs({ ...aiPrefs, language: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["English", "Chinese"].map((s) => <SelectItem key={s} value={s}>{s === "English" ? (lang === "zh" ? "英文" : "English") : (lang === "zh" ? "中文" : "Chinese")}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div>
              <Label>{t("settings.detailLevel")}</Label>
              <Select value={aiPrefs.detail} onValueChange={(v) => setAiPrefs({ ...aiPrefs, detail: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{["brief", "standard", "detailed"].map((s) => <SelectItem key={s} value={s}>{t(`opt.${s}`)}</SelectItem>)}</SelectContent>
              </Select>
            </div>
          </div>
        </Card>

        {/* AI Gateway */}
        <Card className="p-5">
          <AiGatewayStatus variant="card" />
        </Card>

        {/* Notifications */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-50 text-amber-700"><Bell className="h-4 w-4" /></div>
            <h2 className="text-sm font-semibold text-slate-800">{t("settings.notif")}</h2>
          </div>
          <div className="space-y-3">
            {[
              { key: "weeklyDigest", label: t("settings.notif.weeklyDigest") },
              { key: "riskAlerts", label: t("settings.notif.riskAlerts") },
              { key: "deadlines", label: t("settings.notif.deadlines") },
            ].map((n) => (
              <label key={n.key} className="flex items-center justify-between cursor-pointer">
                <span className="text-sm text-slate-700">{n.label}</span>
                <button
                  onClick={() => setNotif({ ...notif, [n.key]: !notif[n.key] })}
                  className={`relative h-6 w-11 rounded-full transition-colors ${notif[n.key] ? "bg-blue-700" : "bg-slate-200"}`}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${notif[n.key] ? "translate-x-5" : "translate-x-0.5"}`} />
                </button>
              </label>
            ))}
          </div>
        </Card>

        {/* Data export */}
        <Card className="p-5">
          <div className="flex items-center gap-2 mb-4">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Download className="h-4 w-4" /></div>
            <h2 className="text-sm font-semibold text-slate-800">{t("settings.dataExport")}</h2>
          </div>
          <p className="text-sm text-slate-500 mb-3">{t("settings.exportDesc")}</p>
          <Button variant="outline" onClick={exportData}><Download className="h-4 w-4 mr-1.5" /> {t("settings.exportBtn")}</Button>
        </Card>

        <div className="flex items-center gap-3">
          <Button onClick={save}>{t("settings.save")}</Button>
          {saved && <span className="text-sm text-emerald-600">{t("settings.saved")}</span>}
        </div>
      </div>
    </div>
  );
}