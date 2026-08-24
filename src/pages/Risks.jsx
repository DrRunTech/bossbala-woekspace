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
import { useLanguage } from "@/lib/i18n";

const LEVELS = ["Low", "Medium", "High", "Critical"];
const RISK_STATUSES = ["Identified", "Monitoring", "Mitigating", "Resolved", "Ignored"];
const empty = { title: "", description: "", projectId: "", level: "Medium", status: "Identified", identifiedBy: "", dueDate: "", mitigation: "" };

export default function Risks() {
  const { members, projects, memberName, projectName } = useLookups();
  const { t } = useLanguage();
  const enumLabel = (k) => (k ? t("enum." + k) : k);
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

  return (
    <div>
      <PageHeader
        title={t("risks.title")}
        subtitle={t("risks.subtitle")}
        actions={<Button onClick={() => { setForm(empty); setOpen(true); }} disabled={!projects.length}><Plus className="h-4 w-4 mr-1.5" /> {t("risks.new")}</Button>}
      />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Select value={filters.level} onValueChange={(v) => setFilters({ ...filters, level: v })}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("risks.allLevels")}</SelectItem>{LEVELS.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("risks.allStatuses")}</SelectItem>{RISK_STATUSES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.project} onValueChange={(v) => setFilters({ ...filters, project: v })}>
          <SelectTrigger className="w-44"><SelectValue placeholder={t("risks.f.project")} /></SelectTrigger>
          <SelectContent><SelectItem value="all">{t("risks.allProjects")}</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
      </div>

      {!risks ? (
        <div className="space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={ShieldAlert} title={t("risks.empty.title")} description={t("risks.empty.desc")} action={projects.length ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> {t("risks.new")}</Button> : null} />
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500 uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">{t("risks.th.risk")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("risks.th.project")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("risks.th.level")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("risks.th.status")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("risks.th.identifiedBy")}</th>
                  <th className="text-left px-4 py-3 font-medium">{t("risks.th.due")}</th>
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
          <DialogHeader><DialogTitle>{t("risks.dlg.title")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>{t("risks.f.title")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("risks.f.titlePh")} /></div>
            <div><Label>{t("risks.f.description")}</Label><Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("risks.f.project")}</Label>
                <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                  <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                  <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("risks.f.level")}</Label>
                <Select value={form.level} onValueChange={(v) => setForm({ ...form, level: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{LEVELS.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("risks.f.status")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{RISK_STATUSES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("risks.f.identifiedBy")}</Label>
                <Select value={form.identifiedBy} onValueChange={(v) => setForm({ ...form, identifiedBy: v })}>
                  <SelectTrigger><SelectValue placeholder={t("common.select")} /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("risks.f.dueDate")}</Label><Input type="date" value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></div>
            </div>
            <div><Label>{t("risks.f.mitigation")}</Label><Textarea rows={2} value={form.mitigation} onChange={(e) => setForm({ ...form, mitigation: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={saving || !form.title.trim() || !form.projectId}>{saving ? t("common.saving") : t("risks.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}