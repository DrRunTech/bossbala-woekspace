import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader } from "@/components/EmptyState";
import { TypeBadge } from "@/components/ui/badges";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Files, Upload, ShieldCheck, FileText } from "lucide-react";

const empty = { name: "", type: "Document", category: "Other", projectId: "", uploadedBy: "", description: "", tags: "", isEvidence: false };

export default function FilesPage() {
  const { members, projects, memberName, projectName } = useLookups();
  const [files, setFiles] = useState(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [uploading, setUploading] = useState(false);
  const [fileObj, setFileObj] = useState(null);
  const [filters, setFilters] = useState({ project: "all", type: "all", category: "all", evidenceOnly: false });
  const fileInput = useRef(null);

  const load = async () => setFiles(await base44.entities.FileItem.list("-created_date", 500));
  useEffect(() => { load(); }, []);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    if (f) { setFileObj(f); setForm((p) => ({ ...p, name: p.name || f.name })); }
  };

  const save = async () => {
    if (!fileObj || !form.uploadedBy) return;
    setUploading(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file: fileObj });
      await base44.entities.FileItem.create({
        name: form.name || fileObj.name,
        type: form.type,
        fileUrl: file_url,
        fileSize: fileObj.size,
        projectId: form.projectId || undefined,
        uploadedBy: form.uploadedBy,
        description: form.description,
        tags: form.tags ? form.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
        isEvidence: form.isEvidence,
        category: form.category,
      });
      setForm(empty); setFileObj(null); setOpen(false); await load();
    } finally { setUploading(false); }
  };

  const filtered = (files || []).filter((f) =>
    (filters.project === "all" || f.projectId === filters.project) &&
    (filters.type === "all" || f.type === filters.type) &&
    (filters.category === "all" || f.category === filters.category) &&
    (!filters.evidenceOnly || f.isEvidence)
  );

  return (
    <div>
      <PageHeader
        title="Files"
        subtitle="Research files and evidence library"
        actions={<Button onClick={() => { setForm(empty); setFileObj(null); setOpen(true); }} disabled={!members.length}><Upload className="h-4 w-4 mr-1.5" /> Upload</Button>}
      />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <Select value={filters.project} onValueChange={(v) => setFilters({ ...filters, project: v })}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Projects</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.type} onValueChange={(v) => setFilters({ ...filters, type: v })}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Types</SelectItem>{["Document", "Data", "Code", "Image", "Video", "Presentation", "Spreadsheet", "Other"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.category} onValueChange={(v) => setFilters({ ...filters, category: v })}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Category" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Categories</SelectItem>{["RawData", "ProcessedData", "Draft", "Publication", "Code", "Protocol", "Report", "Other"].map((s) => <SelectItem key={s} value={s}>{s.replace(/([A-Z])/g, " $1").trim()}</SelectItem>)}</SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <Checkbox checked={filters.evidenceOnly} onCheckedChange={(v) => setFilters({ ...filters, evidenceOnly: !!v })} />
          Evidence only
        </label>
      </div>

      {!files ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <div key={i} className="h-32 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Files} title="No files found" description="Upload research files, data, and evidence to build your library." action={<Button onClick={() => setOpen(true)} disabled={!members.length}><Upload className="h-4 w-4 mr-1.5" /> Upload</Button>} />
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {filtered.map((f) => (
            <a key={f.id} href={f.fileUrl} target="_blank" rel="noreferrer" className="group rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm hover:border-slate-300 transition-all">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500"><FileText className="h-5 w-5" /></div>
                {f.isEvidence && <span className="flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full"><ShieldCheck className="h-3 w-3" /> Evidence</span>}
              </div>
              <h3 className="text-sm font-medium text-slate-800 mt-3 truncate group-hover:text-blue-700">{f.name}</h3>
              <div className="flex items-center gap-2 mt-2">
                <TypeBadge type={f.type} />
              </div>
              <div className="text-xs text-slate-400 mt-2 truncate">{projectName(f.projectId)} · {memberName(f.uploadedBy)}</div>
            </a>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Upload File</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div>
              <Label>File</Label>
              <div className="mt-1 flex items-center justify-center w-full">
                <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                  <div className="flex flex-col items-center gap-1.5 text-slate-400">
                    <Upload className="h-6 w-6" />
                    <span className="text-sm">{fileObj ? fileObj.name : "Click to select a file"}</span>
                  </div>
                  <input ref={fileInput} type="file" className="hidden" onChange={onFile} />
                </label>
              </div>
            </div>
            <div><Label>Display Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={fileObj?.name || ""} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["Document", "Data", "Code", "Image", "Video", "Presentation", "Spreadsheet", "Other"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["RawData", "ProcessedData", "Draft", "Publication", "Code", "Protocol", "Report", "Other"].map((s) => <SelectItem key={s} value={s}>{s.replace(/([A-Z])/g, " $1").trim()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Project</Label>
                <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Uploaded By</Label>
                <Select value={form.uploadedBy} onValueChange={(v) => setForm({ ...form, uploadedBy: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Tags (comma separated)</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <Checkbox checked={form.isEvidence} onCheckedChange={(v) => setForm({ ...form, isEvidence: !!v })} />
              Mark as research evidence
            </label>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={save} disabled={uploading || !fileObj || !form.uploadedBy}>{uploading ? "Uploading…" : "Upload"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}