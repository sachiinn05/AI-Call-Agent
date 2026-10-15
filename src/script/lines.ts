/**
 * Every spoken line, read from content/call-script.yaml. Nothing here is
 * hardcoded text — these functions pick the right beat for the moment and
 * fill in the caller's details. Edit the YAML to change what the agent says.
 */
import type { Lead, PreferredLanguage } from "../types.js";
import { config } from "../config.js";
import { getScript, render, scriptLang, type ScriptLang, type Vars } from "./scriptFile.js";

export function firstName(lead: Lead): string {
  return lead.contact_name.trim().split(/\s+/)[0] ?? lead.contact_name;
}

function founder(): string {
  return config.founderName || "Sachin";
}

function company(): string {
  return config.companyName || "our company";
}

// ---------------------------------------------------------------------------
// Topic: which story this lead gets
// ---------------------------------------------------------------------------

export type Topic = {
  key: string;
  /** Short noun phrase for splicing into a sentence, e.g. "patient calls". */
  noun: string;
  nounHi: string;
  /** Fuller phrase for a standalone question/sentence. */
  full: string;
  fullHi: string;
  /** What it costs them when the call goes unanswered — sells the outcome, not the feature. */
  consequence: string;
  consequenceHi: string;
};

/** Maps a lead's industry/description to the topic in the script whose `match` words appear. */
export function topicFor(lead: Lead): Topic {
  const blob = `${lead.industry} ${lead.company_description} ${lead.need_for_bot}`.toLowerCase();
  const { topics } = getScript();
  let key = "general";
  for (const [name, topic] of Object.entries(topics)) {
    if (name === "general") continue;
    if (topic.match.some((word) => word && blob.includes(word.toLowerCase()))) {
      key = name;
      break;
    }
  }
  const t = topics[key] ?? topics["general"]!;
  return {
    key,
    noun: t.en.calls,
    nounHi: t.hi.calls,
    full: t.en.problem,
    fullHi: t.hi.problem,
    consequence: t.en.consequence,
    consequenceHi: t.hi.consequence,
  };
}

// ---------------------------------------------------------------------------
// Placeholder values for a given call
// ---------------------------------------------------------------------------

/** Shared by lines.ts, objections.ts, and faq.ts so every spoken line — not just this file's — sees the same fields. */
export function baseVars(lead: Lead, language: PreferredLanguage): Vars {
  const t = topicFor(lead);
  const l = scriptLang(language);
  return {
    name: firstName(lead),
    company: lead.company_name,
    ourCompany: company(),
    founder: founder(),
    calls: l === "hi" ? t.nounHi : t.noun,
    problem: l === "hi" ? t.fullHi : t.full,
    consequence: l === "hi" ? t.consequenceHi : t.consequence,
    // Hindi grammatical agreement when a line addresses the caller directly
    // ("aap ... rahe/rahi hain") — the rest of the sentence doesn't change.
    rahe: lead.gender === "female" ? "rahi" : "rahe",
  };
}

function say(line: { en: string; hi: string }, l: ScriptLang, vars: Vars): string {
  return render(line[l], vars);
}

// ---------------------------------------------------------------------------
// Slots
// ---------------------------------------------------------------------------

export function defaultMeetingSlots(language: PreferredLanguage = "en-IN"): string[] {
  if (config.meetingSlots.length >= 2) return config.meetingSlots;
  const out: string[] = [];
  const cursor = new Date();
  // Three different days AND three different hours, so "Thursday" or "5 baje" alone
  // always points at exactly one of them.
  const hours = [11, 15, 17];
  while (out.length < 3) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day === 0 || day === 6) continue;
    const hour = hours[out.length] ?? 11;
    const clock = hour > 12 ? hour - 12 : hour;
    const weekday = cursor.toLocaleDateString("en-IN", { weekday: "long" });
    out.push(scriptLang(language) === "hi" ? `${weekday} ${clock} baje` : `${weekday} at ${clock}`);
  }
  return out;
}

