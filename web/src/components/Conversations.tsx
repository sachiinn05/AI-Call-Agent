import { useEffect, useState } from "react";
import type { CallResult } from "../lib/types";
import { TranscriptView } from "./LiveCall";
import { Avatar, Card, DispositionBadge, EmptyState } from "./ui";

export default function Conversations() {
  const [calls, setCalls] = useState<CallResult[]>([]);
  const [active, setActive] = useState<CallResult | null>(null);

  useEffect(() => {
    fetch("/api/calls")
      .then((r) => r.json())
      .then((rows: CallResult[]) => {
        setCalls(rows);
        setActive(rows[0] ?? null);
      });
  }, []);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
      <Card className="p-3">
        <p className="px-2 pb-2 pt-1 text-xs font-semibold uppercase tracking-wider text-muted">All calls · {calls.length}</p>
        {calls.length === 0 && <EmptyState icon="chat" title="No conversations yet" hint="Finished calls appear here with transcripts." />}
        <div className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
          {calls.map((c, i) => {
            const selected = active?.call_id === c.call_id;
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
                  <span className="block truncate text-xs text-muted">{c.lead?.company_name || ""}</span>
                </span>
                <DispositionBadge value={c.disposition} />
              </button>
            );
          })}
        </div>
      </Card>
      <Card className="p-5">
        <TranscriptView result={active} />
      </Card>
    </div>
  );
}
