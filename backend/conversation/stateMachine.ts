import { randomUUID } from "node:crypto";
import type { CallState, Intent, Lead, Session, TranscriptTurn } from "../types.js";
import { detectIntent, isBareDecline, isContinue, isOffScript } from "./intent.js";
import { looksLikeQuestion } from "./router.js";
import { buildSlot, formatClock, parseDayTime, weekdayName, type SpokenSlot } from "../booking/slotTime.js";
import {
  annoyedExitLine,
  askDayLine,
  askHourLine,
  askTimeLine,
  didntCatchLine,
  calendarLinkLine,
  backOnTrackLine,
  availabilityCapturedLine,
  closeLine,
  confirmSlotLine,
  contextBridge,
  currentScriptQuestion,
  defaultMeetingSlots,
  dncLine,
  explainSimplyLine,
  fallbackLine,
  holdOnScriptLine,
  hurryCloseLine,
  identityLine,
  noInfoExitLine,
  noInfoPivotLine,
  noTimeHangupLine,
  nudgeLine,
  offerSlotsLine,
  openingLine,
  pitchLine,
  silenceHangupLine,
  slotTakenLine,
  voicemailLine,
  wrapUpLine,
  wrongPersonLine,
} from "../script/lines.js";
import { intentToObjection, rebuttal } from "../script/objections.js";
import type { CallerSignal } from "./signals.js";

const MAX_OBJECTIONS = 3;

function turn(session: Session, role: TranscriptTurn["role"], text: string): TranscriptTurn {
  const entry: TranscriptTurn = {
    role,
    text,
    state: session.state,
    at: new Date().toISOString(),
  };
  session.turns.push(entry);
  return entry;
}

function speak(session: Session, next: CallState, text: string): string {
  session.state = next;
  turn(session, "agent", text);
  return text;
}

function endWith(session: Session, next: CallState, text: string): string {
  const line = speak(session, next, text);
  session.state = "ENDED";
  session.ended = true;
  return line;
}

export function createSession(lead: Lead, callId = randomUUID()): Session {
  return {
    callId,
    lead,
    state: "OPENING",
    turns: [],
    objectionsRaised: [],
    meetingSlot: null,
    complianceFlags: ["ai_disclosed_in_opening"],
    startedAt: Date.now(),
    ended: false,
    silenceNudges: 0,
    questionsAsked: [],
  };
}

/** First spoken beat only. Wait for "okay" before continuing. */
export function startCall(session: Session): string {
  return speak(session, "OPENING", openingLine(session.lead, session.lead.preferred_language));
}

/** The fixed times this call offers: the open ones picked at call start, else the generated defaults. */
export function sessionSlots(session: Session): string[] {
  return session.offerSlots?.length ? session.offerSlots : defaultMeetingSlots(session.lead.preferred_language);
}

function slots(session: Session): string[] {
  return sessionSlots(session);
}

const WEEKDAY_RE = /\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i;
const HOUR_WORDS: Record<string, string> = { eleven: "11", gyarah: "11", three: "3", teen: "3" };

function hoursIn(text: string): Set<string> {
  const hours = new Set<string>();
  for (const digit of text.match(/\b\d{1,2}\b/g) ?? []) hours.add(digit);
  for (const [word, digit] of Object.entries(HOUR_WORDS)) {
    if (new RegExp(`\\b${word}\\b`, "i").test(text)) hours.add(digit);
  }
  return hours;
}

/**
 * Does the caller's reply name one of the slots we just offered (a weekday,
 * an hour, or "first/second")? Used to override the LLM's intent label in
 * CLOSE: in real calls "Wednesday" — the literal second option — was labelled
 * give_availability, so the bot said "I'll send a calendar link" and lost the
 * booking instead of confirming Wednesday.
 */
export function mentionsOfferedSlot(text: string, options: string[]): boolean {
  const lower = text.toLowerCase();
  if (/\b(first|second|pehla|doosra|dusra|pehli|doosri)\b/.test(lower)) return true;
  const saidHours = hoursIn(lower);
  for (const option of options) {
    const day = option.match(WEEKDAY_RE)?.[0]?.toLowerCase();
    if (day && lower.includes(day)) return true;
    if ([...hoursIn(option.toLowerCase())].some((h) => saidHours.has(h))) return true;
  }
  return false;
}

