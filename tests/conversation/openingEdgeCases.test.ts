import { describe, expect, it } from "vitest";
import { createSession, replyTo, startCall } from "../../backend/conversation/stateMachine.js";
import { detectCallerSignal } from "../../backend/conversation/signals.js";
import { detectIntent } from "../../backend/conversation/intent.js";
import type { Lead } from "../../backend/types.js";

// The first reply is where real clients differ most from the developer who wrote the script.
// These are the things real people say right after "Hi, this is … do you have a minute?".

const lead: Lead = {
  company_name: "QuickMeds Pharmacy",
  contact_name: "Himu Singh",
  contact_number: "+919800000009",
  contact_role: "",
  company_domain: "",
  company_description: "pharmacy with home delivery",
  industry: "pharmacy",
  need_for_bot: "",
  preferred_language: "hi-IN-hinglish",
  lead_source: "",
  priority_tier: "normal",
  gender: "male",
};

/** Greeting spoken ("Hello, is this Himu?") and the person answered "hello": the intro has been said. */
function opened() {
  const s = createSession(lead);
  startCall(s);
  replyTo(s, "hello");
  return s;
}

describe("opening: two steps, like a real call", () => {
  it("starts by only confirming the person — no company, no pitch, no founder", () => {
    const s = createSession(lead);
    const first = startCall(s);
    expect(first).toMatch(/Himu/);
    expect(first).not.toMatch(/Aarohi|demo|Sachin|bAIb/i);
  });

  it("after their 'hello' it says who is calling and asks for a minute, without naming the founder", () => {
    const s = createSession(lead);
    startCall(s);
    const intro = replyTo(s, "Hello");
    expect(s.state).toBe("OPENING");
    expect(intro).toMatch(/AI assistant/i);
    expect(intro).toMatch(/ek minute/i);
    expect(intro).not.toMatch(/Sachin/i);
  });

  it("'haan bolo' to the greeting also gets the intro, then a 'haan' moves to the question", () => {
    const s = createSession(lead);
    startCall(s);
    expect(replyTo(s, "haan bolo")).toMatch(/AI assistant/i);
    replyTo(s, "haan boliye");
    expect(s.state).toBe("CONTEXT_BRIDGE");
  });
});

describe("opening: what real people say first", () => {
  it.each(["Hello?", "hello hello", "Hi", "Namaste", "Hello ji"])("'%s' re-says the opening, short, and stays on the opening", (said) => {
    const s = opened();
    const line = replyTo(s, said);
    expect(s.state).toBe("OPENING");
    expect(s.ended).toBe(false);
    expect(line).toMatch(/ek minute/i);
    expect(line).not.toMatch(/sawaal|poochni/i); // no discovery question yet
  });

  it("ends politely after the same bare 'hello' three times (they can't hear us)", () => {
    const s = opened();
    replyTo(s, "hello?");
    replyTo(s, "hello?");
    replyTo(s, "hello?");
    replyTo(s, "hello?");
    expect(s.ended).toBe(true);
  });

  it.each(["bolo", "haan bolo", "Yes speaking", "bataiye", "go ahead"])("'%s' counts as yes, go ahead", (said) => {
    expect(detectIntent(said)).toBe("acknowledge");
    const s = opened();
    replyTo(s, said);
    expect(s.state).toBe("CONTEXT_BRIDGE");
  });

  it("a plain 'ji' is still a yes, not a greeting", () => {
    const s = opened();
    replyTo(s, "ji");
    expect(s.state).toBe("CONTEXT_BRIDGE");
  });

  it.each(["sir abhi available nahi hain", "He is not available", "wo meeting mein hain", "I'll take a message"])(
    "'%s' (a gatekeeper) ends the call without pitching",
    (said) => {
      const s = opened();
      const line = replyTo(s, said);
      expect(s.ended).toBe(true);
      expect(s.complianceFlags).toContain("gatekeeper_exit");
      expect(line).not.toMatch(/demo|AI ka/i);
    },
  );

  it.each(["kya baat hai", "kis baare mein hai", "what is this about", "kaun bol raha hai"])("'%s' is answered as 'who/why', not ignored", (said) => {
    expect(detectCallerSignal(said)).toBe("identity");
  });

  it.each(["galat number hai", "number galat hai", "yahan koi Himu nahi rehta"])("'%s' is a wrong number and ends the call", (said) => {
    const s = opened();
    replyTo(s, said);
    expect(s.ended).toBe(true);
  });

  it("'abhi time nahi hai' ends without a pitch", () => {
    const s = opened();
    const line = replyTo(s, "abhi time nahi hai");
    expect(s.ended).toBe(true);
    expect(line).not.toMatch(/demo/i);
  });
});
