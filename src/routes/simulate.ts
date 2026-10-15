/**
 * The browser call: the dashboard's "Start call" button talks to these four endpoints.
 *   start  -> create a session and get the opening line
 *   reply  -> the caller said something; get the agent's answer
 *   nudge  -> the caller went quiet; get a gentle "are you there?"
 *   hangup -> end the call
 * When a call ends it is scored, booked, followed up and saved exactly once (finalizeCall).
 */
import { Router } from "express";
import { bookSlot } from "../booking/calendar.js";
import { pickOfferSlots } from "../booking/offer.js";
import { addToDnc } from "../compliance/dnc.js";
import { handleTurn } from "../conversation/turn.js";
import { createSession, endCallManually, nudge, startCall } from "../conversation/stateMachine.js";
import { calendarLinkEmail, sendMail } from "../mail/mailer.js";
import { scoreCall } from "../scoring/scorer.js";
import { saveCall } from "../storage/calls.js";
import { LeadSchema, type CallResult, type Session } from "../types.js";
import { routeVoice } from "../voice/routing.js";

export const simulateRouter = Router();

/** Calls in progress, by id. */
const sessions = new Map<string, Session>();

/** The caller asked for the calendar link on the call: email it, and record whether that worked. */
async function sendFollowUps(session: Session, result: CallResult) {
  if (!session.complianceFlags.includes("calendar_link_requested") || session.meetingSlot) return;
  const { subject, text } = calendarLinkEmail(session.lead.contact_name.split(" ")[0] ?? "there");
  result.follow_up_email = await sendMail(session.lead.email ?? "", subject, text);
}

/** Turn the slot agreed on the call into a real calendar booking and record the outcome on the call. */
async function confirmBooking(session: Session, result: CallResult) {
  if (!session.meetingSlot || !result.meeting_details) return;
  result.meeting_details.booking = await bookSlot(session.meetingSlot, {
    name: session.lead.contact_name,
    email: session.lead.email,
  });
}

/** Everything that happens once, when a call is over: score, honour opt-outs, book, follow up, save. */
async function finalizeCall(session: Session): Promise<CallResult> {
  const result = await scoreCall(session);
  if (result.compliance_flags.includes("do_not_call_requested")) {
    await addToDnc(session.lead.contact_number, "requested");
  }
  await confirmBooking(session, result);
  await sendFollowUps(session, result);
  await saveCall(result);
  return result;
}

simulateRouter.post("/api/simulate/start", async (req, res) => {
  const parsed = LeadSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.flatten() });
    return;
  }
  const session = createSession(parsed.data);
  // Offer only times that are actually open on the calendar right now.
  session.offerSlots = (await pickOfferSlots(parsed.data.preferred_language === "hi-IN-hinglish" ? "hi" : "en")) ?? undefined;
  const opening = startCall(session);
  sessions.set(session.callId, session);
  res.json({
    callId: session.callId,
    state: session.state,
    agent: opening,
    ended: session.ended,
    language: session.lead.preferred_language,
    voice: routeVoice(session.lead.preferred_language),
    via: "script",
  });
});

simulateRouter.post("/api/simulate/reply", async (req, res) => {
  const callId = String(req.body?.callId ?? "");
  const text = String(req.body?.text ?? "");
  const session = sessions.get(callId);
  if (!session) {
    res.status(404).json({ error: "Unknown callId. Start a simulation first." });
    return;
  }
  const turn = await handleTurn(session, text);
  let result: CallResult | null = null;
  // Map.delete() returns true only if the key was still present — the first of a racing
  // reply/nudge/hangup request to reach here "claims" the session and is the only one that
  // scores + saves it. Without this, a hangup that lands while a reply is still in flight
  // (both observing the same now-ended session) could score and save the same call twice.
  if (session.ended && sessions.delete(callId)) result = await finalizeCall(session);
  res.json({
    callId,
    state: session.state,
    agent: turn.agent,
    ended: session.ended,
    objectionsRaised: session.objectionsRaised,
    result,
    via: turn.via,
    intent: turn.intent,
    route: turn.route,
    faqId: turn.faqId,
  });
});

simulateRouter.post("/api/simulate/nudge", async (req, res) => {
  const callId = String(req.body?.callId ?? "");
  const session = sessions.get(callId);
  if (!session) {
    res.status(404).json({ error: "Unknown callId." });
    return;
  }
  const agent = nudge(session);
  let result: CallResult | null = null;
  if (session.ended && sessions.delete(callId)) result = await finalizeCall(session);
  res.json({
    callId,
    state: session.state,
    agent,
    ended: session.ended,
    result,
    via: "script",
  });
});

simulateRouter.post("/api/simulate/hangup", async (req, res) => {
  const callId = String(req.body?.callId ?? "");
  const session = sessions.get(callId);
  // Claim the session synchronously before any await — see the matching comment in
  // /api/simulate/reply. Guards a double-click, and a hangup racing an in-flight
  // reply/nudge that already finished the call.
  if (!session || !sessions.delete(callId)) {
    res.status(404).json({ error: "Unknown callId." });
    return;
  }
  const agent = endCallManually(session);
  const result = await finalizeCall(session);
  res.json({ callId, agent, ended: true, result });
});
