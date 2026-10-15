import { config } from "../config.js";
import { buildSlot } from "./slotTime.js";
import { freeStartsBetween } from "./calendar.js";

const IST_OFFSET_MIN = 330;
// Three different hours, so "5 baje" or "Thursday" alone always points at exactly one slot.
const HOURS = [11, 15, 17];
const DAYS_AHEAD = 7; // slot labels name a weekday, so they must fall within the next week

/**
 * Pick the 3 fixed demo times to OFFER, from times that are actually open on the
 * Cal.com calendar. Without this the agent kept offering the same Wednesday/Thursday/
 * Friday slots after they'd been booked, and callers got "Cal.com 409: not available"
 * on a time the agent had just promised. Returns null when availability can't be read
 * (no keys, network down) — the caller then falls back to the plain generated times.
 */
export async function pickOfferSlots(language: "en" | "hi", now: Date = new Date()): Promise<string[] | null> {
  if (config.meetingSlots.length >= 2) return null; // slots fixed by hand in .env
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);

  const days: { weekday: number; y: number; m: number; d: number }[] = [];
  for (let ahead = 1; ahead <= DAYS_AHEAD; ahead += 1) {
    const dt = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + ahead));
    const weekday = dt.getUTCDay();
    if (weekday === 0 || weekday === 6) continue;
    days.push({ weekday, y: dt.getUTCFullYear(), m: dt.getUTCMonth(), d: dt.getUTCDate() });
  }
  if (!days.length) return null;

  const first = days[0]!;
  const last = days[days.length - 1]!;
  const iso = (x: { y: number; m: number; d: number }) => new Date(Date.UTC(x.y, x.m, x.d)).toISOString().slice(0, 10);
  const free = await freeStartsBetween(iso(first), iso(last));
  if (!free) return null;

  const out: string[] = [];
  const usedHours = new Set<number>();
  for (const day of days) {
    if (out.length >= 3) break;
    for (const hour of HOURS) {
      if (usedHours.has(hour)) continue;
      const startMs = Date.UTC(day.y, day.m, day.d, hour, 0) - IST_OFFSET_MIN * 60_000;
      if (!free.has(startMs)) continue;
      const slot = buildSlot(day.weekday, { hour, minute: 0 }, language, now);
      if (!slot) continue;
      out.push(slot.label);
      usedHours.add(hour);
      break;
    }
  }
  // Fewer than two open times to offer isn't a useful choice — let the defaults stand.
  return out.length >= 2 ? out : null;
}
