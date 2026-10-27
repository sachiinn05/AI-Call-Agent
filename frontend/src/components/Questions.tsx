import { useEffect, useState } from "react";
import type { QuestionRow } from "../lib/types";
import { Badge, Card, EmptyState, Icon } from "./ui";

export default function Questions() {
  const [rows, setRows] = useState<QuestionRow[]>([]);

  useEffect(() => {
    fetch("/api/questions")
      .then((r) => r.json())
      .then(setRows);
  }, []);

  const unanswered = rows.filter((r) => !r.faqId).length;

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Badge tone="good">{rows.length - unanswered} answered from the PDF</Badge>
        <Badge tone={unanswered ? "danger" : "neutral"}>{unanswered} not covered</Badge>
        <span>Add the uncovered ones to the knowledge base, then re-ingest.</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState icon="help" title="No questions asked yet" hint="Questions callers ask mid-call are logged here." />
      ) : (
        <div className="flex flex-col divide-y divide-white/[0.06]">
          {rows.map((q, i) => (
            <div key={i} className="flex items-start gap-3 py-3">
              <span className={`mt-0.5 flex h-7 w-7 flex-none items-center justify-center rounded-full ${q.faqId ? "bg-good/15 text-good" : "bg-danger/15 text-danger"}`}>
                <Icon name={q.faqId ? "check" : "help"} size={14} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{q.question}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {q.contactName || "Unknown caller"} · {q.faqId ? `answered from ${q.faqId}` : "no match in the knowledge base"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