/** "A or B" / "A, B or C" (Hinglish: "ya"). */
export function slotPair(language: PreferredLanguage, slots: string[]): string {
  const list = slots.length ? slots : ["Monday 11", "Tuesday 3"];
  const or = scriptLang(language) === "hi" ? "ya" : "or";
  if (list.length === 1) return list[0]!;
  return `${list.slice(0, -1).join(", ")} ${or} ${list[list.length - 1]}`;
}

// ---------------------------------------------------------------------------
// The call, beat by beat
// ---------------------------------------------------------------------------

/** Short backchannels spoken the instant the caller stops talking, while the real reply is generated. */
export function thinkingFillers(language: PreferredLanguage): string[] {
  const f = getScript().steering.fillers;
  if (language === "hi-IN-hinglish") return f.hi;
  if (language === "en-IN") return f["en-IN"];
  return f["en-US"];
}

/** Outbound cold-open: say who's calling and why, then ask for a minute. Nothing else. */
export function openingLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().flow.opening, scriptLang(language), baseVars(lead, language));
}

/** The discovery question this call is actually built around. Lead-specific, not a menu. */
export function problemQuestion(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().flow.discovery_question, scriptLang(language), baseVars(lead, language));
}

/** Company intro beat: thank them for the minute, ask the one discovery question. */
export function contextBridge(lead: Lead, language: PreferredLanguage): string {
  const vars = { ...baseVars(lead, language), question: problemQuestion(lead, language) };
  return say(getScript().flow.discovery, scriptLang(language), vars);
}

/** Acknowledge, sell the outcome (not just the feature), ask for a demo. Then wait. */
export function pitchLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().flow.pitch, scriptLang(language), baseVars(lead, language));
}

/** Two concrete times, and what they're for. */
export function closeLine(language: PreferredLanguage, slots: string[]): string {
  return say(getScript().flow.close, scriptLang(language), {
    founder: founder(),
    slots: slotPair(language, slots),
  });
}

export function confirmSlotLine(language: PreferredLanguage, slot: string): string {
  return say(getScript().flow.confirm_slot, scriptLang(language), { slot });
}

export function wrapUpLine(lead: Lead, language: PreferredLanguage, booked: string | null): string {
  const s = getScript().flow;
  const vars = { ...baseVars(lead, language), slot: booked ?? "" };
  return say(booked ? s.wrap_up_booked : s.wrap_up_not_booked, scriptLang(language), vars);
}

export function availabilityCapturedLine(language: PreferredLanguage): string {
  return say(getScript().flow.availability_captured, scriptLang(language), { founder: founder() });
}

/** CLOSE step 1: ask the caller for THEIR day and time before offering any of ours. */
export function askTimeLine(language: PreferredLanguage): string {
  return say(getScript().flow.ask_time, scriptLang(language), { founder: founder() });
}

/** CLOSE step 2: they didn't name a usable time — offer 2-3 fixed ones. */
export function offerSlotsLine(language: PreferredLanguage, slots: string[]): string {
  return say(getScript().flow.offer_slots, scriptLang(language), { slots: slotPair(language, slots) });
}

export function slotTakenLine(language: PreferredLanguage, slots: string[]): string {
  return say(getScript().flow.slot_taken, scriptLang(language), { slots: slotPair(language, slots) });
}

/** The caller didn't follow: the current beat again, in plain words. */
export function explainSimplyLine(lead: Lead, language: PreferredLanguage, state: string): string {
  const l = scriptLang(language);
  const vars = { ...baseVars(lead, language), question: problemQuestion(lead, language) };
  const s = getScript();
  if (state === "CLOSE") return say(s.flow.explain_close, l, vars);
  if (state === "CONTEXT_BRIDGE") return say(s.steering.explain_question, l, vars);
  if (state === "PITCH" || state === "OBJECTION_HANDLING") return say(s.flow.explain_pitch, l, vars);
  return say(s.steering.identity, l, vars);
}

