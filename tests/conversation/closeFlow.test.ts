import { describe, expect, it } from "vitest";
import { applyCallerSignal, createSession, replyTo, startCall } from "../../src/conversation/stateMachine.js";
import { detectCallerSignal } from "../../src/conversation/signals.js";
import { defaultMeetingSlots } from "../../src/script/lines.js";
import type { Lead } from "../../src/types.js";

const lead: Lead = {
  company_name: "CityCare",
  contact_name: "Neha Kapoor",
  contact_number: "+919800000005",
  contact_role: "",
  company_domain: "",
  company_description: "hospital front desk",
  industry: "hospital",
  need_for_bot: "",
  preferred_language: "hi-IN-hinglish",
  lead_source: "",
  priority_tier: "normal",
  gender: "female",
};

function atPitch() {
  const s = createSession(lead);
  s.state = "PITCH";
  return s;
}

describe("the close: ask their time first, then offer fixed times", () => {
  it("offers three distinct fixed slots", () => {
    const slots = defaultMeetingSlots("hi-IN-hinglish");
    expect(slots).toHaveLength(3);
    expect(new Set(slots).size).toBe(3);
  });

  it("asks for the caller's time before offering any of ours", () => {
    const s = atPitch();
    const line = replyTo(s, "okay", "acknowledge");
    expect(s.state).toBe("CLOSE");
    expect(s.closeStage).toBe("asked");
    expect(line).toMatch(/kaunsa din aur time/i);
    for (const slot of defaultMeetingSlots("hi-IN-hinglish")) expect(line).not.toContain(slot);
  });

  it("books the time the caller names", () => {
    const s = atPitch();
    replyTo(s, "okay", "acknowledge");
    replyTo(s, "Friday 5 baje", "give_availability");
    expect(s.meetingSlot).toBe("Friday 5 baje");
    expect(s.ended).toBe(true);
  });

  it("offers the fixed times when the caller doesn't name one", () => {
    const s = atPitch();
    replyTo(s, "okay", "acknowledge");
    const line = replyTo(s, "jab aap bolo", "acknowledge");
    expect(s.ended).toBe(false);
    expect(s.closeStage).toBe("offered");
    for (const slot of defaultMeetingSlots("hi-IN-hinglish")) expect(line).toContain(slot);
  });

  it("books the offered slot the caller picks", () => {
    const s = atPitch();
    replyTo(s, "okay", "acknowledge");
    replyTo(s, "aap batao", "acknowledge");
    const second = defaultMeetingSlots("hi-IN-hinglish")[1]!;
    replyTo(s, `${second.split(" ")[0]}`, "accept_slot");
    expect(s.meetingSlot).toBe(second);
  });

  it("does not loop on 'okay' — a yes to 'shall I lock it?' books it", () => {
    const s = atPitch();
    replyTo(s, "okay", "acknowledge");
    replyTo(s, "aap batao", "acknowledge");
    const first = defaultMeetingSlots("hi-IN-hinglish")[0]!;
    const confirm = replyTo(s, "theek hai", "acknowledge");
    expect(confirm).toContain(first);
    expect(s.closeStage).toBe("confirm");
    replyTo(s, "haan", "acknowledge");
    expect(s.meetingSlot).toBe(first);
    expect(s.ended).toBe(true);
  });

  it("asks for their own time again when they say no to the suggested one", () => {
    const s = atPitch();
    replyTo(s, "okay", "acknowledge");
    replyTo(s, "aap batao", "acknowledge");
    replyTo(s, "theek hai", "acknowledge");
    const line = replyTo(s, "nahi", "not_interested");
    expect(s.ended).toBe(false);
    expect(s.closeStage).toBe("asked");
    expect(line).toMatch(/kaunsa din aur time/i);
  });

  it("says the time is taken and offers the others", () => {
    const s = atPitch();
    replyTo(s, "okay", "acknowledge");
    s.ownSlotBusy = true;
    const line = replyTo(s, "Friday 5 baje", "give_availability");
    expect(s.meetingSlot).toBeNull();
    expect(s.ended).toBe(false);
    expect(line).toMatch(/bhara hua/);
  });

  it("hands off after three turns that go nowhere", () => {
    const s = atPitch();
    replyTo(s, "okay", "acknowledge");
    replyTo(s, "none of those", "decline_slots");
    replyTo(s, "none of those", "decline_slots");
    expect(s.ended).toBe(false);
    replyTo(s, "none of those", "decline_slots");
    expect(s.ended).toBe(true);
    expect(s.meetingSlot).toBeNull();
    expect(s.complianceFlags).toContain("availability_captured");
  });
});

