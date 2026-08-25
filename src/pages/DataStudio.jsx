import React, { useEffect, useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import EmptyState, { PageHeader, SkeletonCard } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  BarChart3, LineChart as LineIcon, PieChart as PieIcon, RefreshCw, BarChart2, Sparkles, Layers,
  FolderOpen, X,
} from "lucide-react";
import { pickLocalFiles, fileToAssetShape, isClientParseable, analyzeViaAI } from "@/lib/localDataParse";
import {
  ResponsiveContainer, BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { relativeTime } from "@/lib/bossai";
import { useLanguage } from "@/lib/i18n";

const COLORS = ["#2563eb", "#16a34a", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4", "#ec4899", "#64748b"];

const datasetsOf = (f) => (Array.isArray(f?.aiData?.datasets) ? f.aiData.datasets : []);

export default function DataStudio() {
  const { projects, projectName } = useLookups();
  const { t } = useLanguage();
  const enumLabel = (k) => (k ? t("enum." + k) : k);
  const [assets, setAssets] = useState(null);
  const [selected, setSelected] = useState([]); // file ids, order matters
  const [projectFilter, setProjectFilter] = useState("all");
  const [chartMode, setChartMode] = useState("auto"); // auto | line | bar
  const [busyId, setBusyId] = useState(null);
  const [localFiles, setLocalFiles] = useState([]);
  const [localBusy, setLocalBusy] = useState(false);
  const [localStage, setLocalStage] = useState("");
  const [localErr, setLocalErr] = useState("");

  const openLocal = async () => {
    setLocalErr("");
    setLocalBusy(true);
    setLocalStage("");
    try {
      const files = await pickLocalFiles();
      if (files.length === 0) return;
      const clientFiles = files.filter(isClientParseable);
      const aiFiles = files.filter((f) => !isClientParseable(f));

      // CSV / TSV / JSON — parse in the browser, nothing uploaded.
      if (clientFiles.length) {
        const shaped = await Promise.all(clientFiles.map((f) => fileToAssetShape(f).catch(() => null)));
        const ok = shaped.filter(Boolean);
        if (ok.length) {
          setLocalFiles((cur) => [...cur, ...ok]);
          setSelected((cur) => [...cur, ok[0].id]);
        }
        if (clientFiles.length - ok.length > 0) setLocalErr(t("ds.localParseErr", { name: "" }));
      }

      // PDF / images / office — upload + AI extraction, then visualize.
      let firstAiId = null;
      for (const f of aiFiles) {
        setLocalStage(t("ds.localAiStage") + " · " + f.name);
        try {
          const asset = await analyzeViaAI(f);
          if (asset && !firstAiId) firstAiId = asset.id;
        } catch {
          setLocalErr((cur) => (cur ? cur + " " : "") + t("ds.localAiErr", { name: f.name }));
        }
      }
      if (aiFiles.length) {
        await load();
        if (firstAiId) setSelected((cur) => (cur.includes(firstAiId) ? cur : [...cur, firstAiId]));
      }
    } finally {
      setLocalBusy(false);
      setLocalStage("");
    }
  };

  const removeLocal = (id) => {
    setLocalFiles((cur) => cur.filter((f) => f.id !== id));
    setSelected((cur) => cur.filter((x) => x !== id));
  };

  const load = async () => {
    setAssets(await base44.entities.FileAsset.list("-created_date", 500));
  };
  useEffect(() => { load(); }, []);

  const allFiles = useMemo(() => [...localFiles, ...(assets || [])], [localFiles, assets]);
  const filesWith = useMemo(() => allFiles.filter((f) => datasetsOf(f).length > 0), [allFiles]);

  const list = useMemo(() => {
    const sys = !assets ? [] : (projectFilter === "all" ? assets : assets.filter((f) => f.projectId === projectFilter));
    return [...localFiles, ...sys];
  }, [localFiles, assets, projectFilter]);

  const selectedFiles = useMemo(
    () => selected.map((id) => allFiles.find((f) => f.id === id)).filter(Boolean),
    [selected, allFiles]
  );

  const reanalyze = async (id) => {
    setBusyId(id);
    try {
      await base44.functions.invoke("processFileAsset", { fileAssetId: id });
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const toggle = (id) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  // Compare mode: group datasets by name across selected files
  const compared = useMemo(() => {
    if (selectedFiles.length < 2) return [];
    const groups = {};
    selectedFiles.forEach((f) => {
      datasetsOf(f).forEach((d) => {
        const key = d.name || "Series";
        if (!groups[key]) groups[key] = { name: key, unit: d.unit, xLabel: d.xLabel, yLabel: d.yLabel, files: [] };
        groups[key].files.push({ file: f, dataset: d });
      });
    });
    return Object.values(groups).filter((g) => g.files.length > 0);
  }, [selectedFiles]);

  // Build chart rows for a compare group: union labels in file order
  const buildCompareData = (group) => {
    const labels = [];
    group.files.forEach(({ dataset }) => {
      dataset.labels.forEach((l) => { if (!labels.includes(l)) labels.push(l); });
    });
    return labels.map((l) => {
      const row = { label: l };
      group.files.forEach(({ file, dataset }) => {
        const idx = dataset.labels.indexOf(l);
        row[file.name] = idx >= 0 ? dataset.values[idx] : null;
      });
      return row;
    });
  };

  const renderSingleCharts = () => {
    const f = selectedFiles[0];
    const sets = datasetsOf(f);
    if (sets.length === 0) {
      return (
        <EmptyState
          icon={BarChart2}
          title={t("ds.noChartable")}
          description={t("ds.noChartableDesc")}
          action={<Button onClick={() => reanalyze(f.id)} disabled={busyId === f.id}><RefreshCw className={`h-4 w-4 mr-1.5 ${busyId === f.id ? "animate-spin" : ""}`} /> {t("ds.reanalyze")}</Button>}
        />
      );
    }
    return (
      <div className="space-y-5">
        {f.aiSummary && (
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4 flex gap-3">
            <Sparkles className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div>
              <div className="text-sm font-medium text-slate-800">{t("ds.aiAnalysis")}</div>
              <p className="text-sm text-slate-600 mt-0.5">{f.aiSummary}</p>
              {f.keywords?.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {f.keywords.map((k) => <span key={k} className="text-[11px] bg-white text-slate-500 px-1.5 py-0.5 rounded border border-slate-200">{k}</span>)}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-400 mr-1">{t("ds.chartType")}</span>
          <Button size="sm" variant={chartMode === "auto" ? "default" : "outline"} onClick={() => setChartMode("auto")}>{t("ds.auto")}</Button>
          <Button size="sm" variant={chartMode === "line" ? "default" : "outline"} onClick={() => setChartMode("line")}><LineIcon className="h-3.5 w-3.5 mr-1" />{t("ds.line")}</Button>
          <Button size="sm" variant={chartMode === "bar" ? "default" : "outline"} onClick={() => setChartMode("bar")}><BarChart3 className="h-3.5 w-3.5 mr-1" />{t("ds.bar")}</Button>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {sets.map((d, i) => {
            const data = d.labels.map((l, j) => ({ label: l, value: d.values[j] }));
            const type = chartMode === "auto" ? d.chartType : chartMode;
            return (
              <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-semibold text-slate-800">{d.name}</h4>
                  <span className="text-xs text-slate-400">{d.unit || ""}{d.values.length} {t("ds.pts")}</span>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    {type === "pie" ? (
                      <PieChart>
                        <Pie data={data} dataKey="value" nameKey="label" cx="50%" cy="50%" outerRadius={80} label>
                          {data.map((_, idx) => <Cell key={idx} fill={COLORS[idx % COLORS.length]} />)}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    ) : type === "line" ? (
                      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <Tooltip />
                        <Line dataKey="value" stroke={COLORS[i % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} name={d.name} />
                      </LineChart>
                    ) : (
                      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <Tooltip />
                        <Bar dataKey="value" fill={COLORS[i % COLORS.length]} name={d.name} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderCompareCharts = () => (
    <div className="space-y-5">
      <div className="rounded-xl border border-violet-100 bg-violet-50/50 p-4 flex gap-3">
        <Layers className="h-5 w-5 text-violet-500 shrink-0 mt-0.5" />
        <div>
          <div className="text-sm font-medium text-slate-800">{t("ds.comparing", { n: selectedFiles.length })}</div>
          <p className="text-sm text-slate-600 mt-0.5">{t("ds.compareDesc")}</p>
          <div className="flex flex-wrap gap-1 mt-2">
            {selectedFiles.map((f) => <span key={f.id} className="text-[11px] bg-white text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">{f.name}</span>)}
          </div>
        </div>
      </div>
      {compared.length === 0 ? (
        <EmptyState icon={Layers} title={t("ds.noShared")} description={t("ds.noSharedDesc")} />
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {compared.map((g, gi) => {
            const data = buildCompareData(g);
            const type = chartMode === "line" ? "line" : "bar";
            return (
              <div key={gi} className="rounded-xl border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-sm font-semibold text-slate-800">{g.name}</h4>
                  <span className="text-xs text-slate-400">{g.unit || ""}{t("ds.filesCount", { n: g.files.length })}</span>
                </div>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    {type === "line" ? (
                      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <Tooltip />
                        <Legend />
                        {g.files.map(({ file }, fi) => (
                          <Line key={file.id} dataKey={file.name} stroke={COLORS[fi % COLORS.length]} strokeWidth={2} dot={{ r: 3 }} connectNulls />
                        ))}
                      </LineChart>
                    ) : (
                      <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                        <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <YAxis tick={{ fontSize: 11 }} stroke="#94a3b8" />
                        <Tooltip />
                        <Legend />
                        {g.files.map(({ file }, fi) => (
                          <Bar key={file.id} dataKey={file.name} fill={COLORS[fi % COLORS.length]} radius={[3, 3, 0, 0]} />
                        ))}
                      </BarChart>
                    )}
                  </ResponsiveContainer>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div>
      <PageHeader
        title={t("ds.title")}
        subtitle={t("ds.subtitle")}
        actions={
          <Button variant="outline" onClick={openLocal} disabled={localBusy}>
            <FolderOpen className="h-4 w-4 mr-1.5" /> {localBusy ? t("ds.localBusy") : t("ds.openLocal")}
          </Button>
        }
      />
      <p className="text-xs text-slate-400 -mt-4 mb-4">{t("ds.localAiNote")}</p>
      {localStage && <p className="text-xs text-blue-600 mb-3 flex items-center gap-1.5"><RefreshCw className="h-3.5 w-3.5 animate-spin" />{localStage}</p>}
      {localErr && <p className="text-xs text-rose-600 mb-3">{localErr}</p>}

      <div className="grid grid-cols-1 lg:grid-cols-[320px_1fr] gap-5">
        {/* File list */}
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between gap-2">
            <span className="text-sm font-semibold text-slate-700">{t("ds.files")}</span>
            <Select value={projectFilter} onValueChange={setProjectFilter}>
              <SelectTrigger className="h-8 w-40 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">{t("ds.allProjects")}</SelectItem>{projects.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-slate-50">
            {!assets ? (
              <div className="p-3 space-y-2">{[...Array(4)].map((_, i) => <SkeletonCard key={i} />)}</div>
            ) : list.length === 0 ? (
              <div className="p-6"><EmptyState icon={BarChart2} title={t("ds.noFiles")} description={t("ds.noFilesDesc")} /></div>
            ) : (
              list.map((f) => {
                const has = datasetsOf(f).length > 0;
                const isSel = selected.includes(f.id);
                return (
                  <button
                    key={f.id}
                    onClick={() => toggle(f.id)}
                    className={`w-full text-left px-4 py-3 flex items-start gap-3 transition-colors ${isSel ? "bg-blue-50" : "hover:bg-slate-50"}`}
                  >
                    <div className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${isSel ? "bg-blue-600 border-blue-600" : "border-slate-300"}`}>
                      {isSel && <span className="text-white text-[10px]">✓</span>}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-slate-800 truncate">{f.name}</span>
                        {has && <span className="text-[10px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded-full shrink-0">{datasetsOf(f).length} {t("ds.setUnit")}</span>}
                        {f._local && <span className="text-[10px] bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded-full shrink-0">{t("ds.localBadge")}</span>}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 truncate">
                        {f.documentType || enumLabel(f.type)} · {f._local ? t("ds.localBadge") : relativeTime(f.created_date)}{f.projectId ? ` · ${projectName(f.projectId)}` : ""}
                      </div>
                      {!has && f._local && (
                        <p className="mt-1 text-[11px] text-slate-400">{t("ds.localNoData")}</p>
                      )}
                      {!has && !f._local && (
                        <button
                          onClick={(e) => { e.stopPropagation(); reanalyze(f.id); }}
                          disabled={busyId === f.id}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                        >
                          <RefreshCw className={`h-3 w-3 ${busyId === f.id ? "animate-spin" : ""}`} /> {t("ds.extractData")}
                        </button>
                      )}
                      {f._local && (
                        <button
                          onClick={(e) => { e.stopPropagation(); removeLocal(f.id); }}
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-rose-600 hover:underline"
                        >
                          <X className="h-3 w-3" /> {t("ds.removeLocal")}
                        </button>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
          {assets && filesWith.length > 0 && (
            <div className="px-4 py-2 border-t border-slate-100 text-[11px] text-slate-400">
              {t("ds.filesWith", { n: filesWith.length, m: selected.length })}
              {selected.length > 0 && <button onClick={() => setSelected([])} className="ml-2 text-blue-600 hover:underline">{t("ds.clear")}</button>}
            </div>
          )}
        </div>

        {/* Visualization */}
        <div className="min-w-0">
          {selected.length === 0 ? (
            <EmptyState icon={BarChart3} title={t("ds.selectToVisualize")} description={t("ds.selectToVisualizeDesc")} />
          ) : selected.length === 1 ? (
            renderSingleCharts()
          ) : (
            renderCompareCharts()
          )}
        </div>
      </div>
    </div>
  );
}