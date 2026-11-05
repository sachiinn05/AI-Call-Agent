import { useCallback, useEffect, useMemo, useState } from "react";
import type { CallResult, FeedbackIssue, FeedbackItem } from "../lib/types";
import { TranscriptView } from "./LiveCall";
import { Avatar, Card, DispositionBadge, EmptyState } from "./ui";

export default function Conversations() {
  const [calls, setCalls] = useState<CallResult[]>([]);
  const [active, setActive] = useState<CallResult | null>(null);
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);

  useEffect(() => {
    fetch("/api/calls")
      .then((r) => r.json())
      .then((rows: CallResult[]) => {
        setCalls(rows);
        setActive(rows[0] ?? null);
      });
    fetch("/api/feedback")
      .then((r) => r.json())
      .then(setFeedback)
      .catch(() => undefined);
  }, []);

  const submit = useCallback(
    async (index: number, issue: FeedbackIssue, expected: string) => {
      if (!active) return false;
      try {
        const res = await fetch("/api/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ call_id: active.call_id, turn_index: index, issue, expected }),
        });
        if (!res.ok) return false;
        const saved: FeedbackItem = await res.json();
        setFeedback((rows) => [saved, ...rows.filter((r) => r.id !== saved.id)]);
        return true;
      } catch {
        return false;
      }
    },
    [active],
  );

  // Lines of the open call that already have a report, so the button can say "Reported".
  const flagged = useMemo(
    () => new Set(feedback.filter((f) => f.call_id === active?.call_id).map((f) => f.turn_index)),
    [feedback, active],
  );
  const reportsPerCall = useMemo(() => {
    const counts = new Map<string, number>();
    for (const f of feedback) if (f.status === "new") counts.set(f.call_id, (counts.get(f.call_id) ?? 0) + 1);
    return counts;
  }, [feedback]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="p-3">
        <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">All calls · {calls.length}</p>
        {calls.length === 0 && <EmptyState icon="chat" title="No conversations yet" hint="Finished calls appear here with transcripts." />}
        <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
          {calls.map((c, i) => {
            const selected = active?.call_id === c.call_id;
            const reports = reportsPerCall.get(c.call_id) ?? 0;
            return (
              <button
                key={c.call_id ?? i}
                type="button"
                onClick={() => setActive(c)}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                  selected ? "bg-white/[0.08] ring-1 ring-brand/40" : "hover:bg-white/[0.04]"
                }`}
              >
                <Avatar name={c.lead?.contact_name || "?"} size={36} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.lead?.contact_name || "Unknown"}</span>
                  <span className="block truncate text-xs text-muted">
                    {c.lead?.company_name || ""}
                    {reports > 0 && <span className="ml-1.5 text-warn">· {reports} flagged</span>}
                  </span>
                </span>
                <DispositionBadge value={c.disposition} />
              </button>
            );
          })}
        </div>
      </Card>
      <Card className="p-5">
        <p className="mb-3 text-xs text-muted">Spot a reply that was wrong, made-up or awkward? Use “Bad reply?” under it — reports feed the Feedback tab.</p>
        <TranscriptView result={active} report={{ flagged, onSubmit: submit }} />
      </Card>
    </div>
  );
}
