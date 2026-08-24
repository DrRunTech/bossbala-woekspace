import React, { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import EmptyState, { PageHeader } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, Plus, ArrowLeft, Mail, Phone, FileText } from "lucide-react";
import { formatDate } from "@/lib/bossai";
import { useLanguage } from "@/lib/i18n";

const CONTRACT_STATUSES = ["Draft", "Negotiating", "Active", "Completed", "Terminated"];
const CONTRACT_TYPES = ["Service", "Sales", "Maintenance", "Consulting", "Subscription", "Other"];
const emptyContract = { title: "", type: "Service", amount: "", status: "Draft", startDate: "", endDate: "", notes: "" };

const STATUS_STYLES = {
  Draft: "bg-slate-100 text-slate-500",
  Negotiating: "bg-amber-50 text-amber-700",
  Active: "bg-emerald-50 text-emerald-700",
  Completed: "bg-blue-50 text-blue-700",
  Terminated: "bg-rose-50 text-rose-700",
};

export default function ClientDetail() {
  const { id } = useParams();
  const { t } = useLanguage();
  const cEnum = (k) => (k ? t("cd.enum." + k) : k);
  const enumLabel = (k) => (k ? t("enum." + k) : k);
  const [client, setClient] = useState(null);
  const [contracts, setContracts] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(emptyContract);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [c, all, p] = await Promise.all([
        base44.entities.Client.get(id),
        base44.entities.Contract.list("-created_date", 500),
        base44.entities.Project.list(),
      ]);
      setClient(c);
      setContracts(all.filter((x) => x.clientId === id));
      setProjects(p);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);

  const save = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const me = await base44.auth.me();
      await base44.entities.Contract.create({
        ...form,
        clientId: id,
        organizationId: me.organizationId,
        amount: form.amount ? Number(form.amount) : undefined,
        tags: [],
      });
      setForm(emptyContract);
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="rounded-xl border border-slate-200 bg-white p-8 animate-pulse h-64" />;
  }
  if (!client) {
    return <EmptyState icon={Briefcase} title={t("cd.notFound")} description={t("cd.notFoundDesc")} action={<Button asChild><Link to="/clients">{t("cd.backToClients")}</Link></Button>} />;
  }

  const totalValue = contracts.reduce((s, x) => s + (Number(x.amount) || 0), 0);
  const activeCount = contracts.filter((x) => x.status === "Active").length;

  return (
    <div>
      <Link to="/clients" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 mb-4">
        <ArrowLeft className="h-4 w-4" /> {t("cd.back")}
      </Link>

      <PageHeader
        title={client.name}
        subtitle={client.company || client.industry || ""}
        actions={<Button onClick={() => { setForm(emptyContract); setOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> {t("cd.newContract")}</Button>}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 lg:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-600">{cEnum(client.status)}</span>
          </div>
          <div className="space-y-2 text-sm">
            {client.contactPerson && <div><div className="text-xs text-slate-400">{t("cd.contact")}</div><div className="text-slate-700">{client.contactPerson}</div></div>}
            {client.email && <div className="flex items-center gap-1.5 text-slate-600"><Mail className="h-3.5 w-3.5" /> {client.email}</div>}
            {client.phone && <div className="flex items-center gap-1.5 text-slate-600"><Phone className="h-3.5 w-3.5" /> {client.phone}</div>}
            {client.address && <div className="text-slate-600">{client.address}</div>}
            {client.notes && <div className="pt-2 mt-2 border-t border-slate-100 text-slate-500">{client.notes}</div>}
          </div>
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-400">{t("cd.contracts")}</div><div className="text-lg font-semibold text-slate-900 mt-1">{contracts.length}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-400">{t("cd.active")}</div><div className="text-lg font-semibold text-slate-900 mt-1">{activeCount}</div></div>
            <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="text-xs text-slate-400">{t("cd.totalValue")}</div><div className="text-lg font-semibold text-slate-900 mt-1">{totalValue ? totalValue.toLocaleString() : "—"}</div></div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <div className="px-5 py-3 border-b border-slate-100 text-sm font-semibold text-slate-700">{t("cd.contracts")}</div>
            {contracts.length === 0 ? (
              <EmptyState icon={FileText} title={t("cd.noContractsTitle")} description={t("cd.noContractsDesc")} action={<Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> {t("cd.newContract")}</Button>} />
            ) : (
              <div className="divide-y divide-slate-100">
                {contracts.map((c) => {
                  const proj = projects.find((p) => p.id === c.projectId);
                  return (
                    <div key={c.id} className="px-5 py-4 flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-900 truncate">{c.title}</span>
                          <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[c.status] || "bg-slate-100 text-slate-500"}`}>{cEnum(c.status)}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                          <span>{enumLabel(c.type)}</span>
                          {c.startDate && <span>· {formatDate(c.startDate)}{c.endDate ? ` → ${formatDate(c.endDate)}` : ""}</span>}
                          {proj && <span>· <Link to={`/projects/${proj.id}`} className="text-blue-600 hover:underline">{proj.name}</Link></span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {c.amount ? <div className="font-semibold text-slate-900">{Number(c.amount).toLocaleString()} <span className="text-xs text-slate-400">{c.currency || ""}</span></div> : <div className="text-slate-300">—</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{t("cd.dlg.title")}</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div><Label>{t("cd.dlg.f.title")}</Label><Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder={t("cd.dlg.titlePh")} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>{t("cd.dlg.f.type")}</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTRACT_TYPES.map((s) => <SelectItem key={s} value={s}>{enumLabel(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>{t("cd.dlg.f.status")}</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CONTRACT_STATUSES.map((s) => <SelectItem key={s} value={s}>{cEnum(s)}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>{t("cd.dlg.f.amount")}</Label><Input type="number" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} /></div>
              <div><Label>{t("cd.dlg.f.currency")}</Label><Input value="USD" disabled /></div>
              <div><Label>{t("cd.dlg.f.startDate")}</Label><Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></div>
              <div><Label>{t("cd.dlg.f.endDate")}</Label><Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></div>
            </div>
            <div><Label>{t("cd.dlg.f.notes")}</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>{t("common.cancel")}</Button>
            <Button onClick={save} disabled={saving || !form.title.trim()}>{saving ? t("common.creating") : t("cd.create")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}