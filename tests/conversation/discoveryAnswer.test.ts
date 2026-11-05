import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Lead } from "../../backend/types.js";

// A real call: we asked "what happens when order calls come in and everyone's busy?" and the
// client answered about THEIR business. The agent used to look that answer up in the product
// knowledge base and read back something unrelated, or ask the same question again.

const rag = vi.fn(async () => ({ id: "x", answer: "A made-up product answer", score: 0.9 }));
let labelled: string = "company_knowledge";

vi.mock("../../backend/llm/groq.js", () => ({
  classifyIntent: async () => labelled,
  naturalizeReply: async (_s: unknown, _t: string, canned: string) => canned,
  steerBackToScript: async () => null,
}));
vi.mock("../../backend/rag/answer.js", () => ({
  answerFromPdf: (...args: unknown[]) => rag(...(args as [])),
  lastRetrievalScore: () => 0.9,
}));

const lead: Lead = {
  company_name: "Apna Kirana Store",
  contact_name: "Rawat",
  contact_number: "+919800000010",
  contact_role: "",
  company_domain: "",
  company_description: "grocery delivery",
  industry: "grocery",
  need_for_bot: "",
  preferred_language: "hi-IN-hinglish",
  lead_source: "",
  priority_tier: "normal",
  gender: "male",
};

async function atDiscovery() {
  const { createSession } = await import("../../backend/conversation/stateMachine.js");
  const s = createSession(lead);
  s.state = "CONTEXT_BRIDGE";
  return s;
}

beforeEach(() => {
  rag.mockClear();
  labelled = "company_knowledge";
});

describe("answering the discovery question", () => {
  it.each(["unclear", "company_knowledge"])("moves on to the pitch, with no product lookup (label: %s)", async (label) => {
    labelled = label;
    const { handleTurn } = await import("../../backend/conversation/turn.js");
    const s = await atDiscovery();
    const result = await handleTurn(
      s,
      "kya To Ham Jo order mis Ho Jaate Hain Ham unhen bad mein call kar lete hain ya to Humse call mis Ho Jaati Hai",
    );
    expect(rag).not.toHaveBeenCalled();
    expect(s.state).toBe("PITCH");
    expect(result.agent).toMatch(/demo/i);
  });

  it("still answers a real question aimed at us, from the knowledge base", async () => {
    const { handleTurn } = await import("../../backend/conversation/turn.js");
    const s = await atDiscovery();
    const result = await handleTurn(s, "aapka product kitne ka hai");
    expect(rag).toHaveBeenCalled();
    expect(result.agent).toContain("A made-up product answer");
    expect(s.state).toBe("CONTEXT_BRIDGE");
  });
});