describe("early-call flow", () => {
  it("answers 'who gave you my number' without dragging the call into the close", () => {
    const s = createSession(lead);
    startCall(s);
    replyTo(s, "kaun sa number", "who_gave_number");
    expect(s.state).toBe("OPENING");
    replyTo(s, "okay", "acknowledge");
    expect(s.state).toBe("CONTEXT_BRIDGE");
  });

  it("answers 'kaun hai' with who we are and keeps the opening question", () => {
    expect(detectCallerSignal("kaun hai")).toBe("identity");
    expect(detectCallerSignal("main janna chahta hun Sachin kaun hai")).toBeNull();
    const s = createSession(lead);
    startCall(s);
    const line = applyCallerSignal(s, "kaun hai", "identity");
    expect(s.state).toBe("OPENING");
    expect(s.ended).toBe(false);
    expect(line).toMatch(/AI assistant/);
    expect(line).toMatch(/minute/);
  });
});

import { backOnTrackTail, noInfoExit, noInfoPivot } from "../../src/conversation/stateMachine.js";
import { scoreCall } from "../../src/scoring/scorer.js";

describe("staying human when the caller drifts", () => {
  it("explains the pitch in plain words when the caller didn't follow", () => {
    expect(detectCallerSignal("main samjha nahin aap kya bol rahe hain")).toBe("confused");
    const s = createSession(lead);
    s.state = "PITCH";
    const line = applyCallerSignal(s, "main samjha nahin", "confused");
    expect(s.state).toBe("PITCH");
    expect(line).toMatch(/Seedhi baat/);
  });

  it("steers back to the booking question after an answer in the close", () => {
    const s = createSession(lead);
    s.state = "CLOSE";
    s.closeStage = "asked";
    expect(backOnTrackTail(s)).toMatch(/kaunsa din aur time/);
    s.closeStage = "offered";
    for (const slot of defaultMeetingSlots("hi-IN-hinglish")) expect(backOnTrackTail(s)).toContain(slot);
  });

  it("pivots to the demo, then hands over politely when it has no information", async () => {
    const s = createSession(lead);
    s.state = "PITCH";
    const pivot = noInfoPivot(s, "aapke competitors kaun hain");
    expect(s.state).toBe("CLOSE");
    expect(s.ended).toBe(false);
    expect(pivot).toMatch(/jaankari nahi/);
    const exit = noInfoExit(s, "aur office kahan hai");
    expect(s.ended).toBe(true);
    expect(exit).toMatch(/jaankari/);
    const result = await scoreCall(s);
    expect(result.disposition).toBe("Interested-Follow-up");
  });
});

import { parseDayTime } from "../../src/booking/slotTime.js";

describe("half an answer about the time", () => {
  it("reads a time with no day and a day with no time as halves", () => {
    expect(parseDayTime("3:00 Baje")).toMatchObject({ time: { hour: 15, minute: 0 } });
    expect(parseDayTime("3:00 Baje").weekday).toBeUndefined();
    expect(parseDayTime("Monday")).toEqual({ weekday: 1 });
    expect(parseDayTime("mere paas 2 sawal hain").time).toBeUndefined();
  });

  it("asks only for the day after '3 baje', then books Monday 3 when the day comes", () => {
    const s = createSession(lead);
    s.state = "PITCH";
    replyTo(s, "okay", "acknowledge");
    const ask = replyTo(s, "3:00 Baje", "accept_slot");
    expect(s.ended).toBe(false);
    expect(ask).toMatch(/3 baje/);
    expect(ask).toMatch(/kaunsa din/i);
    expect(ask).not.toMatch(/aur time/);
    replyTo(s, "Monday", "give_availability");
    expect(s.meetingSlot).toBe("Monday 3 baje");
    expect(s.ended).toBe(true);
  });

  it("asks only for the time after a bare day", () => {
    const s = createSession(lead);
    s.state = "PITCH";
    replyTo(s, "okay", "acknowledge");
    const ask = replyTo(s, "Monday", "give_availability");
    expect(ask).toMatch(/Monday/);
    expect(ask).toMatch(/Kitne baje/);
    replyTo(s, "4 baje", "give_availability");
    expect(s.meetingSlot).toBe("Monday 4 baje");
  });

  it("still lets the caller pick an offered day on its own", () => {
    const s = createSession(lead);
    s.state = "PITCH";
    replyTo(s, "okay", "acknowledge");
    replyTo(s, "aap batao", "acknowledge");
    const second = defaultMeetingSlots("hi-IN-hinglish")[1]!;
    replyTo(s, second.split(" ")[0]!, "accept_slot");
    expect(s.meetingSlot).toBe(second);
  });
});