/** A short "back to where we were", spoken right after answering a question. Empty when there's nothing to return to. */
export function backOnTrackLine(
  lead: Lead,
  language: PreferredLanguage,
  state: string,
  closeStage: string | undefined,
  slots: string[],
): string {
  const l = scriptLang(language);
  const s = getScript().steering;
  const vars = { ...baseVars(lead, language), question: problemQuestion(lead, language), slots: slotPair(language, slots) };
  if (state === "CONTEXT_BRIDGE") return say(s.back_to_question, l, vars);
  if (state === "PITCH" || state === "OBJECTION_HANDLING") {
    return say(s.back_to_question, l, { ...vars, question: say(getScript().flow.pitch_question, l, vars) });
  }
  if (state === "CLOSE") {
    return closeStage === "offered" || closeStage === "confirm" ? say(s.back_to_offer, l, vars) : say(s.back_to_close, l, vars);
  }
  return "";
}

export function offTopicLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().steering.off_topic, scriptLang(language), baseVars(lead, language));
}

export function askDayLine(language: PreferredLanguage, time: string): string {
  return say(getScript().flow.ask_day, scriptLang(language), { time });
}

export function askHourLine(language: PreferredLanguage, day: string): string {
  return say(getScript().flow.ask_hour, scriptLang(language), { day });
}

export function calendarLinkLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().exits.calendar_link, scriptLang(language), baseVars(lead, language));
}

export function didntCatchLine(language: PreferredLanguage): string {
  return say(getScript().steering.didnt_catch, scriptLang(language), {});
}

export function noInfoPivotLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().steering.no_info_pivot, scriptLang(language), baseVars(lead, language));
}

export function noInfoExitLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().exits.no_info_exit, scriptLang(language), baseVars(lead, language));
}

/** "Who is this?" at the start of the call. */
export function identityLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().steering.identity, scriptLang(language), baseVars(lead, language));
}

// ---------------------------------------------------------------------------
// Exits — spoken exactly as written, never rephrased
// ---------------------------------------------------------------------------

export function noTimeHangupLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().exits.no_time, scriptLang(language), baseVars(lead, language));
}

export function fallbackLine(language: PreferredLanguage): string {
  return say(getScript().exits.hostile, scriptLang(language), {});
}

export function dncLine(language: PreferredLanguage): string {
  return say(getScript().exits.do_not_call, scriptLang(language), {});
}

export function wrongPersonLine(language: PreferredLanguage): string {
  return say(getScript().exits.wrong_person, scriptLang(language), {});
}

export function voicemailLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().exits.voicemail, scriptLang(language), baseVars(lead, language));
}

export function annoyedExitLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().exits.annoyed, scriptLang(language), baseVars(lead, language));
}

export function hurryCloseLine(lead: Lead, language: PreferredLanguage, slots: string[]): string {
  return say(getScript().flow.hurry_close, scriptLang(language), {
    ...baseVars(lead, language),
    slots: slotPair(language, slots),
  });
}

export function silenceHangupLine(language: PreferredLanguage): string {
  return say(getScript().exits.silence, scriptLang(language), {});
}

// ---------------------------------------------------------------------------
// Steering
// ---------------------------------------------------------------------------

export function nudgeLine(lead: Lead, language: PreferredLanguage): string {
  return say(getScript().steering.nudge, scriptLang(language), baseVars(lead, language));
}

/** The question we're steering back to, for the beat the call is on. */
export function currentScriptQuestion(lead: Lead, language: PreferredLanguage, state: string, slots?: string[]): string {
  const s = getScript();
  const l = scriptLang(language);
  if (state === "OPENING") return say(s.steering.anchor.opening, l, {});
  if (state === "CONTEXT_BRIDGE") return problemQuestion(lead, language);
  if (state === "PITCH" || state === "OBJECTION_HANDLING") return say(s.flow.pitch_question, l, {});
  if (state === "CLOSE") return closeLine(language, slots ?? defaultMeetingSlots(language));
  return say(s.steering.anchor.default, l, {});
}

export function holdOnScriptLine(lead: Lead, language: PreferredLanguage, state: string, slots?: string[]): string {
  const question = currentScriptQuestion(lead, language, state, slots);
  return say(getScript().steering.hold_on_script, scriptLang(language), { question });
}

/** A question the FAQ doesn't cover: say so, don't guess, pivot to the demo. */
export function faqNoMatchLine(language: PreferredLanguage): string {
  return say(getScript().steering.faq_no_match, scriptLang(language), { founder: founder() });
}