/**
 * defaultMeetingSlots() picks the next two actual weekdays, so which one is
 * "Monday" vs "Tuesday" shifts by the day the call happens. Match against
 * what was actually offered instead of assuming a fixed first=Monday,
 * second=Tuesday mapping — that assumption silently booked the wrong day
 * whenever the real slots landed on any other weekday pair.
 */
export function pickSlot(text: string, options: string[]): string {
  const lower = text.toLowerCase();
  const saidHours = hoursIn(lower);

  for (const option of options) {
    const day = option.match(WEEKDAY_RE)?.[0]?.toLowerCase();
    if (day && lower.includes(day)) return option;
  }
  for (const option of options) {
    const optionHours = hoursIn(option.toLowerCase());
    if ([...optionHours].some((h) => saidHours.has(h))) return option;
  }

  // Ordinal fallback: "the first one" / "the second one" (also Hinglish).
  if (/\b(second|doosra|dusra)\b/.test(lower) && options[1]) return options[1];
  if (/\b(first|pehla)\b/.test(lower) && options[0]) return options[0];

  return options[0] ?? "the first slot";
}

function handleObjection(session: Session, intent: Intent, text: string): string {
  const id = intentToObjection(intent);
  const lang = session.lead.preferred_language;
  const options = slots(session);

  if (id) {
    // A flat "no" / "nahi" is a final decision, not an opening objection to
    // work — end the call right away with a short, polite line. No rebuttal,
    // no re-pitching the demo; that's what made a plain "no" feel pushy.
    if (id === "not_interested" && isBareDecline(text)) {
      session.complianceFlags.push("declined");
      return endWith(session, "WRAP_UP", wrapUpLine(session.lead, lang, null));
    }
    const already = session.objectionsRaised.includes(id);
    if (!already) session.objectionsRaised.push(id);
    if (already && (id === "not_interested" || id === "who_gave_number")) {
      if (id === "not_interested") session.complianceFlags.push("declined");
      return endWith(session, "WRAP_UP", wrapUpLine(session.lead, lang, null));
    }
    if (session.objectionsRaised.length >= MAX_OBJECTIONS && id === "not_interested") {
      session.complianceFlags.push("declined");
      return endWith(session, "WRAP_UP", wrapUpLine(session.lead, lang, null));
    }
    if (id === "no_time") {
      return endWith(session, "WRAP_UP", noTimeHangupLine(session.lead, lang));
    }
    // "Who gave you my number" / "are you AI" don't end on a demo ask, so they
    // must not drag the call into the close — the next "okay" would then be read
    // as agreeing to a time that was never offered.
    if (id === "who_gave_number" || id === "is_this_ai") {
      return speak(session, session.state, rebuttal(id, session.lead, lang, options));
    }
    session.closeStage = "offered";
    return speak(session, "CLOSE", rebuttal(id, session.lead, lang, options));
  }
  session.closeStage = "offered";
  return speak(session, "CLOSE", closeLine(lang, options));
}

/**
 * A complete day + time from what the caller just said, joined with any half they gave
 * earlier ("3 baje" … then "Monday"). Null when nothing new was said or a half is still missing.
 */
export function ownSlotFrom(session: Session, text: string): SpokenSlot | null {
  const key = session.lead.preferred_language === "hi-IN-hinglish" ? "hi" : "en";
  const parts = parseDayTime(text);
  if (parts.weekday === undefined && !parts.time) return null;
  const weekday = parts.weekday ?? session.pendingDay;
  const time = parts.time ?? session.pendingTime;
  if (weekday === undefined || !time) return null;
  return buildSlot(weekday, time, key);
}

function bookSlotAndWrap(session: Session, label: string): string {
  session.pendingDay = undefined;
  session.pendingTime = undefined;
  session.meetingSlot = label;
  return endWith(session, "WRAP_UP", wrapUpLine(session.lead, session.lead.preferred_language, label));
}

/** Did the line we just spoke put any of these times in front of the caller? */
function lastAgentMentionsSlots(session: Session, options: string[]): boolean {
  const last = [...session.turns].reverse().find((t) => t.role === "agent")?.text.toLowerCase() ?? "";
  return options.some((o) => last.includes(o.toLowerCase()));
}

/** Count a CLOSE turn that got nowhere; the third one hands off instead of looping. */
function closeMiss(session: Session): string | null {
  session.closeMisses = (session.closeMisses ?? 0) + 1;
  if (session.closeMisses < 3) return null;
  session.complianceFlags.push("availability_captured");
  return endWith(session, "WRAP_UP", availabilityCapturedLine(session.lead.preferred_language));
}

