import React, { useEffect, useMemo, useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Files, Upload, ShieldCheck, FileText, HardDrive, Hash, Sparkles, AlertCircle, Search } from "lucide-react";
import { relativeTime } from "@/lib/bossai";
import { logActivity } from "@/lib/logActivity";
import {
  uploadToStorage, computeChecksum, detectDocumentType, isAllowedFile, entityTypeFor, shouldSummarize,
  ALLOWED_DOCUMENT_TYPES, getStorageBackend, availableBackends,
} from "@/lib/storage";

const empty = { name: "", category: "Other", projectId: "", taskId: "", uploadedBy: "", description: "", tags: "", isEvidence: false };

const DOCTYPE_COLORS = {
  PDF: "bg-rose-100 text-rose-700",
  Word: "bg-blue-100 text-blue-700",
  Excel: "bg-emerald-100 text-emerald-700",
  PowerPoint: "bg-orange-100 text-orange-700",
  CSV: "bg-teal-100 text-teal-700",
  TXT: "bg-slate-100 text-slate-600",
  JPG: "bg-violet-100 text-violet-700",
  PNG: "bg-violet-100 text-violet-700",
  ZIP: "bg-amber-100 text-amber-700",
  Other: "bg-slate-100 text-slate-500",
};

function formatBytes(bytes) {
  if (!bytes && bytes !== 0) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

export default function FilesPage() {
  const { members, projects, memberName, projectName } = useLookups();
  const [assets, setAssets] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [fileObj, setFileObj] = useState(null);
  const [fileError, setFileError] = useState("");
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [filters, setFilters] = useState({ project: "all", docType: "all", evidenceOnly: false, q: "" });
  const fileInput = useRef(null);

  const load = async () => {
    const [a, t] = await Promise.all([
      base44.entities.FileAsset.list("-created_date", 500),
      base44.entities.Task.list("-created_date", 200),
    ]);
    setAssets(a);
    setTasks(t);
  };
  useEffect(() => { load(); }, []);

  const onFile = (e) => {
    const f = e.target.files?.[0];
    setFileError("");
    if (!f) { setFileObj(null); return; }
    if (!isAllowedFile(f)) {
      setFileObj(null);
      setFileError(`Unsupported type. Allowed: ${ALLOWED_DOCUMENT_TYPES.join(", ")}`);
      return;
    }
    setFileObj(f);
    setForm((p) => ({ ...p, name: p.name || f.name }));
  };

  const save = async () => {
    if (!fileObj || !form.uploadedBy) return;
    setBusy(true);
    setStage("Checking for duplicates…");
    try {
      const me = await base44.auth.me();
      const documentType = detectDocumentType(fileObj);
      const checksum = await computeChecksum(fileObj);
      const existing = await base44.entities.FileAsset.filter({ checksum }, "-created_date", 1);

      let fileUrl, storageRef, storageBackend, aiSummary = "", keywords = [];
      let version = 1;
      let reused = false;

      if (existing.length > 0) {
        // Dedup: reuse the physical file, don't upload again.
        const ref = existing[0];
        fileUrl = ref.fileUrl;
        storageRef = ref.storageRef;
        storageBackend = ref.storageBackend || "base44";
        aiSummary = ref.aiSummary || "";
        keywords = ref.keywords || [];
        version = (ref.version || 1) + 1;
        reused = true;
        setStage("Reusing existing file (deduplicated)…");
      } else {
        setStage("Uploading to storage…");
        const stored = await uploadToStorage(fileObj);
        fileUrl = stored.fileUrl;
        storageRef = stored.storageRef;
        storageBackend = stored.backend;

        // AI summary + keywords from the file content.
        if (shouldSummarize(documentType)) {
          setStage("Generating AI summary…");
          try {
            const res = await base44.integrations.Core.InvokeLLM({
              prompt: "You are a research lab assistant. Summarize this file in 1-2 plain sentences and extract 3-6 relevant research keywords. Return JSON only.",
              file_urls: [fileUrl],
              response_json_schema: {
                type: "object",
                properties: { summary: { type: "string" }, keywords: { type: "array", items: { type: "string" } } },
              },
            });
            aiSummary = res.summary || "";
            keywords = (res.keywords || []).slice(0, 8);
          } catch { /* best effort */ }
        }
      }

      setStage("Saving file record…");
      const created = await base44.entities.FileAsset.create({
        organizationId: me.organizationId,
        name: form.name || fileObj.name,
        type: entityTypeFor(documentType),
        documentType,
        fileUrl,
        fileSize: fileObj.size,
        mimeType: fileObj.type,
        storageRef,
        storageBackend,
        projectId: form.projectId || undefined,
        taskId: form.taskId || undefined,
        uploadedBy: form.uploadedBy,
        description: form.description,
        tags: form.tags ? form.tags.split(",").map((s) => s.trim()).filter(Boolean) : [],
        category: form.category,
        isEvidence: form.isEvidence,
        checksum,
        version,
        aiSummary,
        keywords,
      });

      logActivity({
        type: "FILE_UPLOAD",
        projectId: form.projectId || undefined,
        taskId: form.taskId || undefined,
        fileRefs: [created.id],
        title: `Uploaded ${created.name}${reused ? " (deduplicated)" : ""}`,
        description: aiSummary ? aiSummary.slice(0, 140) : undefined,
        source: "Auto",
      });

      setForm(empty); setFileObj(null); setOpen(false); await load();
    } finally {
      setBusy(false);
      setStage("");
    }
  };

  const filtered = useMemo(() => {
    if (!assets) return [];
    return assets.filter((f) => {
      if (filters.project !== "all" && f.projectId !== filters.project) return false;
      if (filters.docType !== "all" && f.documentType !== filters.docType) return false;
      if (filters.evidenceOnly && !f.isEvidence) return false;
      if (filters.q) {
        const q = filters.q.toLowerCase();
        const hay = [f.name, f.aiSummary, ...(f.keywords || []), f.description].join(" ").toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [assets, filters]);

  const backends = availableBackends();

  return (
    <div>
      <PageHeader
        title="Files"
        subtitle="Research file library — metadata and AI summaries, with deduplicated storage."
        actions={<Button onClick={() => { setForm(empty); setFileObj(null); setFileError(""); setOpen(true); }} disabled={!members.length}><Upload className="h-4 w-4 mr-1.5" /> Upload</Button>}
      />

      <div className="flex items-center gap-2 mb-5 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
          <Input value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} placeholder="Search name, keywords, summary…" className="w-64 pl-8" />
        </div>
        <Select value={filters.project} onValueChange={(v) => setFilters({ ...filters, project: v })}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Project" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Projects</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filters.docType} onValueChange={(v) => setFilters({ ...filters, docType: v })}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Type" /></SelectTrigger>
          <SelectContent><SelectItem value="all">All Types</SelectItem>{ALLOWED_DOCUMENT_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
        </Select>
        <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
          <Checkbox checked={filters.evidenceOnly} onCheckedChange={(v) => setFilters({ ...filters, evidenceOnly: !!v })} />
          Evidence only
        </label>
        <div className="ml-auto flex items-center gap-1.5 text-xs text-slate-400">
          <HardDrive className="h-3.5 w-3.5" /> Storage: {backends.find((b) => b.name === getStorageBackend())?.label || getStorageBackend()}
        </div>
      </div>

      {!assets ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">{[...Array(8)].map((_, i) => <div key={i} className="h-40 rounded-xl bg-slate-100 animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={Files} title="No files found" description={`Upload research files — supports ${ALLOWED_DOCUMENT_TYPES.join(", ")}. Files are deduplicated by content checksum and enriched with AI summaries.`} action={<Button onClick={() => setOpen(true)} disabled={!members.length}><Upload className="h-4 w-4 mr-1.5" /> Upload</Button>} />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((f) => (
            <a key={f.id} href={f.fileUrl} target="_blank" rel="noreferrer" className="group rounded-xl border border-slate-200 bg-white p-4 hover:shadow-sm hover:border-slate-300 transition-all flex flex-col">
              <div className="flex items-start justify-between">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 text-slate-500 shrink-0"><FileText className="h-5 w-5" /></div>
                <div className="flex items-center gap-1.5">
                  {f.isEvidence && <span className="flex items-center gap-1 text-[11px] text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full"><ShieldCheck className="h-3 w-3" /> Evidence</span>}
                  <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${DOCTYPE_COLORS[f.documentType] || DOCTYPE_COLORS.Other}`}>{f.documentType || "Other"}</span>
                </div>
              </div>
              <h3 className="text-sm font-medium text-slate-800 mt-3 truncate group-hover:text-blue-700" title={f.name}>{f.name}</h3>
              {f.aiSummary && <p className="text-xs text-slate-500 mt-1 line-clamp-2">{f.aiSummary}</p>}
              {f.keywords?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {f.keywords.slice(0, 4).map((k) => <span key={k} className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{k}</span>)}
                </div>
              )}
              <div className="flex items-center gap-2 flex-wrap mt-3 pt-3 border-t border-slate-50 text-[11px] text-slate-400">
                <span>{formatBytes(f.fileSize)}</span>
                <span>·</span>
                <span className="truncate max-w-[90px]">{memberName(f.uploadedBy)}</span>
                {f.projectId && <><span>·</span><span className="truncate max-w-[90px]">{projectName(f.projectId)}</span></>}
                <span className="ml-auto">{relativeTime(f.created_date)}</span>
              </div>
              <div className="flex items-center gap-3 mt-2 text-[10px] text-slate-400">
                <span className="flex items-center gap-1" title="Storage backend"><HardDrive className="h-3 w-3" />{f.storageBackend || "base44"}</span>
                {f.checksum && <span className="flex items-center gap-1" title={f.checksum}><Hash className="h-3 w-3" />{f.checksum.slice(0, 8)}</span>}
                {f.version > 1 && <span>v{f.version}</span>}
                {f.aiSummary && <span className="flex items-center gap-1 text-blue-500"><Sparkles className="h-3 w-3" />AI</span>}
              </div>
            </a>
          ))}
        </div>
      )}

      <Dialog open={open} onOpenChange={(o) => !busy && setOpen(o)}>
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
                    {fileObj && <span className="text-[11px] text-slate-400">{formatBytes(fileObj.size)} · {detectDocumentType(fileObj)}</span>}
                  </div>
                  <input ref={fileInput} type="file" className="hidden" onChange={onFile} accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.jpg,.jpeg,.png,.zip" />
                </label>
              </div>
              {fileError && <p className="flex items-center gap-1.5 text-xs text-rose-600 mt-1.5"><AlertCircle className="h-3.5 w-3.5" />{fileError}</p>}
              <p className="text-[11px] text-slate-400 mt-1">Allowed: {ALLOWED_DOCUMENT_TYPES.join(", ")}. Duplicates are detected by checksum and not re-stored.</p>
            </div>
            <div><Label>Display Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder={fileObj?.name || ""} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Project</Label>
                <Select value={form.projectId} onValueChange={(v) => setForm({ ...form, projectId: v, taskId: "" })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Task</Label>
                <Select value={form.taskId} onValueChange={(v) => setForm({ ...form, taskId: v })}>
                  <SelectTrigger><SelectValue placeholder="Optional" /></SelectTrigger>
                  <SelectContent><SelectItem value={null}>None</SelectItem>{tasks.filter((t) => !form.projectId || t.projectId === form.projectId).map((t) => <SelectItem key={t.id} value={t.id}>{t.title}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Uploaded By</Label>
                <Select value={form.uploadedBy} onValueChange={(v) => setForm({ ...form, uploadedBy: v })}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>{members.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["RawData", "ProcessedData", "Draft", "Publication", "Code", "Protocol", "Report", "Other"].map((s) => <SelectItem key={s} value={s}>{s.replace(/([A-Z])/g, " $1").trim()}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Description</Label><Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div><Label>Tags (comma separated)</Label><Input value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} /></div>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
              <Checkbox checked={form.isEvidence} onCheckedChange={(v) => setForm({ ...form, isEvidence: !!v })} />
              Mark as research evidence
            </label>
            {busy && <p className="text-xs text-blue-600 flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 animate-pulse" />{stage}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button onClick={save} disabled={busy || !fileObj || !form.uploadedBy || !!fileError}>{busy ? "Processing…" : "Upload"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}