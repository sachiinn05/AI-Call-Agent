import { config } from "../config.js";
import { resolveSlotStart } from "./slotTime.js";

export type BookingOutcome = {
  /** "cal.com" = a real calendar event exists; "logged" = only recorded locally. */
  via: "cal.com" | "logged";
  /** ISO start time we asked for, when the spoken slot could be resolved. */
  start?: string;
  /** Cal.com booking uid / id, for cancel + reschedule links. */
  uid?: string;
  /** Email Cal.com sent the confirmation (and will send the reminder) to. */
  emailedTo?: string;
  /** Why a real booking didn't happen — shown on the dashboard, never spoken. */
  note?: string;
};

/**
 * Create a real Cal.com booking for the slot the caller agreed to on the call.
 * Cal.com emails the attendee a confirmation + calendar invite and sends its
 * own reminder before the meeting, so no separate mailer is needed.
 * Never throws — a failed booking must not lose the call record.
 */
export async function bookSlot(
  slotLabel: string,
  attendee: { name: string; email?: string; timeZone?: string },
): Promise<BookingOutcome> {
  const start = resolveSlotStart(slotLabel) ?? undefined;
  // The demo leads carry placeholder .example addresses that Cal.com rejects ("cannot
  // receive mail"). Say so plainly instead of spending an API call on a guaranteed failure.
  if (/\.example$/i.test(attendee.email ?? "")) {
    return { via: "logged", start, note: "Demo lead email — put your own address in the invite box to get a real calendar invite" };
  }
  if (!config.calApiKey || !config.calEventTypeId) {
    return { via: "logged", start, note: "Cal.com keys not set" };
  }
  if (!start) return { via: "logged", note: `Couldn't read a date/time from "${slotLabel}"` };
  if (!attendee.email) return { via: "logged", start, note: "No attendee email on the lead" };

  try {
    const res = await fetch("https://api.cal.com/v2/bookings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${config.calApiKey}`,
        "cal-api-version": "2024-08-13",
      },
      body: JSON.stringify({
        start,
        eventTypeId: Number(config.calEventTypeId),
        attendee: {
          name: attendee.name,
          email: attendee.email,
          timeZone: attendee.timeZone ?? "Asia/Kolkata",
        },
        metadata: { source: "lipi-voice-agent" },
      }),
    });
    const body = (await res.json().catch(() => ({}))) as {
      status?: string;
      data?: { uid?: string; id?: number | string };
      error?: { message?: string } | string;
    };
    if (!res.ok || body.status === "error") {
      const detail = typeof body.error === "string" ? body.error : body.error?.message;
      return { via: "logged", start, note: `Cal.com ${res.status}: ${detail ?? "booking rejected"}` };
    }
    return {
      via: "cal.com",
      start,
      uid: String(body.data?.uid ?? body.data?.id ?? ""),
      emailedTo: attendee.email,
    };
  } catch (error) {
    return { via: "logged", start, note: error instanceof Error ? error.message : "Cal.com unreachable" };
  }
}

/**
 * Is this exact start time open on the Cal.com event type right now?
 * true/false when Cal.com answers, null when it can't be checked (no keys,
 * network error) — callers treat null as "go ahead" and let the booking itself decide.
 */
export async function isSlotFree(startISO: string): Promise<boolean | null> {
  if (!config.calApiKey || !config.calEventTypeId) return null;
  const startMs = Date.parse(startISO);
  if (Number.isNaN(startMs)) return null;
  const day = new Date(startMs).toISOString().slice(0, 10);
  const nextDay = new Date(startMs + 36 * 3_600_000).toISOString().slice(0, 10);
  try {
    const url = new URL("https://api.cal.com/v2/slots");
    url.searchParams.set("eventTypeId", config.calEventTypeId);
    url.searchParams.set("start", day);
    url.searchParams.set("end", nextDay);
    url.searchParams.set("timeZone", "Asia/Kolkata");
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${config.calApiKey}`, "cal-api-version": "2024-09-04" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Record<string, { start: string }[]> };
    if (!body.data || typeof body.data !== "object") return null;
    return Object.values(body.data).some((slots) => slots.some((s) => Date.parse(s.start) === startMs));
  } catch {
    return null;
  }
}

/**
 * Every open start time (epoch ms) on the event type between two YYYY-MM-DD dates, or null
 * when Cal.com can't be read. One request covers the whole range.
 */
export async function freeStartsBetween(fromDay: string, toDay: string): Promise<Set<number> | null> {
  if (!config.calApiKey || !config.calEventTypeId) return null;
  try {
    const url = new URL("https://api.cal.com/v2/slots");
    url.searchParams.set("eventTypeId", config.calEventTypeId);
    url.searchParams.set("start", fromDay);
    url.searchParams.set("end", toDay);
    url.searchParams.set("timeZone", "Asia/Kolkata");
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${config.calApiKey}`, "cal-api-version": "2024-09-04" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: Record<string, { start: string }[]> };
    if (!body.data || typeof body.data !== "object") return null;
    const out = new Set<number>();
    for (const slots of Object.values(body.data)) for (const s of slots) out.add(Date.parse(s.start));
    return out;
  } catch {
    return null;
  }
}
