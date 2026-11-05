import { describe, expect, it } from "vitest";
import { computeAnalytics, dropStage, furthestStage } from "../../backend/analytics/callStats.js";
import { callLines, feedbackKnowledge, feedbackTests } from "../../backend/analytics/feedbackExport.js";
import type { CallResult, Feedback } from "../../backend/types.js";

type T = { role: "agent" | "prospect"; text: string; state: string };

function call(partial: Partial<CallResult> & { turns?: T[] }): CallResult {
  return {
    call_id: Math.random().toString(36).slice(2),
    timestamp: "2026-01-01T00:00:00.000Z",
    duration: 60,
    connected: true,
    full_transcript: "",
    call_summary: "",
    disposition: "Not Interested",
    lead_score: 2,
    objections_raised: [],
    key_quotes: [],
    meeting_details: null,
    company_details_confirmed: [],
    compliance_flags: [],
    next_action: "nothing",
    ...partial,
  } as CallResult;
}

const a = (text: string, state: string): T => ({ role: "agent", text, state });
const p = (text: string, state: string): T => ({ role: "prospect", text, state });

// A caller who heard the pitch and said no on it.
const lostAtPitch = call({
  turns: [a("Hello?", "OPENING"), p("hello", "OPENING"), a("intro", "OPENING"), p("haan", "OPENING"), a("question", "CONTEXT_BRIDGE"), p("we manage", "CONTEXT_BRIDGE"), a("pitch", "PITCH"), p("nahi", "PITCH"), a("bye", "WRAP_UP")],
  objections_raised: ["not_interested"],
});
// A caller who dropped during discovery.
const lostAtDiscovery = call({
  turns: [a("Hello?", "OPENING"), p("hello", "OPENING"), a("intro", "OPENING"), p("haan", "OPENING"), a("question", "CONTEXT_BRIDGE"), p("abhi busy", "CONTEXT_BRIDGE"), a("bye", "WRAP_UP")],
  objections_raised: ["no_time"],
});
const booked = call({
  disposition: "Meeting Booked",
  meeting_details: { date: "Thursday", time: "11", with: "Sachin" },
  turns: [a("Hello?", "OPENING"), p("hello", "OPENING"), a("intro", "OPENING"), p("haan", "OPENING"), a("q", "CONTEXT_BRIDGE"), p("x", "CONTEXT_BRIDGE"), a("pitch", "PITCH"), p("haan", "PITCH"), a("when?", "CLOSE"), p("thursday", "CLOSE"), a("done", "WRAP_UP")],
});
const noAnswer = call({ connected: false, disposition: "No Answer" });
const voicemail = call({ disposition: "Voicemail", connected: true });
const oldCall = call({ turns: undefined, objections_raised: ["not_interested"] });

describe("call stages", () => {
  it("finds the furthest beat a call reached", () => {
    expect(furthestStage(lostAtDiscovery)).toBe("discovery");
    expect(furthestStage(lostAtPitch)).toBe("pitch");
    expect(furthestStage(booked)).toBe("close");
    expect(furthestStage(oldCall)).toBeNull();
  });

  it("finds the beat the caller was on when they last spoke", () => {
    expect(dropStage(lostAtDiscovery)).toBe("discovery");
    expect(dropStage(lostAtPitch)).toBe("pitch");
    expect(dropStage(noAnswer)).toBeNull();
  });
});

describe("computeAnalytics", () => {
  const stats = computeAnalytics([lostAtPitch, lostAtDiscovery, booked, noAnswer, voicemail, oldCall]);

  it("counts calls, answered (people only), demo asks and bookings", () => {
    expect(stats.totals.calls).toBe(6);
    // lostAtPitch, lostAtDiscovery, booked, oldCall — not the no-answer, not the voicemail
    expect(stats.totals.answered).toBe(4);
    expect(stats.totals.booked).toBe(1);
    expect(stats.totals.reachedDemoAsk).toBe(1);
    expect(stats.totals.bookingRate).toBe(25);
  });

  it("builds a funnel that never grows as it goes down (for calls with stage data)", () => {
    const counts = Object.fromEntries(stats.funnel.map((f) => [f.key, f.count]));
    expect(counts.discovery).toBe(3);
    expect(counts.pitch).toBe(2);
    expect(counts.close).toBe(1);
    expect(counts.booked).toBe(1);
  });

  it("says where answered callers who did not book dropped off", () => {
    const by = Object.fromEntries(stats.dropOff.map((d) => [d.stage, d.count]));
    expect(by.pitch).toBe(1);
    expect(by.discovery).toBe(1);
    expect(by.unknown).toBe(1); // the older call with no turn data
  });

  it("ranks objections and flags calls with no stage data", () => {
    expect(stats.objections[0]).toEqual({ id: "not_interested", count: 2 });
    expect(stats.callsWithoutStages).toBe(3); // noAnswer, voicemail, oldCall have no turns
  });

  it("is all zeros for no calls", () => {
    const empty = computeAnalytics([]);
    expect(empty.totals).toMatchObject({ calls: 0, answered: 0, booked: 0, bookingRate: 0 });
    expect(empty.dropOff).toEqual([]);
  });
});

