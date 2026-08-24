import { createClientFromRequest } from 'npm:@base44/sdk@0.8.43';

// AI document processing workflow.
// Triggered after a FileAsset is created. Reads the physical file (source of
// truth) via the LLM, extracts factual content only, and updates the FileAsset
// metadata. Never invents results/facts; uncertain fields are flagged and every
// AI field carries a confidence score.

const ACTIVITY_TYPES = ["EXPERIMENT", "MEETING", "CODE_COMMIT", "DATA_GENERATED", "REPORT_CREATED", "OTHER"];
const EVIDENCE_TYPES = ["ExperimentData", "SimulationResults", "Paper", "Code", "Report", "Image", "RawData", "Other"];

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { fileAssetId } = body;
    if (!fileAssetId) return Response.json({ error: 'fileAssetId is required' }, { status: 400 });

    const asset = await base44.entities.FileAsset.get(fileAssetId);
    if (!asset) return Response.json({ error: 'FileAsset not found' }, { status: 404 });

    // Candidate projects/tasks for relationship matching (org-wide, so a
    // researcher's upload can still be matched to projects they don't own).
    const authed = await base44.auth.isAuthenticated();
    const projects = authed ? await base44.asServiceRole.entities.Project.filter({ organizationId: asset.organizationId }, 'name', 200) : [];
    const tasks = authed ? await base44.asServiceRole.entities.Task.filter({ organizationId: asset.organizationId }, 'title', 200) : [];

    const projectList = projects.map((p) => `${p.id} | ${p.name}`).join('\n') || '(none)';
    const taskList = tasks.map((t) => `${t.id} | ${t.title}`).join('\n') || '(none)';

    const prompt = `You are a research lab assistant analyzing a file from a university research team.
Extract ONLY what is actually present in the file. NEVER invent experimental results, measurements, conclusions, or scientific facts. If information is not in the file, leave it empty or mark it uncertain.

Return JSON with:
- fileType: the kind of document (e.g. "PDF report", "dataset CSV", "figure image").
- summary: 1-3 sentence factual summary of the file's actual content. No fabricated results.
- summaryConfidence: 0-1 confidence in the summary.
- keywords: 3-8 relevant research keywords found in the file.
- suggestedProjectId: the id of the most likely project from the list, or "" if none or uncertain.
- suggestedTaskId: the id of the most likely task, or "" if none or uncertain.
- relationshipConfidence: 0-1 confidence in the project/task match.
- potentialActivities: activities the file actually documents, each {type (one of: ${ACTIVITY_TYPES.join(", ")}), title, description, confidence}.
- evidence: {create: true only if the file is genuine research evidence, type (one of: ${EVIDENCE_TYPES.join(", ")}), title, description, confidence, rationale}.
- uncertainFields: list of field names where you are not confident.
- extractedText: up to 1500 chars of extracted text (empty for images/binary).
- datasets: chartable numeric series extracted from the file (tables, CSV/Excel content, figures with numbers). Each item: { name (short series label, e.g. "Monthly Revenue", "Efficiency"), chartType ("line"|"bar"|"pie"), unit (e.g. "%", "USD", blank if none), labels (array of category/index strings, one per value), values (array of numbers, same length as labels), xLabel, yLabel }. Extract 1-6 datasets ONLY from data actually present — never fabricate numbers. For spreadsheets/CSV, prefer real columns. Leave empty [] if the file has no tabular/numeric data.
- notes: any caveats.

Projects (id | name):
${projectList}

Tasks (id | title):
${taskList}

Analyze the file and return JSON only.`;

    let analysis;
    try {
      const res = await base44.integrations.Core.InvokeLLM({
        prompt,
        file_urls: [asset.fileUrl],
        response_json_schema: {
          type: 'object',
          properties: {
            fileType: { type: 'string' },
            summary: { type: 'string' },
            summaryConfidence: { type: 'number' },
            keywords: { type: 'array', items: { type: 'string' } },
            suggestedProjectId: { type: 'string' },
            suggestedTaskId: { type: 'string' },
            relationshipConfidence: { type: 'number' },
            potentialActivities: { type: 'array', items: { type: 'object', properties: { type: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, confidence: { type: 'number' } } } },
            evidence: { type: 'object', properties: { create: { type: 'boolean' }, type: { type: 'string' }, title: { type: 'string' }, description: { type: 'string' }, confidence: { type: 'number' }, rationale: { type: 'string' } } },
            uncertainFields: { type: 'array', items: { type: 'string' } },
            extractedText: { type: 'string' },
            datasets: { type: 'array', items: { type: 'object', properties: { name: { type: 'string' }, chartType: { type: 'string' }, unit: { type: 'string' }, labels: { type: 'array', items: { type: 'string' } }, values: { type: 'array', items: { type: 'number' } }, xLabel: { type: 'string' }, yLabel: { type: 'string' } } } },
            notes: { type: 'string' }
          }
        }
      });
      analysis = res;
    } catch {
      // Binary/archive/unreadable file — record minimal metadata, no AI claims.
      await base44.entities.FileAsset.update(asset.id, {
        aiSummary: 'Unable to extract content automatically (binary or unreadable file).',
        aiConfidence: 0,
        aiData: { fileType: asset.documentType || asset.type, notes: 'Unreadable file type; no content extracted.', processedAt: new Date().toISOString() }
      });
      return Response.json({ ok: true, note: 'File unreadable; metadata updated with no AI extraction.' });
    }

    const summary = analysis.summary || '';
    const summaryConfidence = typeof analysis.summaryConfidence === 'number' ? analysis.summaryConfidence : 0;
    const keywords = Array.isArray(analysis.keywords) ? analysis.keywords.slice(0, 8) : [];
    const uncertainFields = Array.isArray(analysis.uncertainFields) ? analysis.uncertainFields : [];
    const potentialActivities = Array.isArray(analysis.potentialActivities) ? analysis.potentialActivities : [];
    const evidence = analysis.evidence || {};
    const extractedText = (analysis.extractedText || '').slice(0, 500);
    const datasets = Array.isArray(analysis.datasets)
      ? analysis.datasets
          .filter((d) => d && Array.isArray(d.values) && d.values.length > 0)
          .map((d) => ({
            name: (d.name || 'Series').toString().slice(0, 80),
            chartType: ['line', 'bar', 'pie'].includes(d.chartType) ? d.chartType : 'bar',
            unit: (d.unit || '').toString().slice(0, 20),
            labels: Array.isArray(d.labels) ? d.labels.map((l) => String(l ?? '')).slice(0, 200) : d.values.map((_, i) => String(i + 1)),
            values: d.values.map((v) => Number(v)).filter((n) => !Number.isNaN(n)),
            xLabel: (d.xLabel || '').toString().slice(0, 60),
            yLabel: (d.yLabel || '').toString().slice(0, 60),
          }))
          .filter((d) => d.values.length > 0)
          .slice(0, 6)
      : [];

    // Auto-link project/task only if the uploader left them blank (never override user intent).
    const update = {
      aiSummary: summary,
      aiConfidence: summaryConfidence,
      keywords,
      aiData: {
        fileType: analysis.fileType || asset.documentType,
        summaryConfidence,
        suggestedProjectId: analysis.suggestedProjectId || '',
        suggestedTaskId: analysis.suggestedTaskId || '',
        relationshipConfidence: typeof analysis.relationshipConfidence === 'number' ? analysis.relationshipConfidence : 0,
        potentialActivities,
        evidence: { create: !!evidence.create, type: evidence.type || '', title: evidence.title || '', description: evidence.description || '', confidence: evidence.confidence || 0, rationale: evidence.rationale || '' },
        uncertainFields,
        extractedText,
        datasets,
        notes: analysis.notes || '',
        processedAt: new Date().toISOString()
      }
    };
    if (!asset.projectId && analysis.suggestedProjectId) update.projectId = analysis.suggestedProjectId;
    if (!asset.taskId && analysis.suggestedTaskId) update.taskId = analysis.suggestedTaskId;
    if (evidence.create) update.isEvidence = true;

    await base44.entities.FileAsset.update(asset.id, update);

    // Generate a ResearchEvidence record when the AI judges the file as genuine evidence.
    let evidenceRecord = null;
    if (evidence.create) {
      const evType = EVIDENCE_TYPES.includes(evidence.type) ? evidence.type : 'Other';
      evidenceRecord = await base44.entities.ResearchEvidence.create({
        organizationId: asset.organizationId,
        title: evidence.title || asset.name,
        description: evidence.description || summary,
        type: evType,
        projectId: asset.projectId || analysis.suggestedProjectId || undefined,
        taskId: asset.taskId || analysis.suggestedTaskId || undefined,
        fileAssetId: asset.id,
        uploadedBy: asset.uploadedBy,
        collectedAt: new Date().toISOString(),
        metadata: { confidence: evidence.confidence || 0, uncertainFields, rationale: evidence.rationale || '', aiGenerated: true },
        verified: false
      });
    }

    return Response.json({ ok: true, fileId: asset.id, evidence: evidenceRecord, analysis });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}