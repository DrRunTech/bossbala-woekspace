import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import EmptyState, { PageHeader, SkeletonCard } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Briefcase, Plus, Filter, Mail, Phone } from "lucide-react";

const CLIENT_STATUSES = ["Lead", "Active", "Inactive", "Churned"];
const empty = { name: "", company: "", contactPerson: "", email: "", phone: "", industry: "", status: "Lead", address: "", notes: "" };

const STATUS_STYLES = {
  Lead: "bg-amber-50 text-amber-700",
  Active: "bg-emerald-50 text-emerald-700",
  Inactive: "bg-slate-100 text-slate-500",
  Churned: "bg-rose-50 text-rose-700",
};

export default function Clients() {
  const [clients, setClients] = useState(null);
  const [contracts, setContracts] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");

  const load = async () => {
    const [c, k] = await Promise.all([
      base44.entities.Client.list("-created_date"),
      base44.entities.Contract.list("-created_date", 500),
    ]);
    setClients(c);
    setContracts(k);
  };
  useEffect(() => { load(); }, []);

  const statsFor = (cid) => {
    const cs = contracts?.filter((x) => x.clientId === cid) || [];
    const active = cs.filter((x) => x.status === "Active").length;
    const value = cs.reduce((s, x) => s + (Number(x.amount) || 0), 0);
    return { count: cs.length, active, value };
  };

  const save = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      const me = await base44.auth.me();
      await base44.entities.Client.create({ ...form, organizationId: me.organizationId, tags: [] });
      setForm(empty);
      setOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!clients) return [];
    return statusFilter === "all" ? clients : clients.filter((c) => c.status === statusFilter);
  }, [clients, statusFilter]);

  const totalValue = useMemo(
    () => (contracts || []).reduce((s, x) => s + (Number(x.amount) || 0), 0),
    [contracts]
  );

  return (
    <div>
      <PageHeader
        title="Clients"
        subtitle="Manage customers and contracts across your projects"
        actions={<Button onClick={() => { setForm(empty); setOpen(true); }}><Plus className="h-4 w-4 mr-1.5" /> New Client</Button>}
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">Total Clients</div>
          <div className="text-xl font-semibold text-slate-900 mt-1">{clients?.length ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">Active</div>
          <div className="text-xl font-semibold text-slate-900 mt-1">{clients ? clients.filter((c) => c.status === "Active").length : "—"}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">Contracts</div>
          <div className="text-xl font-semibold text-slate-900 mt-1">{contracts?.length ?? "—"}</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4">
          <div className="text-xs text-slate-400">Contract Value</div>
          <div className="text-xl font-semibold text-slate-900 mt-1">{totalValue ? totalValue.toLocaleString() : "—"}</div>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400 mr-1">
          <Filter className="h-3.5 w-3.5" /> Filter
        </div>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Statuses</SelectItem>
            {CLIENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {!clients ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">{[...Array(6)].map((_, i) => <SkeletonCard key={i} />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title={clients.length === 0 ? "No clients yet" : "No clients match this filter"}
          description={clients.length === 0 ? "Add a client to start tracking contracts and revenue." : "Try a different status filter."}
          action={clients.length === 0 ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-1.5" /> New Client</Button> : null}
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => {
            const s = statsFor(c.id);
            return (
              <Link key={c.id} to={`/clients/${c.id}`} className="group rounded-xl border border-slate-200 bg-white p-5 hover:shadow-sm hover:border-slate-300 transition-all">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="font-semibold text-slate-900 group-hover:text-blue-700 transition-colors truncate">{c.name}</h3>
                    {c.company && <p className="text-sm text-slate-500 truncate">{c.company}</p>}
                  </div>
                  <span className={`shrink-0 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[c.status] || "bg-slate-100 text-slate-500"}`}>{c.status}</span>
                </div>
                {c.industry && <div className="text-xs text-slate-400 mt-2">{c.industry}</div>}
                <div className="flex flex-col gap-1 mt-3 text-xs text-slate-500">
                  {c.email && <span className="flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" /> {c.email}</span>}
                  {c.phone && <span className="flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" /> {c.phone}</span>}
                </div>
                <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-slate-100 text-sm">
                  <div><div className="text-xs text-slate-400">Contracts</div><div className="text-slate-700">{s.count}</div></div>
                  <div><div className="text-xs text-slate-400">Active</div><div className="text-slate-700">{s.active}</div></div>
                  <div><div className="text-xs text-slate-400">Value</div><div className="text-slate-700">{s.value ? s.value.toLocaleString() : "—"}</div></div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>New Client</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Client Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Acme Inc." /></div>
              <div><Label>Company</Label><Input value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} /></div>
              <div><Label>Contact Person</Label><Input value={form.contactPerson} onChange={(e) => setForm({ ...form, contactPerson: e.target.value })} /></div>
              <div><Label>Industry</Label><Input value={form.industry} onChange={(e) => setForm({ ...form, industry: e.target.value })} placeholder="e.g. Manufacturing" /></div>
              <div><Label>Email</Label><Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
              <div><Label>Phone</Label><Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
              <div>
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{CLIENT_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div><Label>Address</Label><Input value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} /></div>
            </div>
            <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={saving || !form.name.trim()}>{saving ? "Creating…" : "Create Client"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}