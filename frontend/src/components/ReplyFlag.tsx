import { useState } from "react";
import { FEEDBACK_ISSUES, type FeedbackIssue } from "../lib/types";
import { Icon } from "./ui";

export type ReportProps = {
  /** Transcript line numbers already reported on this call. */
  flagged: Set<number>;
  /** Resolves true when the report was saved. */
  onSubmit: (index: number, issue: FeedbackIssue, expected: string) => Promise<boolean>;
};

/** "This reply was bad" — a small button under an agent line that opens a one-step report form. */
export default function ReplyFlag({ index, report }: { index: number; report: ReportProps }) {
  const [open, setOpen] = useState(false);
  const [issue, setIssue] = useState<FeedbackIssue>("wrong_answer");
  const [expected, setExpected] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reported = report.flagged.has(index);

  async function send() {
    setSaving(true);
    setError("");
    const ok = await report.onSubmit(index, issue, expected.trim());
    setSaving(false);
    if (ok) {
      setOpen(false);
      setExpected("");
    } else {
      setError("Couldn't save that. Try again.");
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`mt-1 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] transition ${
          reported ? "bg-warn/15 text-warn" : "text-muted/70 hover:bg-white/[0.06] hover:text-ink"
        }`}
      >
        <Icon name="flag" size={11} />
        {reported ? "Reported — edit" : "Bad reply?"}
      </button>
    );
  }

  return (
    <div className="mt-2 w-full max-w-[88%] rounded-xl bg-white/[0.04] p-3 ring-1 ring-white/10">
      <p className="text-xs font-semibold text-ink">What was wrong with this reply?</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {FEEDBACK_ISSUES.map((i) => (
          <button
            key={i.id}
            type="button"
            onClick={() => setIssue(i.id)}
            className={`rounded-full px-2.5 py-1 text-[11px] ring-1 ring-inset transition ${
              issue === i.id ? "bg-brand/20 text-brand ring-brand/40" : "text-muted ring-white/10 hover:text-ink"
            }`}
          >
            {i.label}
          </button>
        ))}
      </div>
      <label className="mt-3 block text-[11px] text-muted" htmlFor={`expected-${index}`}>
        What should it have said? <span className="text-muted/60">(optional, but this is what makes the fix easy)</span>
      </label>
      <textarea
        id={`expected-${index}`}
        value={expected}
        maxLength={1000}
        rows={2}
        onChange={(e) => setExpected(e.target.value)}
        className="input mt-1 resize-none text-[13px]"
        placeholder="e.g. Achha, samajh gaya — hamara AI aise calls turant utha leta hai."
      />
      {error && <p className="mt-1.5 text-[11px] text-danger">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" disabled={saving} onClick={() => void send()} className="btn-primary px-3 py-1.5 text-xs">
          {saving ? "Saving…" : "Send report"}
        </button>
        <button type="button" disabled={saving} onClick={() => setOpen(false)} className="btn-ghost px-3 py-1.5 text-xs">
          Cancel
        </button>
      </div>
    </div>
  );
}
