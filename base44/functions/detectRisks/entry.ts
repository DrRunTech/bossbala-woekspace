import { createClientFromRequest } from 'npm:@base44/sdk@0.8.43';

// Automatic research risk detection — deterministic, evidence-first, neutral language.
// Detects: overdue tasks, stalled projects, long inactivity gaps, repeated task delays,
// abnormal activity decreases, unexpected experimental-data changes (when structured
// data exists), blocked tasks, and upcoming deadlines with insufficient progress.
// Creates AIInsight records (type=RISK) with title/content/evidence/confidence/severity.
// Never labels a person as a "poor performer" — focuses on project & work-state risks.
// Idempotent per run: each risk has a stable riskKey (stored in tags); duplicates are skipped.

const SEV_RANK = { Low: 1, Medium: 2, High: 3, Critical: 4 };
function topSev(list) { return list.reduce((a, b) => (SEV_RANK[b] > SEV_RANK[a] ? b : a), 'Low'); }
const daysAgo = (d) => Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
const msWeek = 604800000;

const MEASURE_KEYS = ['value', 'temp', 'temperature', 'rate', 'voltage', 'current', 'intensity', 'conductivity', 'thickness', 'yield', 'index', 'power', 'energy', 'resistance', 'concentration', 'signal', 'amplitude', 'frequency', 'efficiency', 'ratio', 'count', 'mass', 'length', 'area', 'speed', 'pressure', 'ph'];

function isMeasureKey(k) {
  const lk = String(k).toLowerCase();
  return MEASURE_KEYS.some((m) => lk.includes(m));
}
// Recursively collect numeric measurements from an object, keyed by measurement-like names.
function collectNumbers(obj, acc, prefix = '') {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    for (const v of obj) { if (typeof v === 'number' && isFinite(v)) acc.push({ key: prefix || 'value', value: v }); else if (v && typeof v === 'object') collectNumbers(v, acc, prefix); }
    return;
  }
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'number' && isFinite(v) && isMeasureKey(k)) acc.push({ key: k, value: v });
    else if (v && typeof v === 'object') collectNumbers(v, acc, prefix ? `${prefix}.${k}` : k);
  }
}

