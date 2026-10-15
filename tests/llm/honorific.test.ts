import { describe, expect, it } from "vitest";
import { fixHonorific, honorific } from "../../src/llm/groq.js";
import type { Lead } from "../../src/types.js";

const woman = { gender: "female" } as Lead;
const man = { gender: "male" } as Lead;

describe("honorific", () => {
  it("is ma'am for a woman and sir for a man", () => {
    expect(honorific(woman)).toBe("ma'am");
    expect(honorific(man)).toBe("sir");
  });

  it("swaps a wrong 'sir' for a woman, keeping the capital", () => {
    expect(fixHonorific("Thanks, sir. Sir, ek baat poochni thi.", woman)).toBe("Thanks, ma'am. Ma'am, ek baat poochni thi.");
  });

  it("swaps ma'am / madam for a man", () => {
    expect(fixHonorific("Thanks, ma'am. Madam, ek baat.", man)).toBe("Thanks, sir. Sir, ek baat.");
  });

  it("leaves the right honorific and text without one alone", () => {
    expect(fixHonorific("Thanks, ma'am.", woman)).toBe("Thanks, ma'am.");
    expect(fixHonorific("Kya ek minute hai?", man)).toBe("Kya ek minute hai?");
  });
});
