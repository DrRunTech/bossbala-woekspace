import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader } from "@/components/EmptyState";
import { StatusBadge, RoleBadge, Avatar } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Users, Plus } from "lucide-react";
import { useLanguage } from "@/lib/i18n";

const ROLES = ["PI", "TeamLeader", "Researcher", "Student"];
const MEMBER_STATUSES = ["Active", "OnLeave", "Inactive"];
const empty = { name: "", role: "Researcher", email: "", title: "", status: "Active", joinedDate: "", researchFocus: "", skills: "", weeklyHoursTarget: 40 };

export default function People() {
  const { members, loading } = useLookups();
  const { t } = useLanguage();
  const enumLabel = (k) => (k ? t("enum." + k) : k);
  const [activities, setActivities] = useState([]);
  const [projects, setProjects] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [a, p] = await Promise.all([
          base44.entities.Activity.list("-date", 500),
          base44.entities.Project.list(),
        ]);
        setActivities(a); setProjects(p);
      } catch {}
    })();
  }, []);

  const hoursThisWeek = (mid) => {
    const now = new Date();
    const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
    return activities.filter((a) => a.memberId === mid && new Date(a.date) >= weekAgo).reduce((s, a) => s + (a.durationMinutes || 0), 0) / 60;
  };
  const projectCount = (mid) => projects.filter((p) => p.members?.includes(mid)).length;

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      await base44.entities.Member.create({
        ...form,
        skills: form.skills ? form.skills.split(",").map((s) => s.trim()).filter(Boolean) : [],
        weeklyHoursTarget: Number(form.weeklyHoursTarget) || 40,
      });
      setForm(empty); setOpen(false);
      window.location.reload();
    } finally { setSaving(false); }
  };

  return (
    <div>
      <PageHeader
        title={t("people.title")}
        subtitle={t("people.subtitle")}
        actions={<Button onClick={() => { setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> {t("people.add")}</Button>}
      />

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(3)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : members.length === 0 ? (
        <EmptyState icon={Users} title={t("people.empty.title")} description={t("people.empty.desc")} action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> {t("people.add")}</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {members.map((m) => (
            <Link key={m.id} to={`/people/${m.id}`} className="rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm hover:border-slate-300 transition-all">
              <div className="flex items-start gap-3">
                <Avatar name={m.name} src={m.avatarUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-slate-900 truncate">{m.name}</h3>
                  <p className="text-sm text-slate-500 truncate">{m.title || enumLabel(m.role)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 mt-3">
                <RoleBadge role={m.role} />
                <StatusBadge status={m.status} />
              </div>
              <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-slate-100 text-sm">
                <div><div className="text-xs text-slate-400">{t("people.projects")}</div><div className="text-slate-700">{projectCount(m.id)}</div></div>
                <div><div className="text-xs text-slate-400">{t("people.hoursWeek")}</div><div className="text-slate-700">{hoursThisWeek(m.id).toFixed(1)}h</div></div>
              </div>
            </Link>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("people.dlg.title")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>{t("people.f.name")}</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
              <div><Label>{t("people.f.email")}</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div>
                <Label>{t("people.f.role")}</Label>
                <Select value={form.role} onValueChange={(v) => setForm({ ...form, role: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{ROLES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("people.f.title")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("people.f.titlePh")} /></div>
              <div>
                <Label>{t("people.f.status")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MEMBER_STATUSES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("people.f.joined")}</Label><Input type="date" value={form.joinedDate} onChange={(e) => setForm({ ...form, joinedDate: e.target.value })} /></div>
            </div>
            <div><Label>{t("people.f.focus")}</Label><Input value={form.researchFocus} onChange={(e) => setForm({ ...form, researchFocus: e.target.value })} /></div>
            <div><Label>{t("people.f.skills")}</Label><Input value={form.skills} onChange={(e) => setForm({ ...form, skills: e.target.value })} placeholder={t("people.f.skillsPh")} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? t("people.adding") : t("people.add")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}