describe("caller wants the calendar link", () => {
  it("detects it and ends with a follow-up instead of pushing more times", async () => {
    expect(detectCallerSignal("inmein se koi nahin aap mujhe calender link bhej dijiye main set kar lunga")).toBe("link");
    expect(detectCallerSignal("send me the calendar link")).toBe("link");
    expect(detectCallerSignal("Friday 5 baje")).toBeNull();
    const s = createSession(lead);
    s.state = "CLOSE";
    const line = applyCallerSignal(s, "aap mujhe calender link bhej dijiye", "link");
    expect(s.ended).toBe(true);
    expect(line).toMatch(/calendar link/i);
    const result = await scoreCall(s);
    expect(result.disposition).toBe("Interested-Follow-up");
    expect(result.next_action).toBe("send_follow_up_email");
    expect(result.call_summary).toMatch(/calendar link/i);
  });
});

import { pickOfferSlots } from "../../src/booking/offer.js";

describe("outcomes read from real call data", () => {
  it("a bare 'nahin' is Not Interested, but hanging up after engaging is not", async () => {
    const declined = createSession(lead);
    declined.state = "PITCH";
    replyTo(declined, "nahin", "not_interested");
    expect(declined.ended).toBe(true);
    expect((await scoreCall(declined)).disposition).toBe("Not Interested");

    const engaged = createSession(lead);
    for (const [say, intent] of [
      ["haan", "acknowledge"],
      ["theek hai", "acknowledge"],
      ["demo kaun dikhayega", "company_knowledge"],
    ] as const) replyTo(engaged, say, intent);
    engaged.ended = true; // the operator pressed End
    expect((await scoreCall(engaged)).disposition).toBe("Interested-Follow-up");

    const cutOff = createSession(lead);
    replyTo(cutOff, "han", "acknowledge");
    cutOff.ended = true;
    expect((await scoreCall(cutOff)).disposition).toBe("No Answer");
  });

  it("'busy' is a callback, not a refusal", async () => {
    const s = createSession(lead);
    s.state = "PITCH";
    replyTo(s, "abhi time nahi hai", "no_time");
    expect((await scoreCall(s)).disposition).toBe("Call Back Requested");
  });

  it("offers only 2-3 distinct open times, or nothing when the calendar can't be read", async () => {
    const slots = await pickOfferSlots("hi");
    if (slots === null) return; // no Cal.com keys / offline: the generated defaults are used
    expect(slots.length).toBeGreaterThanOrEqual(2);
    expect(slots.length).toBeLessThanOrEqual(3);
    expect(new Set(slots).size).toBe(slots.length);
  }, 20_000); // reads the real calendar when keys are present
});

import { detectIntent } from "../../src/conversation/intent.js";

describe("bad mic reads from real calls", () => {
  it("'ha ha' is a yes, not a laugh to chat back at", () => {
    expect(detectIntent("ha ha")).toBe("acknowledge");
    expect(detectIntent("ha")).toBe("acknowledge");
  });

  it("reads 'Mande' as Monday and 'Twitter' as Tuesday", () => {
    expect(parseDayTime("Mande 3 baje").weekday).toBe(1);
    expect(parseDayTime("Twitter 3:00 baje").weekday).toBe(2);
  });

  it("'Monday nahin, Tuesday chahiye' means Tuesday; a lone rejected day means none", () => {
    expect(parseDayTime("Mujhe Mande nahin mujhe Twitter chahie").weekday).toBe(2);
    expect(parseDayTime("Monday nahin").weekday).toBeUndefined();
  });

  it("asks the caller to repeat a scrap like 'Mujhe' instead of repeating the whole close line", () => {
    const s = createSession(lead);
    s.state = "CLOSE";
    s.closeStage = "offered";
    const line = replyTo(s, "Mujhe", "unclear");
    expect(s.didntCatch).toBe(true);
    expect(line).toMatch(/ek baar phir bolenge/i);
    expect(s.ended).toBe(false);
    expect(line).not.toMatch(/baje/);
  });

  it("still understands a real day said in the middle of a rejection", () => {
    const s = createSession(lead);
    s.state = "CLOSE";
    s.closeStage = "offered";
    const line = replyTo(s, "Mujhe Mande nahin mujhe Twitter chahie", "not_interested");
    expect(s.ended).toBe(false);
    expect(line).toMatch(/Tuesday/);
  });
});
