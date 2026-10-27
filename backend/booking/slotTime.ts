const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const IST_OFFSET_MIN = 330;

/**
 * Turn a spoken slot label ("Tuesday at 3", "Wednesday 11 baje", "Monday 4pm")
 * into a real UTC instant, reading the clock time as India Standard Time.
 * The label has no date, so the weekday resolves to its next occurrence after
 * today. Returns null when the label has no weekday or hour to anchor on.
 */
export function resolveSlotStart(label: string, now: Date = new Date()): string | null {
  const text = label.toLowerCase();
  const weekday = WEEKDAYS.findIndex((d) => text.includes(d));
  const time = text.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)?/);
  if (weekday < 0 || !time) return null;

  let hour = Number(time[1]);
  const minute = Number(time[2] ?? 0);
  if (time[3] === "pm" && hour < 12) hour += 12;
  else if (time[3] === "am" && hour === 12) hour = 0;
  else if (!time[3] && hour >= 1 && hour <= 7) hour += 12; // "3" / "3 baje" means business-hours 3pm
  if (hour > 23 || minute > 59) return null;

  // Work on the IST calendar date, not the server's.
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  const daysAhead = ((weekday - ist.getUTCDay() + 7) % 7) || 7;
  const utc = Date.UTC(
    ist.getUTCFullYear(),
    ist.getUTCMonth(),
    ist.getUTCDate() + daysAhead,
    hour,
    minute,
  ) - IST_OFFSET_MIN * 60_000;
  return new Date(utc).toISOString();
}

const WORD_HOURS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  ek: 1, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, chhah: 6, saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12,
};

const DAY_WORDS: [RegExp, number][] = [
  [/\b(monday|somvar|somwar)\b/, 1],
  [/\b(tuesday|mangalvar|mangalwar)\b/, 2],
  [/\b(wednesday|budhvar|budhwar)\b/, 3],
  [/\b(thursday|guruvar|guruwar|brihaspativar|veervar)\b/, 4],
  [/\b(friday|shukravar|shukrawar)\b/, 5],
  [/\b(saturday|shanivar|shaniwar)\b/, 6],
  [/\b(sunday|ravivar|itvar)\b/, 0],
];

export type SpokenSlot = { label: string; startISO: string };

/** What a caller said about WHEN — either part may be missing ("3 baje" has no day, "Monday" has no time). */
export type DayTimeParts = {
  /** 0 = Sunday … 6 = Saturday. */
  weekday?: number;
  /** 24h clock, IST, inside business hours (9:00–19:00). */
  time?: { hour: number; minute: number };
};

// What speech recognition actually writes for Hinglish day names (seen in real calls).
const DAY_SLIPS: [RegExp, string][] = [
  [/\b(mande|munde|mondey|mundey|mon day)\b/g, "monday"],
  [/\b(twitter|tues day|tuesdey|chuesday)\b/g, "tuesday"],
  [/\b(wednes day|wensday|wednesdey)\b/g, "wednesday"],
  [/\b(thurs day|thursdey|thirsty)\b/g, "thursday"],
  [/\b(fry day|fried day|fridey)\b/g, "friday"],
];

const NEGATION = /^(nahin|nahi|nhi|not|nope|na)\b/;

/** The weekday the caller WANTS: "Monday nahin, Tuesday" means Tuesday; a lone rejected day means none. */
function wantedWeekday(lower: string): number | undefined {
  const hits: { day: number; end: number }[] = [];
  for (const [re, day] of DAY_WORDS) {
    const m = new RegExp(re.source, "g");
    let found: RegExpExecArray | null;
    while ((found = m.exec(lower))) hits.push({ day, end: found.index + found[0].length });
  }
  if (!hits.length) return undefined;
  hits.sort((a, b) => a.end - b.end);
  const last = hits[hits.length - 1]!;
  // "Monday nahin" — a single day that is turned down is not a request for that day.
  if (hits.length === 1 && NEGATION.test(lower.slice(last.end).trim())) return undefined;
  return last.day;
}

