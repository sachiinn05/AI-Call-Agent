import { z } from "zod";

/** Preferred language is chosen BEFORE the call. Mid-call voice switch is V2+. */
export const PreferredLanguageSchema = z.enum([
  "en-US",
  "en-IN",
  "hi-IN-hinglish",
]);
export type PreferredLanguage = z.infer<typeof PreferredLanguageSchema>;

/** Doc 9 input schema — what the bot needs before it dials. */
export const LeadSchema = z.object({
  company_name: z.string().min(1),
  contact_name: z.string().min(1),
  contact_number: z.string().min(1),
  contact_role: z.string().default(""),
  company_domain: z.string().default(""),
  company_description: z.string().min(1),
  industry: z.string().min(1),
  need_for_bot: z.string().default(""),
  preferred_language: PreferredLanguageSchema.default("en-IN"),
  lead_source: z.string().default(""),
  priority_tier: z.enum(["human", "high", "normal"]).default("normal"),
  // Only affects Hindi grammatical agreement when the script addresses the
  // caller directly ("rahe" vs "rahi"). Defaults to the script's existing
  // wording so a lead row without this column behaves exactly as before.
  gender: z.enum(["male", "female"]).default("male"),
  // Where the calendar confirmation + reminder go. Optional: without it the
  // meeting is recorded but no real calendar event is created.
  email: z.string().optional(),
  // True when the dashboard put a typed contact on a saved company: contact_number then
  // belongs to the company template, so it must never be added to the do-not-call list.
  custom_contact: z.boolean().optional(),
});
export type Lead = z.infer<typeof LeadSchema>;

export const DispositionSchema = z.enum([
  "Meeting Booked",
  "Interested-Follow-up",
  "Not Interested",
  "Wrong Number",
  "Voicemail",
  "Gatekeeper-Blocked",
  "No Answer",
  "Call Back Requested",
  "Do-Not-Call Requested",
]);
export type Disposition = z.infer<typeof DispositionSchema>;

export const NextActionSchema = z.enum([
  "nothing",
  "send_follow_up_email",
  "retry_call",
  "mark_dead",
  "human_callback",
]);
export type NextAction = z.infer<typeof NextActionSchema>;

/** A question the caller asked mid-call, and which script FAQ entry (if any) answered it. */
export const QuestionAskedSchema = z.object({
  question: z.string(),
  faqId: z.string().nullable(),
  at: z.string(),
});
export type QuestionAsked = z.infer<typeof QuestionAskedSchema>;

/** Doc 9 output schema — identical shape to collections dispo, different vocabulary. */
export const CallResultSchema = z.object({
  call_id: z.string(),
  timestamp: z.string(),
  duration: z.number().int().nonnegative(),
  connected: z.boolean(),
  full_transcript: z.string(),
  call_summary: z.string(),
  disposition: DispositionSchema,
  lead_score: z.number().min(1).max(5),
  objections_raised: z.array(z.string()),
  key_quotes: z.array(z.string()),
  meeting_details: z
    .object({
      date: z.string(),
      time: z.string(),
      with: z.string(),
      calendly_url: z.string().optional(),
      booking: z
        .object({
          via: z.enum(["cal.com", "logged"]),
          start: z.string().optional(),
          uid: z.string().optional(),
          emailedTo: z.string().optional(),
          note: z.string().optional(),
        })
        .optional(),
    })
    .nullable(),
  company_details_confirmed: z.array(z.string()),
  compliance_flags: z.array(z.string()),
  next_action: NextActionSchema,
  lead: LeadSchema.optional(),
  questions_asked: z.array(QuestionAskedSchema).optional(),
  // Set when the call ended with an email to send (e.g. the caller asked for the calendar link).
  follow_up_email: z
    .object({ sent: z.boolean(), to: z.string(), note: z.string().optional() })
    .optional(),
});
export type CallResult = z.infer<typeof CallResultSchema>;

export const CallStateSchema = z.enum([
  "OPENING",
  "CONTEXT_BRIDGE",
  "PITCH",
  "OBJECTION_HANDLING",
  "CLOSE",
  "WRAP_UP",
  "FALLBACK",
  "ENDED",
]);
export type CallState = z.infer<typeof CallStateSchema>;

export const IntentSchema = z.enum([
  "acknowledge",
  "interested",
  "not_interested",
  "already_use_competitor",
  "send_email",
  "how_much",
  "is_this_ai",
  "no_time",
  "who_gave_number",
  "call_later",
  "not_decision_maker",
  "need_to_think",
  "bad_past_experience",
  "hostile",
  "wrong_person",
  "voicemail",
  "gatekeeper",
  "accept_slot",
  "decline_slots",
  "give_availability",
  "dnc",
  "company_knowledge",
  "booking_request",
  "unclear",
]);
export type Intent = z.infer<typeof IntentSchema>;

export type TranscriptTurn = {
  role: "agent" | "prospect";
  text: string;
  state: CallState;
  at: string;
  via?: "script" | "groq" | "steer" | "faq";
};

export type Session = {
  callId: string;
  lead: Lead;
  state: CallState;
  turns: TranscriptTurn[];
  objectionsRaised: string[];
  meetingSlot: string | null;
  complianceFlags: string[];
  startedAt: number;
  ended: boolean;
  silenceNudges: number;
  /** Caller asked for it short — skip the long build-up and don't pad replies. */
  hurry?: boolean;
  /** CLOSE: "asked" = we asked for THEIR time, "offered" = we offered fixed times, "confirm" = one time awaiting a yes. */
  closeStage?: "asked" | "offered" | "confirm";
  /** The single slot we're asking "shall I lock it?" about (closeStage "confirm"). */
  confirmSlot?: string;
  /** CLOSE turns that moved nothing forward — three and we hand off instead of looping. */
  closeMisses?: number;
  /** Set by handleTurn after a calendar check: the caller's named time is already taken. */
  ownSlotBusy?: boolean;
  /** Half an answer to "which day and time?" — remembered until the other half arrives. */
  /** The 2-3 demo times this call offers — open on the calendar when the call started. */
  offerSlots?: string[];
  /** The last reply was "sorry, say that again" — leave it as is (no rephrasing). */
  didntCatch?: boolean;
  pendingDay?: number;
  pendingTime?: { hour: number; minute: number };
  /** Questions we couldn't answer (not in the PDF/script) plus off-script turns — drives the "I don't have info" wind-down. */
  unknownCount?: number;
  /** Consecutive turns answered from the knowledge base. */
  faqStreak?: number;
  lastWasFaq?: boolean;
  questionsAsked: QuestionAsked[];
};

export type ConversationRoute = "knowledge" | "booking" | "conversation";
