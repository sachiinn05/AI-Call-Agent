import { describe, expect, it } from "vitest";
import { resolveSlotStart } from "../../src/booking/slotTime.js";

// Monday 2026-10-05 10:00 UTC (15:30 IST)
const now = new Date("2026-10-05T10:00:00Z");

describe("resolveSlotStart", () => {
  it("reads 'Tuesday at 3' as 3pm IST the next day", () => {
    expect(resolveSlotStart("Tuesday at 3", now)).toBe("2026-10-06T09:30:00.000Z");
  });
  it("reads Hinglish 'Wednesday 11 baje' as 11am IST", () => {
    expect(resolveSlotStart("Wednesday 11 baje", now)).toBe("2026-10-07T05:30:00.000Z");
  });
  it("honours explicit am/pm", () => {
    expect(resolveSlotStart("Friday 4pm", now)).toBe("2026-10-09T10:30:00.000Z");
  });
  it("same weekday means next week, not today", () => {
    expect(resolveSlotStart("Monday at 11", now)).toBe("2026-10-12T05:30:00.000Z");
  });
  it("returns null with no weekday or hour", () => {
    expect(resolveSlotStart("sometime soon", now)).toBeNull();
  });
});

import { parseSpokenSlot } from "../../src/booking/slotTime.js";

describe("parseSpokenSlot", () => {
  it("reads 'Friday 5 baje' as Friday 5pm IST", () => {
    expect(parseSpokenSlot("Friday 5 baje", "hi", now)).toEqual({
      label: "Friday 5 baje",
      startISO: "2026-10-09T11:30:00.000Z",
    });
  });
  it("reads 'kal shaam 4 baje' as tomorrow's weekday at 4pm", () => {
    expect(parseSpokenSlot("kal shaam 4 baje", "hi", now)?.label).toBe("Tuesday 4 baje");
  });
  it("reads am/pm and spelled-out hours", () => {
    expect(parseSpokenSlot("tomorrow at 10am", "en", now)?.label).toBe("Tuesday at 10");
    expect(parseSpokenSlot("guruvar paanch baje", "hi", now)?.label).toBe("Thursday 5 baje");
  });
  it("rejects a missing day, out-of-hours time, and weekends", () => {
    expect(parseSpokenSlot("5 baje", "hi", now)).toBeNull();
    expect(parseSpokenSlot("Friday 9pm", "en", now)).toBeNull();
    expect(parseSpokenSlot("Saturday 11", "en", now)).toBeNull();
  });
});
