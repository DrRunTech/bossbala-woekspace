import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useLookups } from "@/lib/useLookups";
import { PageHeader } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import { formatDate } from "@/lib/bossai";
import { useSearchParams } from "react-router-dom";

const SUGGESTED = [
  "What's the progress across all active projects?",
  "Who's at risk of missing deadlines this week?",
  "What are the top risks right now?",
  "Summarize this week's research activities",
  "Which team member has been most active this week?",
];

export default function AskBossAI() {
  const { members, projects, memberName, memberById, projectName } = useLookups();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const [tasks, activities, risks] = await Promise.all([
          base44.entities.Task.list("-created_date", 300),
          base44.entities.Activity.list("-date", 100),
          base44.entities.Risk.list("-created_date", 100),
        ]);
        setContext({ tasks, activities, risks });
      } catch {
        setContext({ tasks: [], activities: [], risks: [] });
      }
    })();
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  const buildContext = () => {
    if (!context) return "No data available yet.";
    const { tasks, activities, risks } = context;
    const projList = projects.map((p) => `- ${p.name} [${p.status}, priority ${p.priority}]`).join("\n");
    const memberList = members.map((m) => `- ${m.name} (${m.role}, ${m.title || "—"})`).join("\n");
    const taskList = tasks.slice(0, 80).map((t) => `- ${t.title} [${t.status}, ${t.priority}] project=${projectName(t.projectId)} assignee=${memberName(t.assigneeId)}${t.dueDate ? ` due=${formatDate(t.dueDate)}` : ""}`).join("\n");
    const actList = activities.slice(0, 40).map((a) => `- ${formatDate(a.date)} ${memberName(a.memberId)}: ${a.title} (project=${projectName(a.projectId)}, type=${a.type}${a.durationMinutes ? `, ${a.durationMinutes}min` : ""})`).join("\n");
    const riskList = risks.map((r) => `- ${r.title} [${r.level}, ${r.status}] project=${projectName(r.projectId)}`).join("\n");
    return `Projects:\n${projList}\n\nMembers:\n${memberList}\n\nTasks:\n${taskList}\n\nRecent activities:\n${actList}\n\nRisks:\n${riskList}`;
  };

  const ask = async (question) => {
    const q = question || input;
    if (!q.trim() || loading) return;
    setInput("");
    const userMsg = { role: "user", content: q };
    setMessages((m) => [...m, userMsg]);
    setLoading(true);
    try {
      const prompt = `You are BossAI, a research group analyst helping a PI/Professor understand their research lab's work. Answer the user's question objectively based ONLY on the provided data. Be concise, specific, and reference actual projects, members, tasks, and activities. If the data doesn't support an answer, say so. Use Markdown for structure.

RESEARCH GROUP DATA:
${buildContext()}

QUESTION: ${q}`;

      const res = await base44.integrations.Core.InvokeLLM({ prompt });
      setMessages((m) => [...m, { role: "assistant", content: typeof res === "string" ? res : res.content || JSON.stringify(res) }]);
    } catch (e) {
      setMessages((m) => [...m, { role: "assistant", content: "Sorry, I couldn't analyze that right now. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) {
      ask(q);
      setSearchParams({}, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <PageHeader title="Ask BossAI" subtitle="Query your research data — the AI observes, it doesn't replace judgment." />

      <div className="flex-1 rounded-xl border border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-10">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 mb-4"><Sparkles className="h-6 w-6" /></div>
              <h3 className="text-base font-semibold text-slate-800">Ask anything about your research</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">I analyze your projects, tasks, activities, and risks to give objective answers.</p>
              <div className="flex flex-wrap gap-2 justify-center mt-6 max-w-xl mx-auto">
                {SUGGESTED.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="text-sm text-slate-600 bg-slate-50 hover:bg-blue-50 hover:text-blue-700 border border-slate-200 rounded-full px-3.5 py-1.5 transition-colors">{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div className={`flex h-8 w-8 items-center justify-center rounded-full shrink-0 ${m.role === "user" ? "bg-slate-200 text-slate-600" : "bg-blue-700 text-white"}`}>
                {m.role === "user" ? <User className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${m.role === "user" ? "bg-blue-700 text-white" : "bg-slate-50 text-slate-800"}`}>
                {m.role === "user" ? <p className="text-sm">{m.content}</p> : <div className="prose prose-sm max-w-none"><ReactMarkdown>{m.content}</ReactMarkdown></div>}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-700 text-white"><Sparkles className="h-4 w-4" /></div>
              <div className="bg-slate-50 rounded-2xl px-4 py-3 flex gap-1">
                <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "0ms" }} />
                <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "150ms" }} />
                <span className="h-2 w-2 rounded-full bg-slate-300 animate-bounce" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>

        <div className="border-t border-slate-100 p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(); } }}
              placeholder="Ask about progress, risks, team activity…"
              rows={1}
              className="resize-none min-h-[44px] max-h-32"
            />
            <Button onClick={() => ask()} disabled={loading || !input.trim()} className="shrink-0"><Send className="h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </div>
  );
}