function meanStd(values) {
  const n = values.length;
  if (n < 2) return { mean: 0, std: 0, n };
  const mean = values.reduce((a, b) => a + b, 0) / n;
  const std = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / n);
  return { mean, std, n };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try { user = await base44.auth.me(); } catch {}

    // Service-role reads: org-wide evidence for detection (works in scheduled runs with no user).
    const [projects, tasks, activities, existing, audit, evidence, files] = await Promise.all([
      base44.asServiceRole.entities.Project.list('-created_date', 300),
      base44.asServiceRole.entities.Task.list('-created_date', 500),
      base44.asServiceRole.entities.Activity.list('-date', 500),
      base44.asServiceRole.entities.AIInsight.filter({ type: 'RISK' }, '-created_date', 500),
      base44.asServiceRole.entities.AuditLog.list('-timestamp', 500),
      base44.asServiceRole.entities.ResearchEvidence.list('-created_date', 200),
      base44.asServiceRole.entities.FileAsset.list('-created_date', 200),
    ]);

    const activeKeys = new Set((existing || []).filter((e) => e.status === 'Published').flatMap((e) => e.tags || []));
    const created = [];
    const skipped = [];

    const projName = (id) => (projects.find((p) => p.id === id) || {}).name || id || 'Unknown project';
    const projOrg = (id) => (projects.find((p) => p.id === id) || {}).organizationId;

    // Persist helper (dedup by riskKey tag).
    const record = (riskKey, { title, content, evidence, refs, severity, confidence, projectId, taskId }) => {
      if (activeKeys.has(riskKey)) { skipped.push(riskKey); return; }
      const ins = base44.asServiceRole.entities.AIInsight.create({
        organizationId: projOrg(projectId) || (projects[0] && projects[0].organizationId),
        type: 'RISK', title, summary: title, content, evidence,
        confidence, severity, projectId: projectId || undefined, taskId: taskId || undefined,
        userId: user?.id, evidenceRefs: refs, activityRefs: refs.filter((r) => r.startsWith('ACT:')).map((r) => r.slice(4)),
        risks: [], recommendations: [], period: new Date().toISOString().slice(0, 10), model: 'rule-detection', status: 'Published',
        tags: [riskKey],
      });
      created.push(riskKey);
      return ins;
    };

    const now = Date.now();

    // --- 1. Overdue tasks ---
    for (const t of tasks) {
      if (!t.dueDate || t.status === 'COMPLETED' || t.status === 'CANCELLED') continue;
      const od = daysAgo(t.dueDate);
      if (od <= 0) continue;
      const sev = od > 14 ? 'Critical' : od > 7 ? 'High' : 'Medium';
      record(`overdue:${t.id}`, {
        title: `Overdue task: ${t.title}`,
        content: `Task "${t.title}" in project "${projName(t.projectId)}" is ${od} day(s) past its due date (${t.dueDate}). Status: ${t.status}, priority ${t.priority}.`,
        evidence: `TASK:${t.id} — due ${t.dueDate}, currently ${od} days overdue.`,
        refs: [`TASK:${t.id}`, `PROJECT:${t.projectId}`],
        severity: sev, confidence: 0.99, projectId: t.projectId, taskId: t.id,
      });
    }

    // --- 7. Blocked tasks ---
    for (const t of tasks) {
      if (t.status !== 'BLOCKED') continue;
      const bd = t.updated_date ? daysAgo(t.updated_date) : 0;
      const sev = bd > 14 ? 'High' : 'Medium';
      record(`blocked:${t.id}`, {
        title: `Blocked task: ${t.title}`,
        content: `Task "${t.title}" in project "${projName(t.projectId)}" is currently blocked and may impede downstream work. It has been blocked for approximately ${bd} day(s).`,
        evidence: `TASK:${t.id} — status BLOCKED since ~${bd} day(s) ago.`,
        refs: [`TASK:${t.id}`, `PROJECT:${t.projectId}`],
        severity: sev, confidence: 0.95, projectId: t.projectId, taskId: t.id,
      });
    }

    // --- 8. Upcoming deadlines with insufficient progress ---
    for (const t of tasks) {
      if (!t.dueDate || t.status === 'COMPLETED' || t.status === 'CANCELLED' || t.status === 'BLOCKED') continue;
      const dueIn = -daysAgo(t.dueDate); // positive = future
      if (dueIn < 0 || dueIn > 7) continue;
      const recentAct = activities.filter((a) => a.projectId === t.projectId && a.date && (now - new Date(a.date).getTime()) < 7 * 86400000).length;
      const lowProgress = (projName(t.projectId) && (projects.find((p) => p.id === t.projectId) || {}).progressPercent || 0) < 30;
      if (recentAct === 0 || lowProgress) {
        const sev = dueIn <= 3 ? 'High' : 'Medium';
        record(`deadline:${t.id}`, {
          title: `Upcoming deadline with insufficient progress: ${t.title}`,
          content: `Task "${t.title}" in project "${projName(t.projectId)}" is due in ${dueIn} day(s) but shows limited recent activity (${recentAct} project activities in the last 7 days). Consider checking on progress.`,
          evidence: `TASK:${t.id} — due ${t.dueDate} (in ${dueIn} days); ${recentAct} project activities in last 7 days.`,
          refs: [`TASK:${t.id}`, `PROJECT:${t.projectId}`],
          severity: sev, confidence: 0.85, projectId: t.projectId, taskId: t.id,
        });
      }
    }

    // --- 2 & 3. Stalled projects / long inactivity gaps ---
    for (const p of projects) {
      if (p.status === 'COMPLETED' || p.status === 'ARCHIVED') continue;
      const projActs = activities.filter((a) => a.projectId === p.id);
      const lastAct = projActs.reduce((mx, a) => { const t = a.date ? new Date(a.date).getTime() : 0; return t > mx ? t : mx; }, 0);
      const gapDays = lastAct ? Math.floor((now - lastAct) / 86400000) : Infinity;
      if (gapDays >= 21) {
        record(`longgap:${p.id}`, {
          title: `No recent activity: ${p.name}`,
          content: `Project "${p.name}" (status: ${p.status}) has no logged research activity in ${gapDays === Infinity ? 'an extended' : gapDays + ' '} day(s). This may indicate the work has stalled and warrants a status check.`,
          evidence: `PROJECT:${p.id} — last activity ${lastAct ? new Date(lastAct).toISOString().slice(0, 10) : 'never'} (${gapDays === Infinity ? '∞' : gapDays} days ago).`,
          refs: [`PROJECT:${p.id}`, ...(projActs.slice(0, 3).map((a) => `ACT:${a.id}`))],
          severity: 'High', confidence: 0.9, projectId: p.id,
        });
      } else if (gapDays >= 14) {
        record(`stalled:${p.id}`, {
          title: `Project appears stalled: ${p.name}`,
          content: `Project "${p.name}" (status: ${p.status}, progress ${p.progressPercent || 0}%) has had no logged activity for ${gapDays} days. Progress may be stagnating.`,
          evidence: `PROJECT:${p.id} — last activity ${new Date(lastAct).toISOString().slice(0, 10)} (${gapDays} days ago); progress ${p.progressPercent || 0}%.`,
          refs: [`PROJECT:${p.id}`],
          severity: 'Medium', confidence: 0.85, projectId: p.id,
        });
      }
    }

    // --- 4. Repeated task delays (via AuditLog dueDate changes) ---
    const delayCounts = {};
    for (const log of (audit || [])) {
      if (!log.entityId) continue;
      const et = String(log.entityType || '').toLowerCase();
      const changesStr = JSON.stringify(log.changes || {});
      if (et.includes('task') && changesStr.toLowerCase().includes('duedate')) {
        delayCounts[log.entityId] = (delayCounts[log.entityId] || 0) + 1;
      }
    }
    for (const [tid, cnt] of Object.entries(delayCounts)) {
      if (cnt < 2) continue;
      const t = tasks.find((x) => x.id === tid);
      if (!t) continue;
      record(`repeateddelay:${tid}`, {
        title: `Repeatedly delayed task: ${t.title}`,
        content: `Task "${t.title}" in project "${projName(t.projectId)}" has had its due date changed ${cnt} time(s), suggesting a recurring scheduling issue. Review the task scope or dependencies.`,
        evidence: `${cnt} due-date changes recorded for TASK:${tid}.`,
        refs: [`TASK:${tid}`, `PROJECT:${t.projectId}`],
        severity: cnt >= 3 ? 'High' : 'Medium', confidence: 0.85, projectId: t.projectId, taskId: tid,
      });
    }

    // --- 5. Abnormal decreases in research activity (per project) ---
    for (const p of projects) {
      if (p.status === 'COMPLETED' || p.status === 'ARCHIVED') continue;
      const projActs = activities.filter((a) => a.projectId === p.id && a.date);
      const weeks = [0, 0, 0, 0, 0]; // index 0 = this week, 4 = 4 weeks ago
      for (const a of projActs) {
        const w = Math.floor((now - new Date(a.date).getTime()) / msWeek);
        if (w >= 0 && w < 5) weeks[4 - w]++;
      }
      const thisW = weeks[4];
      const prevAvg = (weeks[0] + weeks[1] + weeks[2] + weeks[3]) / 4;
      if (prevAvg >= 2 && thisW <= prevAvg * 0.5) {
        const dropPct = Math.round((1 - thisW / prevAvg) * 100);
        record(`activitydrop:${p.id}`, {
          title: `Activity drop detected: ${p.name}`,
          content: `Project "${p.name}" shows ${thisW} activity record(s) this week versus a ${prevAvg.toFixed(1)}/week average over the prior four weeks — a ~${dropPct}% decrease. This may signal a slowdown worth attention.`,
          evidence: `Weekly activity counts (oldest→newest): ${weeks.join(', ')}. This week ${thisW} vs prior-4-week avg ${prevAvg.toFixed(1)}.`,
          refs: [`PROJECT:${p.id}`, ...(projActs.slice(0, 3).map((a) => `ACT:${a.id}`))],
          severity: dropPct >= 70 ? 'High' : 'Medium', confidence: 0.75, projectId: p.id,
        });
      }
    }

    // --- 6. Unexpected changes in experimental data (only when structured numeric data exists) ---
    const byProjData = {};
    const addData = (pid, rec, refTag) => {
      if (!pid) return;
      const nums = []; collectNumbers(rec, nums);
      if (!nums.length) return;
      (byProjData[pid] ||= []).push(...nums.map((n) => ({ ...n, ref: refTag })));
    };
    for (const e of evidence) addData(e.projectId, e.metadata || {}, `EVID:${e.id}`);
    for (const f of files) addData(f.projectId, f.aiData || {}, `FILE:${f.id}`);
    for (const [pid, items] of Object.entries(byProjData)) {
      // Group by measurement key; flag per-key outliers when enough data points.
      const byKey = {};
      for (const it of items) (byKey[it.key] ||= []).push(it);
      for (const [key, vals] of Object.entries(byKey)) {
        if (vals.length < 6) continue;
        const nums = vals.map((v) => v.value);
        const { mean, std } = meanStd(nums);
        if (std === 0) continue;
        const outliers = vals.filter((v) => Math.abs(v.value - mean) > 3 * std);
        if (!outliers.length) continue;
        record(`dataanomaly:${pid}:${key}`, {
          title: `Anomalous ${key} data in ${projName(pid)}`,
          content: `Project "${projName(pid)}" shows an unexpected change in "${key}" measurements: ${outliers.length} value(s) deviate beyond 3 standard deviations from the project mean (mean ${mean.toFixed(3)}, std ${std.toFixed(3)}). Recommend verifying the corresponding data and instrument calibration.`,
          evidence: `${outliers.length}/${vals.length} "${key}" measurements exceed 3σ. Outlier refs: ${outliers.map((o) => o.ref).join(', ')}.`,
          refs: [`PROJECT:${pid}`, ...outliers.map((o) => o.ref)],
          severity: 'Medium', confidence: 0.65, projectId: pid,
        });
      }
    }

    return Response.json({ ok: true, created: created.length, skipped: skipped.length, createdKeys: created, skippedKeys: skipped });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}