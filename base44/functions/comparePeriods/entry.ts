import { createClientFromRequest } from 'npm:@base44/sdk@0.8.43';
import * as gateway from '../../shared/aiGateway.ts';

// Historical comparison — objective, evidence-first.
// Computes deterministic period-over-period metrics (no LLM for the numbers),
// then asks the LLM only to NARRATE the comparison and explain the limitations
// of the available evidence. A decrease in file uploads alone is NEVER interpreted
// as poor performance. Language stays neutral; no individual is labeled.

const WINDOWS = {
  today_vs_yesterday: 1,
  this_week_vs_last_week: 7,
  this_month_vs_last_month: 30,
  project_vs_previous: 30,
  member_vs_previous: 30,
};
const DAY = 86400000;

const inWin = (dStr, start, end) => {
  if (!dStr) return false;
  const t = new Date(dStr).getTime();
  return t >= start && t < end;
};

function buildMetric(label, current, previous, { snapshot = false, unit = '' } = {}) {
  let direction = 'flat';
  let change = null;
  let changePct = null;
  if (!snapshot) {
    change = current - previous;
    if (previous > 0) {
      changePct = Math.round(((current - previous) / previous) * 100);
      direction = change > 0 ? 'up' : change < 0 ? 'down' : 'flat';
    } else if (current > 0) {
      direction = 'up';
      changePct = null;
    } else {
      direction = 'flat';
    }
  }
  return { label, current, previous, change, changePct, direction, snapshot, unit };
}

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    const orgId = user?.data?.organizationId;
    if (!orgId) return Response.json({ error: 'No organization configured for user' }, { status: 403 });

    const body = await req.json().catch(() => ({}));
    const { comparisonType = 'this_week_vs_last_week', projectId, memberId } = body;
    const W = WINDOWS[comparisonType] || 7;
    const now = Date.now();
    const curStart = now - W * DAY, curEnd = now;
    const prevStart = now - 2 * W * DAY, prevEnd = now - W * DAY;

    const scopeProject = comparisonType === 'project_vs_previous' || (projectId && comparisonType !== 'member_vs_previous');
    const scopeMember = comparisonType === 'member_vs_previous' || memberId;

    const projFilter = {};
    if (orgId) projFilter.organizationId = orgId;
    if (scopeProject && projectId) projFilter.projectId = projectId;

    const [activities, tasks, files, evidence, projects] = await Promise.all([
      base44.asServiceRole.entities.Activity.list('-date', 400),
      base44.asServiceRole.entities.Task.list('-created_date', 500),
      base44.asServiceRole.entities.FileAsset.list('-created_date', 300),
      base44.asServiceRole.entities.ResearchEvidence.list('-created_date', 300),
      base44.asServiceRole.entities.Project.list('-created_date', 300),
    ]);

    // Apply scope filters.
    let acts = activities, tks = tasks, fls = files, evs = evidence;
    if (scopeProject && projectId) {
      acts = acts.filter((a) => a.projectId === projectId);
      tks = tks.filter((t) => t.projectId === projectId);
      fls = fls.filter((f) => f.projectId === projectId);
      evs = evs.filter((e) => e.projectId === projectId);
    }
    if (scopeMember && memberId) {
      acts = acts.filter((a) => a.memberId === memberId || a.userId === memberId);
      tks = tks.filter((t) => t.assigneeId === memberId);
      fls = fls.filter((f) => f.uploadedBy === memberId);
      evs = evs.filter((e) => e.uploadedBy === memberId);
    }
    if (orgId && !scopeProject && !scopeMember) {
      acts = acts.filter((a) => a.organizationId === orgId);
      tks = tks.filter((t) => t.organizationId === orgId);
      fls = fls.filter((f) => f.organizationId === orgId);
      evs = evs.filter((e) => e.organizationId === orgId);
    }

    // Objective counts (current vs previous).
    const metrics = [];
    metrics.push(buildMetric('Tasks completed',
      tks.filter((t) => inWin(t.completedAt, curStart, curEnd)).length,
      tks.filter((t) => inWin(t.completedAt, prevStart, prevEnd)).length));
    metrics.push(buildMetric('Research activities',
      acts.filter((a) => inWin(a.date, curStart, curEnd)).length,
      acts.filter((a) => inWin(a.date, prevStart, prevEnd)).length));
    metrics.push(buildMetric('File uploads',
      fls.filter((f) => inWin(f.created_date, curStart, curEnd)).length,
      fls.filter((f) => inWin(f.created_date, prevStart, prevEnd)).length));
    metrics.push(buildMetric('Evidence generated',
      evs.filter((e) => inWin(e.created_date, curStart, curEnd)).length,
      evs.filter((e) => inWin(e.created_date, prevStart, prevEnd)).length));

    // Snapshot-only metrics (no stored history → no period delta; limitation).
    if (!scopeMember) {
      const progProjects = scopeProject && projectId ? projects.filter((p) => p.id === projectId) : projects.filter((p) => p.organizationId === orgId);
      const avgProg = progProjects.length ? Math.round(progProjects.reduce((s, p) => s + (p.progressPercent || 0), 0) / progProjects.length) : 0;
      metrics.push(buildMetric('Project progress (avg %)', avgProg, null, { snapshot: true, unit: '%' }));
    }
    metrics.push(buildMetric('Blocked tasks (current)', tks.filter((t) => t.status === 'BLOCKED').length, null, { snapshot: true }));
    metrics.push(buildMetric('Overdue tasks (current)', tks.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now && t.status !== 'COMPLETED' && t.status !== 'CANCELLED').length, null, { snapshot: true }));

    const projName = (id) => (projects.find((p) => p.id === id) || {}).name || '—';
    const scopeLabel = scopeProject && projectId ? `project "${projName(projectId)}"`
      : scopeMember && memberId ? `member ${memberId}`
      : 'the whole research group';

    const metricDigest = metrics.map((m) =>
      `- ${m.label}: current=${m.current}${m.unit} | previous=${m.snapshot ? 'n/a (snapshot only)' : m.previous + m.unit}${!m.snapshot && m.change !== null ? ` | change=${m.change > 0 ? '+' : ''}${m.change}${m.changePct !== null ? ` (${m.changePct > 0 ? '+' : ''}${m.changePct}%)` : ''}` : ''}`
    ).join('\n');

    const totalCurrent = metrics.filter((m) => !m.snapshot).reduce((s, m) => s + (m.current || 0), 0);

    const prompt = `You are BossBala, an evidence-first analyst for a university research team. You are producing a historical comparison for ${scopeLabel}.
PRINCIPLES:
1. Use ONLY the objective metric numbers provided. Do NOT invent numbers.
2. Describe changes neutrally and objectively.
3. NEVER interpret a decrease in "File uploads" alone as poor performance — file uploads reflect documentation cadence, not research output or productivity.
4. Do NOT label any individual as a poor performer. Keep language about projects and work-state, not people.
5. Explain the LIMITATIONS of the available evidence honestly: which metrics are current snapshots without historical baselines (project progress %, blocked tasks, overdue tasks), small sample sizes, possible incomplete data, and the absence of a long-term baseline.

COMPARISON METRICS (${comparisonType}):
${metricDigest}

Return JSON only:
{
  "summary": "2-3 sentence objective comparison of current vs previous period, grounded in the metrics",
  "interpretation": "1-3 sentence neutral interpretation of what the metrics do and do not show",
  "limitations": ["limitation 1", "limitation 2", ...],
  "confidence": 0-1
}`;

    let narration = null;
    if (totalCurrent > 0 || metrics.some((m) => m.snapshot && m.current > 0)) {
      try {
        narration = await gateway.analyze(base44, {
          prompt,
          response_json_schema: {
            type: 'object',
            properties: {
              summary: { type: 'string' },
              interpretation: { type: 'string' },
              limitations: { type: 'array', items: { type: 'string' } },
              confidence: { type: 'number' },
            },
          },
        });
      } catch { narration = null; }
    }

    const limitations = (narration?.limitations && narration.limitations.length)
      ? narration.limitations
      : ['Project progress %, blocked tasks, and overdue tasks are current snapshots — no historical baseline is stored, so period-over-period change for these cannot be computed.',
         'Counts reflect records logged in the system and may be incomplete if activities or files were not recorded.'];

    const insufficient = totalCurrent === 0 && !metrics.some((m) => m.snapshot && m.current > 0);

    return Response.json({
      ok: true,
      comparisonType,
      scopeLabel,
      period: { windowDays: W, current: { start: new Date(curStart).toISOString().slice(0, 10), end: new Date(curEnd).toISOString().slice(0, 10) }, previous: { start: new Date(prevStart).toISOString().slice(0, 10), end: new Date(prevEnd).toISOString().slice(0, 10) } },
      metrics,
      summary: narration?.summary || (insufficient ? 'Insufficient evidence: no records were found in either period for the selected scope.' : 'Comparison computed.'),
      interpretation: narration?.interpretation || '',
      limitations,
      confidence: typeof narration?.confidence === 'number' ? narration.confidence : (insufficient ? 0 : 0.7),
      insufficient,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}