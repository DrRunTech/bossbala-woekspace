import { createClientFromRequest } from 'npm:@base44/sdk@0.8.43';
import * as gateway from '../../shared/aiGateway.ts';

// Evidence-first AI analysis generator.
// Gathers concrete evidence (activities, tasks, files, ResearchEvidence, risks)
// for the requested scope BEFORE calling the LLM. Conclusions must reference real
// records. If evidence is insufficient, the insight is recorded as
// "Insufficient evidence." with confidence 0. Research progress is never fabricated.

const TYPE_PERIOD = {
  WEEKLY_SUMMARY: 7, MONTHLY_SUMMARY: 30, TREND: 84, ANOMALY: 30,
  ACTIVITY_COMPARISON: 30, PROGRESS: 30, MEMBER_ACTIVITY: 30, RISK: 30,
  SUMMARY: 30, PREDICTION: 30, RECOMMENDATION: 30,
};

const SEVERITY_RANK = { Low: 1, Medium: 2, High: 3, Critical: 4 };

function periodLabel(type, cutoff) {
  const now = new Date();
  if (type === 'WEEKLY_SUMMARY') return `Week of ${cutoff.toISOString().slice(0, 10)}`;
  if (type === 'MONTHLY_SUMMARY') return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
  return `${cutoff.toISOString().slice(0, 10)} → ${now.toISOString().slice(0, 10)}`;
}

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// Compute weekly activity counts for trend/anomaly/comparison.
function weeklyBuckets(items, weeks) {
  const buckets = {};
  const today = new Date();
  for (let i = weeks - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i * 7);
    const key = d.toISOString().slice(0, 10);
    buckets[key] = 0;
  }
  for (const it of items) {
    const day = (it.date || it.created_date || '').slice(0, 10);
    if (day in buckets) buckets[day]++;
  }
  return buckets;
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const orgId = user.data?.organizationId || user.organizationId;
    if (!orgId) return Response.json({ error: 'No organization configured for user' }, { status: 403 });

    // Analysis is a PI/lead feature — it aggregates across the organization via
    // asServiceRole, so require an authorized lead role before any query.
    const isAdmin = user.role === 'admin';
    const appRole = user.data?.appRole;
    if (!isAdmin && appRole !== 'PI' && appRole !== 'ADMIN' && appRole !== 'TEAM_LEADER') {
      return Response.json({ error: 'Forbidden: analysis requires a PI, admin, or team-lead role' }, { status: 403 });
    }

    const body = await req.json();
    const { type, projectId, memberId } = body;
    if (!type) return Response.json({ error: 'type is required' }, { status: 400 });

    // When a project is targeted, verify it belongs to the caller's organization.
    if (projectId) {
      const proj = await base44.asServiceRole.entities.Project.get(projectId);
      if (!proj || proj.organizationId !== orgId) return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    const periodDays = TYPE_PERIOD[type] || 30;
    const cutoff = isoDaysAgo(periodDays);
    const authed = await base44.auth.isAuthenticated();
    const scope = { organizationId: orgId };
    if (projectId) scope.projectId = projectId;

    // Gather evidence (service role so analysis sees the full org regardless of
    // the caller's per-record RLS — gated to lead roles above).
    const allProjects = authed ? await base44.asServiceRole.entities.Project.filter({ organizationId: orgId }, 'name', 200) : [];
    const orgProjectIds = new Set(allProjects.map((p) => p.id));

    const [activities, tasks, files, evidence, risksRaw] = await Promise.all([
      authed ? base44.asServiceRole.entities.Activity.filter(scope, '-date', 200) : [],
      authed ? base44.asServiceRole.entities.Task.filter(scope, '-created_date', 200) : [],
      authed ? base44.asServiceRole.entities.FileAsset.filter(scope, '-created_date', 80) : [],
      authed ? base44.asServiceRole.entities.ResearchEvidence.filter(scope, '-created_date', 60) : [],
      // Risk has no organizationId field, so scope by project membership: when a
      // project is targeted query by it, otherwise fetch and keep only risks whose
      // projectId belongs to the caller's organization.
      authed ? base44.asServiceRole.entities.Risk.filter(projectId ? { projectId } : {}, '-created_date', 100) : [],
    ]);
    const risks = projectId ? risksRaw : risksRaw.filter((r) => orgProjectIds.has(r.projectId));

    // Narrow to the period + member scope.
    const inPeriod = (d) => !d || new Date(d) >= new Date(cutoff);
    let acts = activities.filter((a) => inPeriod(a.date));
    let tks = tasks;
    let fls = files;
    let evs = evidence;
    if (memberId) {
      acts = acts.filter((a) => a.memberId === memberId || a.userId === memberId || a.created_by_id === memberId);
      tks = tks.filter((t) => t.assigneeId === memberId);
      fls = fls.filter((f) => f.uploadedBy === memberId);
      evs = evs.filter((e) => e.uploadedBy === memberId);
    }

    const projName = (id) => (allProjects.find((p) => p.id === id) || {}).name || id;

    // ---- Evidence digest ----
    const actDigest = acts.slice(0, 60).map((a) => `[ACT:${a.id}] ${(a.date || '').slice(0, 10)} ${a.type} — ${a.title}`).join('\n') || '(none)';
    const taskDigest = tks.slice(0, 100).map((t) => `[TASK:${t.id}] "${t.title}" [${t.status}/${t.priority}] assignee=${t.assigneeId || 'none'}${t.dueDate ? ` due=${t.dueDate}` : ''}${t.completedAt ? ` done=${t.completedAt}` : ''}`).join('\n') || '(none)';
    const fileDigest = fls.slice(0, 40).map((f) => `[FILE:${f.id}] ${f.name} (${f.documentType || f.type})${f.aiSummary ? ` — ${f.aiSummary.slice(0, 120)}` : ''}${f.isEvidence ? ' [EVIDENCE]' : ''}`).join('\n') || '(none)';
    const evDigest = evs.slice(0, 30).map((e) => `[EVID:${e.id}] ${e.title} (${e.type}) verified=${e.verified}${e.description ? ` — ${e.description.slice(0, 120)}` : ''}`).join('\n') || '(none)';
    const riskDigest = risks.slice(0, 40).map((r) => `[RISK:${r.id}] ${r.title} [${r.level}/${r.status}]${r.mitigation ? ` — ${r.mitigation.slice(0, 120)}` : ''}`).join('\n') || '(none)';

    let aggregate = '';
    if (type === 'TREND' || type === 'ANOMALY') {
      const buckets = weeklyBuckets(acts, Math.ceil(periodDays / 7));
      aggregate += `\nWeekly activity counts (last ${Math.ceil(periodDays / 7)} weeks):\n${Object.entries(buckets).map(([k, v]) => `${k}: ${v}`).join('\n')}`;
    }
    if (type === 'ACTIVITY_COMPARISON') {
      const byMember = {};
      for (const a of acts) { const m = a.memberId || a.userId || 'unknown'; byMember[m] = (byMember[m] || 0) + 1; }
      const byProject = {};
      for (const a of acts) { const p = a.projectId || 'none'; byProject[p] = (byProject[p] || 0) + 1; }
      aggregate += `\nActivity counts by member:\n${Object.entries(byMember).map(([k, v]) => `${k}: ${v}`).join('\n') || '(none)'}\nActivity counts by project:\n${Object.entries(byProject).map(([k, v]) => `${k === 'none' ? 'none' : projName(k)}: ${v}`).join('\n') || '(none)'}`;
    }

    const totalEvidence = acts.length + tks.length + fls.length + evs.length + risks.length;

    // ---- Insufficient evidence: record honestly, do not fabricate ----
    if (totalEvidence < 2) {
      const ins = await base44.entities.AIInsight.create({
        organizationId: orgId, type, projectId: projectId || undefined, memberId: memberId || undefined, userId: user.id,
        content: 'Insufficient evidence was available to produce a reliable analysis for the selected scope and period. No conclusions were generated to avoid fabricating research progress.',
        summary: 'Insufficient evidence.',
        evidence: 'No activities, tasks, files, research evidence, or risks were found for the selected scope and period.',
        confidence: 0, evidenceRefs: [], activityRefs: [], risks: [], recommendations: [],
        severity: 'Low', period: periodLabel(type, new Date(cutoff)), model: 'none', status: 'Published', tags: [],
      });
      return Response.json({ ok: true, insight: ins, insufficient: true });
    }

    const prompt = `You are BossBala, an evidence-first analyst for a university research team. PRINCIPLES:
1. Identify the underlying EVIDENCE first, before any conclusion.
2. Every conclusion MUST reference the real records below by their id tag (e.g. ACT:..., TASK:..., FILE:..., EVID:..., RISK:...).
3. NEVER fabricate research progress, results, or facts not present in the evidence.
4. If the evidence is too thin to support a conclusion, say so — do not guess.
5. Give a confidence score (0-1) reflecting how strongly the evidence supports the analysis.

Analyze the evidence and produce a "${type}" analysis${projectId ? ` for project "${projName(projectId)}"` : ''}${memberId ? ` focused on member ${memberId}` : ''} for the period ${periodLabel(type, new Date(cutoff))}.

EVIDENCE:
Activities:
${actDigest}

Tasks:
${taskDigest}

Files:
${fileDigest}

Research Evidence:
${evDigest}

Risks:
${riskDigest}
${aggregate}

Return JSON only:
{
  "summary": "2-4 sentence objective summary grounded in the evidence",
  "evidence": [{ "refType": "ACT|TASK|FILE|EVID|RISK", "refId": "ACT:<id>", "relevance": "why this evidence matters" }],
  "confidence": 0-1,
  "risks": [{ "description": "risk evident from evidence", "severity": "Low|Medium|High|Critical", "refIds": ["ACT:<id>", ...] }],
  "recommendations": [{ "action": "concrete next step", "refIds": ["ACT:<id>", ...] }]
}`;

    let result;
    try {
      result = await gateway.analyze(base44, {
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            summary: { type: 'string' },
            evidence: { type: 'array', items: { type: 'object', properties: { refType: { type: 'string' }, refId: { type: 'string' }, relevance: { type: 'string' } } } },
            confidence: { type: 'number' },
            risks: { type: 'array', items: { type: 'object', properties: { description: { type: 'string' }, severity: { type: 'string' }, refIds: { type: 'array', items: { type: 'string' } } } } },
            recommendations: { type: 'array', items: { type: 'object', properties: { action: { type: 'string' }, refIds: { type: 'array', items: { type: 'string' } } } } }
          }
        }
      });
    } catch {
      const ins = await base44.entities.AIInsight.create({
        organizationId: orgId, type, projectId: projectId || undefined, memberId: memberId || undefined, userId: user.id,
        content: 'Analysis could not be generated at this time. The underlying evidence is preserved below.', summary: 'Analysis unavailable.',
        evidence: `${acts.length} activities, ${tks.length} tasks, ${fls.length} files, ${evs.length} evidence records, ${risks.length} risks.`, confidence: 0,
        evidenceRefs: [], activityRefs: [], risks: [], recommendations: [], severity: 'Low', period: periodLabel(type, new Date(cutoff)), model: 'none', status: 'Published', tags: [],
      });
      return Response.json({ ok: false, insight: ins, error: 'LLM analysis failed' });
    }

    const evidenceList = Array.isArray(result.evidence) ? result.evidence : [];
    const riskList = Array.isArray(result.risks) ? result.risks : [];
    const recList = Array.isArray(result.recommendations) ? result.recommendations : [];
    const evidenceRefs = [...new Set(evidenceList.map((e) => e.refId).filter(Boolean))];
    const activityRefs = [...new Set(evidenceRefs.filter((r) => r.startsWith('ACT:')).map((r) => r.slice(4)))];
    const evidenceText = evidenceList.map((e) => `${e.refId || e.refType}: ${e.relevance || ''}`).join('\n') || 'See evidence refs.';

    // Severity = highest among detected risks.
    let severity = 'Low';
    for (const r of riskList) {
      const s = r.severity;
      if (SEVERITY_RANK[s] && SEVERITY_RANK[s] > SEVERITY_RANK[severity]) severity = s;
    }

    const content = [
      `## Summary\n${result.summary || ''}`,
      `## Evidence\n${evidenceText}`,
      `## Risks\n${riskList.map((r, i) => `${i + 1}. ${r.description}${r.severity ? ` (${r.severity})` : ''}${r.refIds?.length ? ` — refs: ${r.refIds.join(', ')}` : ''}`).join('\n') || '(none identified)'}`,
      `## Recommendations\n${recList.map((r, i) => `${i + 1}. ${r.action}${r.refIds?.length ? ` — refs: ${r.refIds.join(', ')}` : ''}`).join('\n') || '(none)'}`,
    ].join('\n\n');

    const ins = await base44.entities.AIInsight.create({
      organizationId: orgId, type, projectId: projectId || undefined, memberId: memberId || undefined, userId: user.id,
      content, summary: result.summary || '', evidence: evidenceText,
      confidence: typeof result.confidence === 'number' ? result.confidence : 0,
      evidenceRefs, activityRefs, risks: riskList, recommendations: recList,
      severity, period: periodLabel(type, new Date(cutoff)), model: 'automatic', status: 'Published', tags: [],
    });

    return Response.json({ ok: true, insight: ins });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}