/**
 * Entering the close: ask the caller for THEIR day and time first. Only when they
 * don't name one do we offer 2-3 fixed times (see handleClose).
 */
function enterClose(session: Session): string {
  const lang = session.lead.preferred_language;
  if (session.state === "CLOSE" && session.closeStage === "asked") {
    session.closeStage = "offered";
    return speak(session, "CLOSE", offerSlotsLine(lang, slots(session)));
  }
  session.closeStage = "asked";
  return speak(session, "CLOSE", askTimeLine(lang));
}

function handleClose(session: Session, intent: Intent, text: string): string {
  const lang = session.lead.preferred_language;
  const options = slots(session);
  const stage = session.closeStage ?? "offered";
  const yes = intent === "acknowledge" || intent === "interested";
  const offer = () => {
    session.closeStage = "offered";
    return speak(session, "CLOSE", offerSlotsLine(lang, options));
  };
  const askTime = () => {
    session.closeStage = "asked";
    return speak(session, "CLOSE", askTimeLine(lang));
  };

  // "No, not that one" to a single suggested time: back to their own time.
  if (stage === "confirm" && (isBareDecline(text) || intent === "decline_slots")) {
    return closeMiss(session) ?? askTime();
  }

  // They named a day + time of their own ("Friday 5 baje", "kal shaam 4 baje") — possibly
  // in two halves ("3 baje" … "Monday").
  const own = ownSlotFrom(session, text);
  if (own) {
    if (!session.ownSlotBusy) return bookSlotAndWrap(session, own.label);
    session.ownSlotBusy = false;
    session.closeStage = "offered";
    const free = options.filter((o) => o !== own.label);
    return closeMiss(session) ?? speak(session, "CLOSE", slotTakenLine(lang, free));
  }

  // They picked one of the times we offered ("Thursday", "the second one") — only once we have offered some.
  if (stage !== "asked" && mentionsOfferedSlot(text, options)) {
    return bookSlotAndWrap(session, pickSlot(text, options));
  }

  // Half an answer: a time with no day ("3 baje") or a day with no time ("Monday"). Remember it
  // and ask only for what's missing, instead of starting the question over.
  const said = parseDayTime(text);
  if (said.weekday !== undefined || said.time) {
    const key = lang === "hi-IN-hinglish" ? "hi" : "en";
    if (said.weekday === 0 || said.weekday === 6) {
      session.pendingDay = undefined;
      return closeMiss(session) ?? offer();
    }
    if (said.weekday !== undefined) session.pendingDay = said.weekday;
    if (said.time) session.pendingTime = said.time;
    session.closeStage = "asked";
    if (session.pendingTime) return speak(session, "CLOSE", askDayLine(lang, formatClock(session.pendingTime, key)));
    return speak(session, "CLOSE", askHourLine(lang, weekdayName(session.pendingDay!)));
  }

  // A plain yes. Which question it answers decides what happens next.
  if (yes || intent === "accept_slot") {
    if (stage === "confirm") return bookSlotAndWrap(session, session.confirmSlot ?? options[0] ?? "the first slot");
    if (stage === "asked") return offer();
    if (lastAgentMentionsSlots(session, options)) {
      session.closeStage = "confirm";
      session.confirmSlot = options[0];
      return speak(session, "CLOSE", confirmSlotLine(lang, options[0] ?? ""));
    }
    return askTime();
  }

  // Nothing usable ("none of those", "I'm free some day", or no time at all).
  if (intent === "decline_slots" || intent === "give_availability") {
    const handoff = closeMiss(session);
    if (handoff) return handoff;
    return stage === "asked" ? offer() : askTime();
  }

  if (intent === "call_later") return handleObjection(session, "call_later", text);
  if (intentToObjection(intent)) return handleObjection(session, intent, text);

  return closeMiss(session) ?? offer();
}

/**
 * React to a tone/channel cue (see conversation/signals.ts). Returns the line to
 * speak, or null when the cue changes nothing about this beat and the normal
 * flow should handle the turn.
 */
