import { base44 } from "@/api/base44Client";

// Records an observable research activity. Used for both manual notes and
// auto-captured events (file uploads, task changes). Never throws — activity
// logging must not block the primary user action.
export async function logActivity({ type, projectId, taskId, title, description, fileRefs, evidenceRefs, memberId, userId, source = "Auto" }) {
  try {
    const me = await base44.auth.me();
    await base44.entities.Activity.create({
      organizationId: me.organizationId,
      type,
      projectId,
      taskId,
      userId: userId || me.id,
      memberId: memberId || null,
      title: title || type,
      description: description || "",
      date: new Date().toISOString(),
      fileRefs: fileRefs || [],
      evidenceRefs: evidenceRefs || [],
      tags: [],
      source,
    });
  } catch (e) {
    console.warn("logActivity failed", e);
  }
}