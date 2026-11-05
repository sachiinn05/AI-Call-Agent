export type PreferredLanguage = "en-US" | "en-IN" | "hi-IN-hinglish";

export type Agent = {
  id: string;
  name: string;
  tagline: string;
  flag: string;
  language: PreferredLanguage;
  voice: { provider: string };
};

export type Lead = {
  company_name: string;
  contact_name: string;
  contact_number: string;
  contact_role?: string;
  company_domain?: string;
  company_description?: string;
  industry: string;
  need_for_bot?: string;
  preferred_language: PreferredLanguage;
  lead_source?: string;
  priority_tier?: string;
  gender?: string;
  email?: string;
  custom_contact?: boolean;
};

export type BookingInfo = {
  via: "cal.com" | "logged";
  start?: string;
  uid?: string;
  emailedTo?: string;
  note?: string;
};

export type MeetingDetails = { date?: string; time?: string; booking?: BookingInfo } | null | undefined;

export type CallResult = {
  call_id: string;
  disposition: string;
  lead_score: number | string;
  call_summary?: string;
  full_transcript?: string;
  meeting_details?: MeetingDetails;
  follow_up_email?: { sent: boolean; to: string; note?: string };
  lead?: { contact_name?: string; company_name?: string };
  timestamp?: string;
  /** Every line with the beat it was said on (calls saved after analytics was added). */
  turns?: { role: "agent" | "prospect"; text: string; state: string }[];
};

export type ReplyVia = "script" | "groq" | "steer" | "faq";

export type DashboardStats = {
  calls: number;
  booked: number;
  leads: number;
  questions: number;
  unanswered: number;
  ragChunks: number;
};

export type DashboardData = {
  company: { id: string; name: string; founder: string };
  stats: DashboardStats;
  recentCalls: CallResult[];
  bookings: unknown[];
  unansweredQuestions: unknown[];
};

export type Booking = {
  callId: string;
  at: string;
  contactName: string;
  companyName: string;
  meeting: MeetingDetails;
  disposition: string;
};

export type QuestionRow = {
  question: string;
  faqId: string | null;
  at: string;
  callId: string;
  contactName: string;
};

export type ScriptView = {
  path: string;
  script: Record<string, unknown>;
  rag: { source: string; chunks: number; model: string; createdAt: string } | null;
};

export type Analytics = {
  totals: { calls: number; answered: number; reachedDemoAsk: number; booked: number; bookingRate: number; avgDurationSec: number };
  funnel: { key: string; label: string; count: number }[];
  dropOff: { stage: string; label: string; count: number }[];
  objections: { id: string; count: number }[];
  dispositions: { name: string; count: number }[];
  callsWithoutStages: number;
};

export type FeedbackIssue = "wrong_answer" | "made_up" | "awkward" | "misheard" | "too_long" | "missing_answer" | "other";

export type FeedbackItem = {
  id: string;
  call_id: string;
  turn_index: number;
  agent_text: string;
  caller_text: string;
  state: string;
  issue: FeedbackIssue;
  expected: string;
  status: "new" | "resolved";
  created_at: string;
  contact_name: string;
};

export const FEEDBACK_ISSUES: { id: FeedbackIssue; label: string }[] = [
  { id: "wrong_answer", label: "Wrong answer" },
  { id: "made_up", label: "Made up a fact" },
  { id: "awkward", label: "Awkward / unnatural" },
  { id: "misheard", label: "Misheard the caller" },
  { id: "too_long", label: "Too long" },
  { id: "missing_answer", label: "Had no answer" },
  { id: "other", label: "Other" },
];
