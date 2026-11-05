/**
 * Turns saved calls into the numbers that tell you which line of the script to fix next:
 * how far calls got (the funnel), where callers stopped talking to us, and what they objected to.
 * Pure functions over saved calls — no I/O — so they are easy to test.
 */
import type { CallResult } from "../types.js";

/** The beats of the call, in order, as the dashboard names them. */
export const STAGES = ["opening", "discovery", "pitch", "close"] as const;
export type Stage = (typeof STAGES)[number];

const STATE_TO_STAGE: Record<string, Stage | undefined> = {
  OPENING: "opening",
  CONTEXT_BRIDGE: "discovery",
  PITCH: "pitch",
  OBJECTION_HANDLING: "pitch",
  CLOSE: "close",
};

export function stageOf(state: string): Stage | null {
  return STATE_TO_STAGE[state] ?? null;
}

export function isBooked(call: CallResult): boolean {
  return call.disposition === "Meeting Booked" || Boolean(call.meeting_details);
}

/** A person (not a voicemail) picked up and said something. */
export function isAnswered(call: CallResult): boolean {
  return call.connected && call.disposition !== "Voicemail";
}

/** The furthest beat a call reached, from its saved turns. Null when the call has no turn data. */
export function furthestStage(call: CallResult): Stage | null {
  if (!call.turns?.length) return null;
  let best = -1;
  for (const turn of call.turns) {
    const stage = stageOf(turn.state);
    if (stage) best = Math.max(best, STAGES.indexOf(stage));
  }
  return best >= 0 ? STAGES[best]! : null;
}

/** Where the caller was when they last spoke — the beat the call was lost (or won) on. */
export function dropStage(call: CallResult): Stage | null {
  const last = [...(call.turns ?? [])].reverse().find((t) => t.role === "prospect");
  return last ? stageOf(last.state) : null;
}

export type Analytics = {
  totals: {
    calls: number;
    answered: number;
    reachedDemoAsk: number;
    booked: number;
    /** booked / answered, as a whole percent. */
    bookingRate: number;
    avgDurationSec: number;
  };
  /** Each step of the call and how many calls got that far (calls with stage data only, plus booked). */
  funnel: { key: string; label: string; count: number }[];
  /** Answered calls that did not book, by the beat the caller last spoke on. */
  dropOff: { stage: Stage | "unknown"; label: string; count: number }[];
  objections: { id: string; count: number }[];
  dispositions: { name: string; count: number }[];
  /** Saved before turn data existed: counted in totals, but have no stage. */
  callsWithoutStages: number;
};

const STAGE_LABEL: Record<Stage | "unknown", string> = {
  opening: "Opening (greeting / intro)",
  discovery: "Discovery question",
  pitch: "Pitch",
  close: "Booking a time",
  unknown: "Unknown (older calls)",
};

function tally(values: string[]): [string, number][] {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function computeAnalytics(calls: CallResult[]): Analytics {
  const answered = calls.filter(isAnswered);
  const booked = calls.filter(isBooked);
  // A call reached the demo ask if it got to the close beat, or booked, or asked for the link.
  const reachedAsk = calls.filter(
    (c) => isBooked(c) || furthestStage(c) === "close" || c.compliance_flags.includes("calendar_link_requested"),
  );

  const stageCalls = calls.filter((c) => c.turns?.length);
  const reached = (stage: Stage) => {
    const need = STAGES.indexOf(stage);
    return stageCalls.filter((c) => {
      const got = furthestStage(c);
      return got !== null && STAGES.indexOf(got) >= need;
    }).length;
  };

  const lost = answered.filter((c) => !isBooked(c));
  const dropCounts = new Map<Stage | "unknown", number>();
  for (const c of lost) {
    const stage = dropStage(c) ?? "unknown";
    dropCounts.set(stage, (dropCounts.get(stage) ?? 0) + 1);
  }

  const durations = calls.map((c) => c.duration).filter((d) => d > 0);

  return {
    totals: {
      calls: calls.length,
      answered: answered.length,
      reachedDemoAsk: reachedAsk.length,
      booked: booked.length,
      bookingRate: answered.length ? Math.round((booked.length / answered.length) * 100) : 0,
      avgDurationSec: durations.length ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length) : 0,
    },
    funnel: [
      { key: "calls", label: "Calls made", count: calls.length },
      { key: "answered", label: "Answered by a person", count: answered.length },
      { key: "discovery", label: "Got past the opening", count: reached("discovery") },
      { key: "pitch", label: "Heard the pitch", count: reached("pitch") },
      { key: "close", label: "Reached the demo ask", count: reachedAsk.length },
      { key: "booked", label: "Booked a demo", count: booked.length },
    ],
    dropOff: [...dropCounts]
      .map(([stage, count]) => ({ stage, label: STAGE_LABEL[stage], count }))
      .sort((a, b) => b.count - a.count),
    objections: tally(calls.flatMap((c) => c.objections_raised)).map(([id, count]) => ({ id, count })),
    dispositions: tally(calls.map((c) => c.disposition)).map(([name, count]) => ({ name, count })),
    callsWithoutStages: calls.length - stageCalls.length,
  };
}
