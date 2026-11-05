import { Router } from "express";
import { z } from "zod";
import { callLines, feedbackKnowledge, feedbackTests } from "../analytics/feedbackExport.js";
import { loadCalls } from "../storage/calls.js";
import { addFeedback, deleteFeedback, loadFeedback, setFeedbackStatus } from "../storage/feedback.js";
import { FEEDBACK_ISSUES, type Feedback } from "../types.js";

/**
 * "This reply was bad" — the weekly improvement loop. A reviewer flags an agent line in a saved
 * call; the reports can then be exported as regression tests and as knowledge-base Q&A lines.
 */
export const feedbackRouter = Router();

const CreateSchema = z.object({
  call_id: z.string().min(1).max(100),
  turn_index: z.number().int().min(0).max(500),
  issue: z.enum(FEEDBACK_ISSUES),
  expected: z.string().trim().max(1000).optional().default(""),
});

feedbackRouter.get("/api/feedback", async (_req, res) => {
  res.json(await loadFeedback());
});

feedbackRouter.post("/api/feedback", async (req, res) => {
  const parsed = CreateSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Send call_id, turn_index and a valid issue." });
    return;
  }
  const { call_id, turn_index, issue, expected } = parsed.data;

  // Read the flagged line from the saved call, never from the request, so a report can't
  // claim the agent said something it didn't.
  const call = (await loadCalls()).find((c) => c.call_id === call_id);
  if (!call) {
    res.status(404).json({ error: "Unknown call." });
    return;
  }
  const lines = callLines(call);
  const line = lines[turn_index];
  if (!line || line.role !== "agent") {
    res.status(400).json({ error: "That line is not an agent reply." });
    return;
  }
  // What the caller said just before it, and the beat that was running when they said it.
  const before = lines.slice(0, turn_index).reverse().find((l) => l.role === "prospect");

  const item: Feedback = {
    id: `${call_id}:${turn_index}`,
    call_id,
    turn_index,
    agent_text: line.text.slice(0, 1000),
    caller_text: (before?.text ?? "").slice(0, 1000),
    state: before?.state ?? "unknown",
    issue,
    expected,
    status: "new",
    created_at: new Date().toISOString(),
    contact_name: (call.lead?.contact_name ?? "").slice(0, 100),
  };

  // Flagging the same line again replaces the earlier report instead of piling up copies.
  await deleteFeedback(item.id);
  if (!(await addFeedback(item))) {
    res.status(507).json({ error: "Feedback store is full. Resolve or delete some reports first." });
    return;
  }
  res.status(201).json(item);
});

feedbackRouter.patch("/api/feedback/:id", async (req, res) => {
  const status = z.enum(["new", "resolved"]).safeParse(req.body?.status);
  if (!status.success) {
    res.status(400).json({ error: 'status must be "new" or "resolved".' });
    return;
  }
  const ok = await setFeedbackStatus(String(req.params.id), status.data);
  res.status(ok ? 200 : 404).json({ ok });
});

feedbackRouter.delete("/api/feedback/:id", async (req, res) => {
  const ok = await deleteFeedback(String(req.params.id));
  res.status(ok ? 200 : 404).json({ ok });
});

/** ?kind=tests → a Vitest file; ?kind=kb → Q&A lines for the knowledge-base builder. Open reports only. */
feedbackRouter.get("/api/feedback/export", async (req, res) => {
  const open = (await loadFeedback()).filter((f) => f.status === "new");
  const kind = req.query.kind === "kb" ? "kb" : "tests";
  res.type("text/plain").send(kind === "kb" ? feedbackKnowledge(open) : feedbackTests(open.filter((f) => f.caller_text.trim())));
});
