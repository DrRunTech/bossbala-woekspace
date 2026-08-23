import React, { useEffect, useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { PageHeader } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sparkles, Send, User, Link2, TrendingUp, AlertTriangle } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import AiGatewayStatus from "@/components/AiGatewayStatus";

const SUGGESTED = [
  "What did Zhang San do this week?",
  "Why is the TMR project delayed?",
  "Which project progressed fastest this month?",
  "What research activities decreased compared with last week?",
  "Show all projects currently at risk.",
  "Compare this week's activity with last week.",
];

const SEVERITY_COLORS = {
  Low: "bg-slate-100 text-slate-600",
  Medium: "bg-amber-100 text-amber-700",
  High: "bg-orange-100 text-orange-700",
  Critical: "bg-rose-100 text-rose-700",
};

export default function AskBossAI() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading]);

  const ask = async (question) => {
    const q = (question || input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((m) => [...m, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await base44.functions.invoke("askBossAI", { question: q });
      const answer = res?.answer;
      if (!answer) throw new Error("no answer");
      setMessages((m) => [...m, { role: "assistant", answer }]);
    } catch {
      setMessages((m) => [...m, { role: "assistant", answer: { conclusion: "I couldn't analyze that right now. Please try again.", evidence: [], comparison: "", risks: [], recommendations: [], confidence: 0, insufficient: false } }]);
    } finally {
      setLoading(false);
    }
  };

  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const q = searchParams.get("q");
    if (q) { ask(q); setSearchParams({}, { replace: true }); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)]">
      <PageHeader title="Ask BossAI" subtitle="Evidence-first answers about your research group — every conclusion cites real activities, tasks, files, or evidence." />
      <AiGatewayStatus variant="banner" />

      <div className="flex-1 rounded-xl border border-slate-200 bg-white flex flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-10">
              <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-700 mb-4"><Sparkles className="h-6 w-6" /></div>
              <h3 className="text-base font-semibold text-slate-800">Ask anything about your research</h3>
              <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">I retrieve the relevant evidence, analyze it, and answer with citations — never fabricating progress.</p>
              <div className="flex flex-wrap gap-2 justify-center mt-6 max-w-2xl mx-auto">
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
              <div className={`max-w-[82%] ${m.role === "user" ? "bg-blue-700 text-white rounded-2xl px-4 py-2.5" : "w-full"}`}>
                {m.role === "user" ? <p className="text-sm">{m.content}</p> : <AnswerCard answer={m.answer} />}
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

function AnswerCard({ answer }) {
  const insufficient = answer.insufficient || answer.conclusion === "Insufficient evidence.";
  return (
    <div className="rounded-2xl bg-slate-50 text-slate-800 px-4 py-3 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-slate-200/70">
        <span className="flex items-center gap-1 text-xs text-slate-500"><TrendingUp className="h-3.5 w-3.5" /> Confidence {Math.round((answer.confidence || 0) * 100)}%</span>
        <div className="ml-auto h-1.5 w-24 rounded-full bg-slate-200 overflow-hidden">
          <div className="h-full bg-blue-600 rounded-full" style={{ width: `${Math.round((answer.confidence || 0) * 100)}%` }} />
        </div>
      </div>

      <Section label="Conclusion">
        <p className={`text-sm ${insufficient ? "text-amber-600 italic" : "text-slate-800"}`}>{answer.conclusion}</p>
      </Section>

      {!insufficient && (
        <>
          <Section label="Evidence">
            {answer.evidence?.length ? (
              <ul className="space-y-1.5">
                {answer.evidence.map((e, idx) => (
                  <li key={idx} className="text-sm text-slate-700">
                    <span className="text-[11px] font-mono bg-white border border-slate-200 text-blue-700 px-1 py-0.5 rounded mr-1.5 align-middle">{e.refId}</span>
                    {e.relevance}
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-400">No evidence cited.</p>}
          </Section>

          {answer.comparison && (
            <Section label="Comparison">
              <p className="text-sm text-slate-700 whitespace-pre-wrap">{answer.comparison}</p>
            </Section>
          )}

          <Section label="Risk">
            {answer.risks?.length ? (
              <ul className="space-y-2">
                {answer.risks.map((r, i) => (
                  <li key={i} className="text-sm text-slate-700 border border-slate-200 bg-white rounded-lg p-2.5">
                    <div className="flex items-center gap-2">
                      {r.severity && <span className={`text-[11px] px-1.5 py-0.5 rounded-full ${SEVERITY_COLORS[r.severity] || ""}`}>{r.severity}</span>}
                      <span>{r.description}</span>
                    </div>
                    {r.refIds?.length > 0 && <RefChips ids={r.refIds} />}
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-400">None identified.</p>}
          </Section>

          <Section label="Recommendation">
            {answer.recommendations?.length ? (
              <ul className="space-y-2">
                {answer.recommendations.map((r, i) => (
                  <li key={i} className="text-sm text-slate-700 border border-slate-200 bg-white rounded-lg p-2.5">
                    <span>{i + 1}. {r.action}</span>
                    {r.refIds?.length > 0 && <RefChips ids={r.refIds} />}
                  </li>
                ))}
              </ul>
            ) : <p className="text-xs text-slate-400">None.</p>}
          </Section>

          {answer.evidence?.length > 0 && (
            <div className="flex items-center gap-1 text-[11px] text-slate-400 pt-1">
              <Link2 className="h-3 w-3" /> {answer.evidence.length} evidence reference{answer.evidence.length === 1 ? "" : "s"} cited
              {answer.meta?.recordsConsidered != null && <span className="ml-auto">considered {answer.meta.recordsConsidered} records</span>}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Section({ label, children }) {
  return (
    <section>
      <h4 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mb-1 flex items-center gap-1">
        {label === "Risk" && <AlertTriangle className="h-3 w-3" />}{label}
      </h4>
      {children}
    </section>
  );
}

function RefChips({ ids }) {
  return <div className="flex flex-wrap gap-1 mt-1.5">{ids.map((id) => <span key={id} className="text-[10px] font-mono bg-slate-100 text-slate-500 px-1 rounded">{id}</span>)}</div>;
}