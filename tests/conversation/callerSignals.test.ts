import { describe, expect, it } from "vitest";
import { detectCallerSignal } from "../../backend/conversation/signals.js";
import { applyCallerSignal, createSession, replyTo } from "../../backend/conversation/stateMachine.js";
import { scoreCall } from "../../backend/scoring/scorer.js";
import type { Lead } from "../../backend/types.js";

const lead: Lead = {
  company_name: "CityCare",
  contact_name: "Ananya Sharma",
  contact_number: "+919800000001",
  contact_role: "",
  company_domain: "",
  company_description: "x",
  industry: "hospital",
  need_for_bot: "",
  preferred_language: "hi-IN-hinglish",
  lead_source: "",
  priority_tier: "normal",
  gender: "female",
};

describe("detectCallerSignal", () => {
  it("recognises voicemail greetings and IVR menus", () => {
    expect(detectCallerSignal("Please leave your message after the beep")).toBe("machine");
    expect(detectCallerSignal("The person you are calling is not available. Please record your message")).toBe("machine");
    expect(detectCallerSignal("For sales, press 1. For support, press 2")).toBe("machine");
    expect(detectCallerSignal("aapne jo number dial kiya hai woh abhi band hai")).toBe("machine");
    expect(detectCallerSignal("voicemail")).toBe("machine");
  });
  it("does not mistake a real person for a machine", () => {
    expect(detectCallerSignal("he's not available right now, can I take a message?")).toBeNull();
    expect(detectCallerSignal("haan boliye")).toBeNull();
    expect(detectCallerSignal("do you want to leave a message")).toBeNull();
  });
  it("recognises an annoyed caller", () => {
    expect(detectCallerSignal("why are you calling again and again")).toBe("annoyed");
    expect(detectCallerSignal("aap baar baar call kyun karte ho")).toBe("annoyed");
    expect(detectCallerSignal("this is a waste of my time")).toBe("annoyed");
  });
  it("recognises a caller in a hurry", () => {
    expect(detectCallerSignal("jaldi bolo kya hai")).toBe("hurry");
    expect(detectCallerSignal("I'm in a hurry, be quick")).toBe("hurry");
    expect(detectCallerSignal("get to the point")).toBe("hurry");
  });
  it("leaves compliance exits to their own handling", () => {
    expect(detectCallerSignal("stop calling me, this is a waste of time")).toBeNull();
    expect(detectCallerSignal("abhi time nahi hai, jaldi mein hoon")).toBeNull();
  });
});

describe("applyCallerSignal", () => {
  it("hangs up on a voicemail with one short line and scores it Voicemail", async () => {
    const s = createSession(lead);
    s.state = "OPENING";
    const line = applyCallerSignal(s, "Please leave your message after the beep", "machine");
    expect(s.ended).toBe(true);
    expect(line).toMatch(/dobara try/);
    expect(s.complianceFlags).toContain("voicemail_detected");
    const result = await scoreCall(s);
    expect(result.disposition).toBe("Voicemail");
    expect(result.next_action).toBe("retry_call");
  });
  it("lets an annoyed caller go gracefully", async () => {
    const s = createSession(lead);
    s.state = "PITCH";
    const line = applyCallerSignal(s, "why do you keep calling", "annoyed");
    expect(s.ended).toBe(true);
    expect(line).toMatch(/sorry/i);
    const result = await scoreCall(s);
    expect(result.disposition).toBe("Not Interested");
  });
  it("skips to the ask when the caller is in a hurry", () => {
    const s = createSession(lead);
    s.state = "CONTEXT_BRIDGE";
    const line = applyCallerSignal(s, "jaldi bolo", "hurry");
    expect(s.ended).toBe(false);
    expect(s.state).toBe("CLOSE");
    expect(s.hurry).toBe(true);
    expect(line).toMatch(/15 minute/);
  });
  it("does not rewind a call that's already at the ask", () => {
    const s = createSession(lead);
    s.state = "CLOSE";
    expect(applyCallerSignal(s, "jaldi bolo", "hurry")).toBeNull();
    expect(s.hurry).toBe(true);
    replyTo(s, "pehla wala", "accept_slot");
    expect(s.meetingSlot).not.toBeNull();
  });
});
