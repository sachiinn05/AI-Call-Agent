/** Real phone calls through Vapi: dial a lead, preview the dial plan, and receive Vapi's end-of-call webhook. */
import { Router } from "express";
import { config } from "../config.js";
import { dialLead, honorDnc, planDials } from "../phone/dialer.js";
import { LeadSchema } from "../types.js";
import { routeVoice } from "../voice/routing.js";

export const phoneRouter = Router();

phoneRouter.post("/api/dial", async (req, res) => {
  if (config.demoMode) {
    res.status(403).json({ error: "Real phone calls are disabled in the public demo. Use the browser call." });
    return;
  }
  const parsed = LeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  try {
    const outcome = await dialLead(parsed.data);
    res.json({ lead: parsed.data, voice: routeVoice(parsed.data.preferred_language), ...outcome });
  } catch (error) {
    res.status(400).json({ error: error instanceof Error ? error.message : "Dial failed" });
  }
});

phoneRouter.get("/api/dial/plan", async (_req, res) => {
  res.json(await planDials());
});

phoneRouter.post("/webhooks/vapi", async (req, res) => {
  const body = req.body as {
    message?: {
      type?: string;
      call?: { id?: string; customer?: { number?: string } };
      artifact?: { transcript?: string };
      analysis?: { summary?: string };
    };
    lead?: unknown;
  };

  if (body.message?.type && body.message.type !== "end-of-call-report") {
    res.json({ ok: true });
    return;
  }

  const transcript = body.message?.artifact?.transcript ?? "";
  if (/\b(do not call|don't call|opt[- ]?out)\b/i.test(transcript)) {
    const number = body.message?.call?.customer?.number;
    if (number) await honorDnc(number);
  }

  res.json({ ok: true });
});
