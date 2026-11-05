import { useCallback, useEffect, useState } from "react";
import { FEEDBACK_ISSUES, type FeedbackItem } from "../lib/types";
import { Badge, Card, EmptyState, Icon, Skeleton } from "./ui";

const ISSUE_LABEL = Object.fromEntries(FEEDBACK_ISSUES.map((i) => [i.id, i.label]));

/** Copy text; falls back to a hidden textarea where the clipboard API isn't allowed (plain http). */
async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const box = document.createElement("textarea");
    box.value = text;
    document.body.appendChild(box);
    box.select();
    const ok = document.execCommand("copy");
    box.remove();
    return ok;
  }
}

export default function Feedback() {
  const [rows, setRows] = useState<FeedbackItem[] | null>(null);
  const [show, setShow] = useState<"new" | "resolved">("new");
  const [note, setNote] = useState("");

  const load = useCallback(() => {
    fetch("/api/feedback")
      .then((r) => r.json())
      .then(setRows)
      .catch(() => setRows([]));
  }, []);
  useEffect(load, [load]);

  async function setStatus(id: string, status: "new" | "resolved") {
    await fetch(`/api/feedback/${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    load();
  }

  async function remove(id: string) {
    if (!window.confirm("Delete this report?")) return;
    await fetch(`/api/feedback/${encodeURIComponent(id)}`, { method: "DELETE" });
    load();
  }

  async function exportAs(kind: "tests" | "kb") {
    const text = await (await fetch(`/api/feedback/export?kind=${kind}`)).text();
    const ok = await copy(text);
    setNote(
      ok
        ? kind === "tests"
          ? "Copied. Save it as tests/conversation/feedbackRegressions.test.ts (or run npm run feedback:export to write it for you)."
          : "Copied. Paste into a qa list in scripts/build-knowledge-pdf.ts, then npm run kb:build && npm run ingest."
        : "Couldn't copy — run npm run feedback:export instead.",
    );
  }

  if (!rows) return <Skeleton className="h-64" />;

  const open = rows.filter((r) => r.status === "new");
  const shown = rows.filter((r) => r.status === show);

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <h2 className="text-[15px] font-semibold">Turn reports into fixes</h2>
        <p className="mt-1 max-w-2xl text-[13px] leading-relaxed text-muted">
          {open.length} open report{open.length === 1 ? "" : "s"}. Once a week: export them, add the knowledge answers, fix the behaviour, and mark the reports resolved.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={!open.length} onClick={() => void exportAs("tests")} className="btn-primary px-3.5 py-2 text-xs">
            <Icon name="file" size={14} /> Copy as test cases
          </button>
          <button type="button" disabled={!open.length} onClick={() => void exportAs("kb")} className="btn-ghost px-3.5 py-2 text-xs">
            <Icon name="book" size={14} /> Copy as knowledge Q&amp;A
          </button>
        </div>
        {note && <p className="mt-3 text-xs text-speak">{note}</p>}
      </Card>

      <div className="flex gap-1.5">
        {(["new", "resolved"] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setShow(s)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition ${show === s ? "bg-white/10 text-ink" : "text-muted hover:text-ink"}`}
          >
            {s === "new" ? `Open · ${open.length}` : `Resolved · ${rows.length - open.length}`}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <EmptyState
          icon="flag"
          title={show === "new" ? "No open reports" : "Nothing resolved yet"}
          hint={show === "new" ? "Open a call in the Conversations tab and press “Bad reply?” under a line the agent got wrong." : undefined}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {shown.map((f) => (
            <Card key={f.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="warn">{ISSUE_LABEL[f.issue] ?? f.issue}</Badge>
                <span className="text-xs text-muted">
                  {f.contact_name || "Unknown caller"} · {f.created_at.slice(0, 10)}
                </span>
                <span className="ml-auto flex gap-1.5">
                  <button type="button" className="btn-ghost px-2.5 py-1 text-[11px]" onClick={() => void setStatus(f.id, f.status === "new" ? "resolved" : "new")}>
                    {f.status === "new" ? "Mark resolved" : "Reopen"}
                  </button>
                  <button type="button" className="btn-ghost px-2.5 py-1 text-[11px] text-danger" onClick={() => void remove(f.id)}>
                    Delete
                  </button>
                </span>
              </div>
              {f.caller_text && (
                <p className="mt-3 text-[13px]">
                  <span className="text-muted">Caller: </span>
                  {f.caller_text}
                </p>
              )}
              <p className="mt-1.5 text-[13px]">
                <span className="text-muted">Agent said: </span>
                {f.agent_text}
              </p>
              {f.expected && (
                <p className="mt-1.5 rounded-lg bg-good/10 px-3 py-2 text-[13px] ring-1 ring-good/20">
                  <span className="text-good">Should have said: </span>
                  {f.expected}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