export function parseDayTime(text: string, now: Date = new Date()): DayTimeParts {
  let lower = text.toLowerCase();
  for (const [re, fix] of DAY_SLIPS) lower = lower.replace(re, fix);
  const parts: DayTimeParts = {};

  // Day: a weekday name, or kal / tomorrow / parso (resolved to a weekday).
  const ist = new Date(now.getTime() + IST_OFFSET_MIN * 60_000);
  let weekday = wantedWeekday(lower);
  if (weekday === undefined) {
    if (/\b(parso|parson|day after tomorrow)\b/.test(lower)) weekday = (ist.getUTCDay() + 2) % 7;
    else if (/\b(kal|tomorrow)\b/.test(lower)) weekday = (ist.getUTCDay() + 1) % 7;
  }
  if (weekday !== undefined) parts.weekday = weekday;

  // Hour: "5", "5:30", "5 baje", "5pm", or a spelled-out hour next to baje/am/pm.
  let hour: number | undefined;
  let minute = 0;
  const digits = lower.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje|o'?clock)?/);
  // A bare number ("I have 2 questions") is only a time when it carries a unit, a colon,
  // a weekday, or is nearly the whole reply ("3", "Monday 3").
  const clearlyATime = (m: RegExpMatchArray) =>
    Boolean(m[3]) || m[2] !== undefined || parts.weekday !== undefined || lower.trim().split(/\s+/).length <= 2;
  if (digits && clearlyATime(digits)) {
    hour = Number(digits[1]);
    minute = Number(digits[2] ?? 0);
  } else if (!digits) {
    const words = lower.match(new RegExp(`\\b(${Object.keys(WORD_HOURS).join("|")})\\s+(baje|o'?clock|am|pm)\\b`));
    if (words) hour = WORD_HOURS[words[1]!];
  }
  if (hour !== undefined && hour <= 23 && minute <= 59) {
    // "9pm" has no word break before "pm", so am/pm use a letter lookbehind instead of \b.
    const pm = /(?<![a-z])pm\b|\b(shaam|sham|evening|raat|night|afternoon|dopahar|dophar)\b/.test(lower);
    const am = /(?<![a-z])am\b|\b(subah|morning)\b/.test(lower);
    if (pm && hour < 12) hour += 12;
    else if (am && hour === 12) hour = 0;
    else if (!pm && !am && hour >= 1 && hour <= 7) hour += 12; // business hours: "5" means 5pm
    const minutes = hour * 60 + minute;
    if (minutes >= 9 * 60 && minutes <= 19 * 60) parts.time = { hour, minute };
  }
  return parts;
}

/** "3 baje" / "3:30 baje" (Hinglish) or "3 PM" / "11:30 AM" (English) — for spoken lines. */
export function formatClock(time: { hour: number; minute: number }, language: "en" | "hi" = "en"): string {
  const h12 = time.hour > 12 ? time.hour - 12 : time.hour;
  const clock = time.minute ? `${h12}:${String(time.minute).padStart(2, "0")}` : String(h12);
  return language === "hi" ? `${clock} baje` : `${clock} ${time.hour >= 12 ? "PM" : "AM"}`;
}

export function weekdayName(weekday: number): string {
  return WEEKDAYS[weekday]!.replace(/^./, (c) => c.toUpperCase());
}

/** A weekday + time → the slot label the rest of the call speaks and books. Null for weekends. */
export function buildSlot(
  weekday: number,
  time: { hour: number; minute: number },
  language: "en" | "hi" = "en",
  now: Date = new Date(),
): SpokenSlot | null {
  if (weekday === 0 || weekday === 6) return null;
  const h12 = time.hour > 12 ? time.hour - 12 : time.hour;
  const clock = time.minute ? `${h12}:${String(time.minute).padStart(2, "0")}` : String(h12);
  const day = weekdayName(weekday);
  const label = language === "hi" ? `${day} ${clock} baje` : `${day} at ${clock}`;
  const startISO = resolveSlotStart(label, now);
  return startISO ? { label, startISO } : null;
}

/**
 * Read a full "Friday 5 baje" / "kal shaam 5 baje" / "tomorrow at 4pm" reply into a
 * bookable slot. Needs BOTH a day and an hour; anything outside 9:00–19:00 IST (or on
 * a weekend) is rejected so the agent offers fixed times instead of booking something
 * nobody can take. The label has the same shape as the offered slots.
 */
export function parseSpokenSlot(
  text: string,
  language: "en" | "hi" = "en",
  now: Date = new Date(),
): SpokenSlot | null {
  const parts = parseDayTime(text, now);
  if (parts.weekday === undefined || !parts.time) return null;
  return buildSlot(parts.weekday, parts.time, language, now);
}