export function applyCallerSignal(session: Session, prospectText: string, signal: CallerSignal): string | null {
  const lang = session.lead.preferred_language;

  if (signal === "hurry") {
    session.hurry = true;
    if (!session.complianceFlags.includes("caller_in_a_hurry")) session.complianceFlags.push("caller_in_a_hurry");
    // Already at the ask (or past it): keep the flow, just stop padding replies.
    if (session.state === "CLOSE" || session.state === "WRAP_UP" || session.state === "FALLBACK") return null;
    turn(session, "prospect", prospectText);
    session.silenceNudges = 0;
    session.closeStage = "offered";
    return speak(session, "CLOSE", hurryCloseLine(session.lead, lang, slots(session)));
  }

  if (signal === "link") {
    // Only once we're past the opening: a link request before the pitch is just small talk.
    if (session.state !== "PITCH" && session.state !== "OBJECTION_HANDLING" && session.state !== "CLOSE") return null;
    turn(session, "prospect", prospectText);
    session.silenceNudges = 0;
    session.complianceFlags.push("calendar_link_requested");
    return endWith(session, "WRAP_UP", calendarLinkLine(session.lead, lang));
  }

  if (signal === "confused") {
    if (session.state === "WRAP_UP" || session.state === "FALLBACK") return null;
    turn(session, "prospect", prospectText);
    session.silenceNudges = 0;
    return speak(session, session.state, explainSimplyLine(session.lead, lang, session.state));
  }

  if (signal === "identity") {
    // Only meaningful on the very first beat; later it's just a normal turn.
    if (session.state !== "OPENING") return null;
    turn(session, "prospect", prospectText);
    session.silenceNudges = 0;
    return speak(session, "OPENING", identityLine(session.lead, lang));
  }

  turn(session, "prospect", prospectText);
  session.silenceNudges = 0;
  if (signal === "machine") {
    session.complianceFlags.push("voicemail_detected");
    return endWith(session, "WRAP_UP", voicemailLine(session.lead, lang));
  }
  session.complianceFlags.push("annoyed_exit");
  return endWith(session, "WRAP_UP", annoyedExitLine(session.lead, lang));
}

/** One short line returning to the current beat after a knowledge answer ("" when there's nothing to return to). */
export function backOnTrackTail(session: Session): string {
  return backOnTrackLine(session.lead, session.lead.preferred_language, session.state, session.closeStage, slots(session));
}

/** Ran out of answers: say so once, then steer to the demo (stage = ask for their time). */
export function noInfoPivot(session: Session, prospectText: string): string {
  turn(session, "prospect", prospectText);
  session.silenceNudges = 0;
  session.closeStage = "asked";
  return speak(session, "CLOSE", noInfoPivotLine(session.lead, session.lead.preferred_language));
}

/** Still nothing we can answer: be straight about it and hand over to the founder. */
export function noInfoExit(session: Session, prospectText: string): string {
  turn(session, "prospect", prospectText);
  session.silenceNudges = 0;
  session.complianceFlags.push("no_info_exit");
  return endWith(session, "WRAP_UP", noInfoExitLine(session.lead, session.lead.preferred_language));
}