const report: Feedback = {
  id: "c1:7",
  call_id: "c1",
  turn_index: 7,
  agent_text: 'Sir, jab aapka order miss ho jata hai, system "turant" uska detail leta hai.',
  caller_text: "hum unhe baad mein call kar lete hain",
  state: "CONTEXT_BRIDGE",
  issue: "wrong_answer",
  expected: "Achha, samajh gaya. Hamara AI aise calls turant utha leta hai.",
  status: "new",
  created_at: "2026-02-03T10:00:00.000Z",
  contact_name: "Rawat",
};

describe("feedback export", () => {
  it("reads lines from saved turns, or from the transcript of an older call", () => {
    expect(callLines(booked)[0]).toMatchObject({ role: "agent", state: "OPENING" });
    const old = call({ full_transcript: "Agent: Hello?\nProspect: hello\nAgent: intro" });
    expect(callLines(old).map((l) => l.role)).toEqual(["agent", "prospect", "agent"]);
    expect(callLines(old)[1]?.text).toBe("hello");
  });

  it("writes a skipped regression test per report, with the text safely quoted", () => {
    const out = feedbackTests([report]);
    expect(out).toContain("it.skip(");
    expect(out).toContain('sessionAt("CONTEXT_BRIDGE")');
    expect(out).toContain(JSON.stringify(report.agent_text)); // quotes in the reply are escaped
    expect(out).toContain("Should have said: Achha, samajh gaya");
  });

  it("starts a report from an older call (beat unknown) at the discovery question", () => {
    expect(feedbackTests([{ ...report, state: "unknown" }])).toContain('sessionAt("CONTEXT_BRIDGE")');
  });

  it("writes knowledge Q&A lines only for reports that carry a corrected answer", () => {
    const out = feedbackKnowledge([report, { ...report, id: "c1:9", expected: "" }, { ...report, id: "c1:3", issue: "awkward" }]);
    expect(out.match(/^\[/gm)).toHaveLength(1);
    expect(out).toContain("`hum unhe baad mein call kar lete hain`");
    expect(feedbackKnowledge([])).toContain("No reports");
  });

  it("escapes backticks and ${ in caller text so the pasted line is valid code", () => {
    const out = feedbackKnowledge([{ ...report, caller_text: "price `${x}` kya hai" }]);
    expect(out).toContain("price \\`\\${x}\\` kya hai");
  });
});

describe("a finished call keeps its turns", () => {
  it("saves every line with the beat it was said on, so analytics can place a drop-off", async () => {
    const { createSession, startCall, replyTo } = await import("../../backend/conversation/stateMachine.js");
    const { heuristicScore } = await import("../../backend/scoring/scorer.js");
    const lead = {
      company_name: "Apna Kirana Store",
      contact_name: "Rawat",
      contact_number: "+919800000001",
      contact_role: "",
      company_domain: "",
      company_description: "grocery delivery",
      industry: "grocery",
      need_for_bot: "",
      preferred_language: "hi-IN-hinglish" as const,
      lead_source: "",
      priority_tier: "normal" as const,
      gender: "male" as const,
    };
    const session = createSession(lead);
    startCall(session);
    replyTo(session, "hello");
    replyTo(session, "haan bolo");
    replyTo(session, "nahi"); // a flat no during the discovery question ends the call

    const result = heuristicScore(session);
    expect(result.turns?.length).toBe(session.turns.length);
    expect(result.turns?.[0]).toMatchObject({ role: "agent", state: "OPENING" });
    expect(dropStage(result)).toBe("discovery");
    expect(computeAnalytics([result]).dropOff[0]?.stage).toBe("discovery");
  });
});