export function replyTo(session: Session, prospectText: string, intent?: Intent): string {
  if (session.ended) return session.turns.at(-1)?.text ?? "";

  turn(session, "prospect", prospectText);
  session.silenceNudges = 0;
  let resolved = intent ?? detectIntent(prospectText);
  const lang = session.lead.preferred_language;

  if (resolved === "dnc") {
    session.complianceFlags.push("do_not_call_requested");
    return endWith(session, "WRAP_UP", dncLine(lang));
  }
  if (resolved === "hostile") {
    session.complianceFlags.push("hostile_exit");
    return endWith(session, "FALLBACK", fallbackLine(lang));
  }
  // A garbled-but-parseable "Friday 5 baje" in the close must reach handleClose even
  // if the LLM called it off-script.
  if (session.state === "CLOSE") {
    const said = parseDayTime(prospectText);
    if (said.weekday !== undefined || said.time) resolved = "give_availability";
  }
  // A one- or two-word scrap we can't read ("Mujhe", "Mande" — a bad mic read): asking the
  // caller to repeat is better than answering it, which used to repeat the whole close line.
  session.didntCatch = false;
  if (
    (resolved === "unclear" || resolved === "company_knowledge") &&
    prospectText.trim().split(/\s+/).length <= 2 &&
    !looksLikeQuestion(prospectText) &&
    session.state !== "OPENING"
  ) {
    session.didntCatch = true;
    return speak(session, session.state, didntCatchLine(lang));
  }
  if (isOffScript(resolved)) {
    // The off-script line re-asks the close question with the fixed times.
    if (session.state === "CLOSE") session.closeStage = "offered";
    return speak(
      session,
      session.state,
      holdOnScriptLine(session.lead, lang, session.state, slots(session)),
    );
  }

  if (resolved === "booking_request") {
    return enterClose(session);
  }

  if (resolved === "wrong_person") {
    return endWith(session, "WRAP_UP", wrongPersonLine(lang));
  }

  // The caller jumped ahead and named a day or time before we asked ("3 baje", "Monday"):
  // take that as the answer to the close instead of ignoring it and offering our own times.
  if (session.state === "PITCH" || session.state === "OBJECTION_HANDLING") {
    const said = parseDayTime(prospectText);
    if (said.weekday !== undefined || said.time) {
      session.state = "CLOSE";
      session.closeStage = "asked";
      return handleClose(session, "give_availability", prospectText);
    }
  }

  switch (session.state) {
    case "OPENING":
      if (intentToObjection(resolved)) return handleObjection(session, resolved, prospectText);
      return speak(session, "CONTEXT_BRIDGE", contextBridge(session.lead, lang));

    case "CONTEXT_BRIDGE":
      if (intentToObjection(resolved)) return handleObjection(session, resolved, prospectText);
      return speak(session, "PITCH", pitchLine(session.lead, lang));

    case "PITCH":
    case "OBJECTION_HANDLING":
      if (intentToObjection(resolved) && resolved !== "is_this_ai") {
        return handleObjection(session, resolved, prospectText);
      }
      if (resolved === "is_this_ai") return handleObjection(session, resolved, prospectText);
      if (isContinue(resolved) || resolved === "accept_slot") {
        return enterClose(session);
      }
      return handleObjection(session, resolved, prospectText);

    case "CLOSE":
      return handleClose(session, resolved, prospectText);

    case "WRAP_UP":
    case "FALLBACK":
      session.ended = true;
      session.state = "ENDED";
      return session.turns.at(-1)?.text ?? fallbackLine(lang);

    default:
      return speak(session, "OPENING", openingLine(session.lead, lang));
  }
}

/** Operator ended the call (Hang Up) before the script reached a natural close — say a proper goodbye instead of just going silent. */
export function endCallManually(session: Session): string {
  if (session.ended) return session.turns.at(-1)?.text ?? "";
  return endWith(session, "WRAP_UP", wrapUpLine(session.lead, session.lead.preferred_language, session.meetingSlot));
}

export function nudge(session: Session): string {
  if (session.ended) return session.turns.at(-1)?.text ?? "";
  session.silenceNudges += 1;
  if (session.silenceNudges >= 2) {
    session.complianceFlags.push("silence_hangup");
    return endWith(session, "WRAP_UP", silenceHangupLine(session.lead.preferred_language));
  }
  return speak(
    session,
    session.state,
    nudgeLine(session.lead, session.lead.preferred_language),
  );
}

export function scriptQuestionFor(session: Session): string {
  return currentScriptQuestion(session.lead, session.lead.preferred_language, session.state, slots(session));
}

/** A side reply (FAQ answer, repeat): keep the current script beat, do not advance state. */
export function recordSideReply(
  session: Session,
  prospectText: string,
  agentText: string,
  extras: { via?: TranscriptTurn["via"] } = {},
): string {
  if (session.ended) return session.turns.at(-1)?.text ?? "";
  turn(session, "prospect", prospectText);
  session.silenceNudges = 0;
  const entry: TranscriptTurn = {
    role: "agent",
    text: agentText,
    state: session.state,
    at: new Date().toISOString(),
    via: extras.via ?? "faq",
  };
  session.turns.push(entry);
  return agentText;
}

/** Caller asked to book before the script reached CLOSE. */
export function offerBooking(session: Session, prospectText: string): string {
  turn(session, "prospect", prospectText);
  session.silenceNudges = 0;
  return enterClose(session);
}

export function replaceLastAgentLine(session: Session, text: string): void {
  for (let i = session.turns.length - 1; i >= 0; i -= 1) {
    const entry = session.turns[i];
    if (entry?.role === "agent") {
      entry.text = text;
      return;
    }
  }
}

export function transcriptText(session: Session): string {
  return session.turns
    .map((t) => `${t.role === "agent" ? "Agent" : "Prospect"}: ${t.text}`)
    .join("\n");
}
