import { config } from "../config.js";
import { BOOKING_ASK_RE, classifyRoute, looksLikeQuestion, wantsFaq } from "./router.js";
import { detectCallerSignal, type CallerSignal } from "./signals.js";
import { isSlotFree } from "../booking/calendar.js";
import { parseSpokenSlot } from "../booking/slotTime.js";
import { classifyIntent, naturalizeReply, steerBackToScript } from "../llm/groq.js";
import { answerFromPdf, lastRetrievalScore, type RagMatch } from "../rag/answer.js";
import { isOffScript } from "./intent.js";
import { faqNoMatchLine, offTopicLine } from "../script/lines.js";
import {
  applyCallerSignal,
  backOnTrackTail,
  mentionsOfferedSlot,
  noInfoExit,
  sessionSlots,
  ownSlotFrom,
  noInfoPivot,
  offerBooking,
  recordSideReply,
  replaceLastAgentLine,
  replyTo,
} from "./stateMachine.js";
import type { ConversationRoute, Intent, Session } from "../types.js";

// "Sorry, what?" / "dobara bolo" / "what did you just say" — re-say the last
// line instead of classifying it as a new intent. A real call had the caller
// ask exactly this and get a not-interested rebuttal back.
const REPEAT_RE =
  /\b(repeat|say (that|it) again|come again|pardon|didn'?t (catch|hear|get) (that|it)|what did you (just )?say|dobara (bolo|boliye|bolna)|phir se (bolo|boliye|bolna)|(pichhla|pichla|last) (sentence|line|baat)|sunai nahi diya|kya bola|kya kaha)\b/i;

export type TurnResult = {
  agent: string;
  via: "script" | "groq" | "steer" | "faq";
  intent: Intent;
  route: ConversationRoute;
  /** Which retrieved PDF chunk answered, when one did. */
  faqId: string | null;
  ended: boolean;
};

/**
 * Caller asked a question. Answer it from the ingested PDF via RAG, without
 * moving the call off its current beat — then the flow resumes. Not covered
 * → say so and pivot to the demo. Never invent.
 */
// How many questions we can't answer (or off-script turns) before being straight about it.
// First we steer to the demo; if it keeps happening we hand over and end politely.
const NO_INFO_PIVOT_AFTER = 3;
const NO_INFO_EXIT_AFTER = 6;
// Retrieval score under this = the question has nothing to do with what we know.
const OFF_TOPIC_BELOW = 0.59;

function speakAnswer(session: Session, text: string, intent: Intent, match: RagMatch | null): TurnResult {
  session.questionsAsked.push({ question: text, faqId: match?.id ?? null, at: new Date().toISOString() });

  if (!match) {
    session.unknownCount = (session.unknownCount ?? 0) + 1;
    if (session.unknownCount >= NO_INFO_EXIT_AFTER) {
      const agent = noInfoExit(session, text);
      return { agent, via: "script", intent, route: "knowledge", faqId: null, ended: true };
    }
    if (session.unknownCount === NO_INFO_PIVOT_AFTER && session.state !== "CLOSE") {
      const agent = noInfoPivot(session, text);
      return { agent, via: "script", intent, route: "knowledge", faqId: null, ended: false };
    }
  }

  session.faqStreak = (session.faqStreak ?? 0) + 1;
  session.lastWasFaq = true;
  // Close to something in the PDF but not covered → "the founder covers it in the demo".
  // Nothing like anything in the PDF (cricket, weather) → plain "I have no information on that".
  const unrelated = !match && lastRetrievalScore() < OFF_TOPIC_BELOW;
  let answer =
    match?.answer ??
    (unrelated ? offTopicLine(session.lead, session.lead.preferred_language) : faqNoMatchLine(session.lead.preferred_language));
  // A person answers, then gets back to what they were saying. Always in the close
  // (so the booking doesn't stall); in the earlier beats from the second question on.
  if (session.state === "CLOSE" || session.faqStreak >= 2) {
    const tail = backOnTrackTail(session);
    if (tail) answer = `${answer} ${tail}`;
  }
  const agent = recordSideReply(session, text, answer, { via: match ? "faq" : "script" });
  return {
    agent,
    via: match ? "faq" : "script",
    intent,
    route: "knowledge",
    faqId: match?.id ?? null,
    ended: false,
  };
}

/** Concrete facts a natural rephrase must not lose — a booked slot, or the slots on offer. */
function factsToPreserve(session: Session): string[] {
  if (session.meetingSlot) return [session.meetingSlot];
  if (session.state === "CLOSE") {
    // "Asked" has no times in it; "confirm" names exactly one.
    if (session.closeStage === "asked") return [];
    if (session.closeStage === "confirm" && session.confirmSlot) return [session.confirmSlot];
    return sessionSlots(session);
  }
  return [];
}

/**
 * A caller who just says the founder's or company's name ("Sachin", "is Sachin", "Aarohi")
 * is asking who/what that is. Real calls showed the agent answering that with a generic
 * "got one minute?" line three times in a row.
 */
function bareNameQuestion(text: string): string | null {
  const said = text
    .trim()
    .toLowerCase()
    .replace(/[?.!,]+$/g, "")
    .replace(/^(is|who is|kaun|yah|ye|ye kaun|yah kaun|this is)\s+/, "")
    .replace(/\s+(kaun hai|kaun|hai)$/, "");
  if (!said || said.split(" ").length > 3) return null;
  if (said === config.founderName.toLowerCase()) return `Who is ${config.founderName}?`;
  const company = config.companyName.toLowerCase();
  if (said === company || said === company.split(" ")[0]) return `What is ${config.companyName}?`;
  return null;
}

export async function handleTurn(session: Session, text: string): Promise<TurnResult> {
  if (!session.lastWasFaq) session.faqStreak = 0;
  session.lastWasFaq = false;

  // Caller asked us to repeat ourselves: replay the last line, don't advance.
  const lastAgent = [...session.turns].reverse().find((t) => t.role === "agent");
  if (!session.ended && lastAgent && REPEAT_RE.test(text) && text.trim().split(/\s+/).length <= 10) {
    const again = recordSideReply(session, text, lastAgent.text, { via: "script" });
    return { agent: again, via: "script", intent: "unclear", route: "conversation", faqId: null, ended: false };
  }

  // A voicemail/IVR, an irritated caller, or a caller in a hurry changes how the
  // call goes regardless of which beat we're on — check before the normal flow.
  if (!session.ended) {
    const signal = detectCallerSignal(text);
    const spoken = signal ? applyCallerSignal(session, text, signal) : null;
    if (signal && spoken) {
      const intentFor: Record<CallerSignal, Intent> = {
        machine: "voicemail",
        annoyed: "no_time",
        hurry: "acknowledge",
        identity: "unclear",
        confused: "unclear",
        link: "send_email",
      };
      return { agent: spoken, via: "script", intent: intentFor[signal], route: "conversation", faqId: null, ended: session.ended };
    }
  }

  let intent = await classifyIntent(session, text);

  // In CLOSE, naming one of the slots we just offered IS accepting it —
  // regardless of what label the LLM picked. Overrides give_availability /
  // acknowledge / unclear for "Wednesday", "11", "the second one", etc.
  if (session.state === "CLOSE" && mentionsOfferedSlot(text, sessionSlots(session))) {
    intent = "accept_slot";
  }

  // Caller named their own day + time: check it against the real calendar before the
  // (synchronous) state machine decides whether to book it or offer fixed times.
  if (!session.ended && session.state === "CLOSE") {
    const own = ownSlotFrom(session, text);
    session.ownSlotBusy = own ? (await isSlotFree(own.startISO)) === false : false;
  }

  // A question gets tried against the ingested PDF (RAG) first, whatever
  // label the LLM gave it. A hit is spoken and the call stays on its beat.
  // No hit: an explicit company question gets the honest "don't know →
  // demo" pivot; anything else falls through to the normal flow, so a
  // "hello, are you there?" is handled as off-script, not as a lookup.
  // In the close, a question about the demo/company that isn't picking a time is a
  // knowledge question whatever label the LLM gave it ("demo kis cheez ka hai?").
  const questionInClose =
    session.state === "CLOSE" &&
    looksLikeQuestion(text) &&
    !parseSpokenSlot(text, "en") &&
    !mentionsOfferedSlot(text, sessionSlots(session)) &&
    !BOOKING_ASK_RE.test(text);
  const nameQuestion = bareNameQuestion(text);
  if (!session.ended && (wantsFaq(intent, text) || questionInClose || nameQuestion !== null)) {
    const match = await answerFromPdf(nameQuestion ?? text, session.lead, session.lead.preferred_language);
    if (match || intent === "company_knowledge") return speakAnswer(session, text, intent, match);
  } else if (
    !session.ended &&
    session.state !== "CLOSE" &&
    (intent === "company_knowledge" || intent === "unclear") &&
    text.trim().split(" ").length >= 3
  ) {
    // Speech-to-text often drops the question words, so a question-shaped test alone
    // misses real questions. Try RAG anyway, but only speak the answer when retrieval
    // is clearly on-topic — an ordinary reply to our discovery question won't clear it.
    const match = await answerFromPdf(text, session.lead, session.lead.preferred_language, 0.55);
    if (match) return speakAnswer(session, text, intent, match);
  }

  const route = classifyRoute(intent, text, session.state);

  if (route === "booking" && !session.ended && session.state !== "CLOSE" && session.state !== "WRAP_UP") {
    return {
      agent: offerBooking(session, text),
      via: "script",
      intent,
      route,
      faqId: null,
      ended: session.ended,
    };
  }

  const agent = replyTo(session, text, intent);

  if (!session.ended && !session.didntCatch) {
    // Caller went off-script (unclear / voicemail / gatekeeper): instead of
    // bluntly repeating the script question, let Groq craft one short
    // natural acknowledgment that still lands on the same question.
    if (isOffScript(intent)) {
      const natural = await steerBackToScript(session, text, agent);
      if (natural && natural !== agent) {
        replaceLastAgentLine(session, natural);
        return { agent: natural, via: "steer", intent, route, faqId: null, ended: session.ended };
      }
    } else if (!session.hurry) {
      // On-script: the facts are locked (see factsToPreserve), but let Groq
      // say the line the way a real rep would — reacting to what was just
      // said — instead of repeating the identical sentence every time the
      // call lands on the same beat. Falls back to the scripted line
      // whenever Groq is off, fails, or drops a fact it must keep exact
      // (a compliance-sensitive exit like WRAP_UP/DNC is skipped entirely,
      // since session.ended is already true by the time it's spoken).
      const natural = await naturalizeReply(session, text, agent, factsToPreserve(session));
      if (natural && natural !== agent) {
        replaceLastAgentLine(session, natural);
        return { agent: natural, via: "steer", intent, route, faqId: null, ended: session.ended };
      }
    }
  }

  return {
    agent,
    via: "script",
    intent,
    route,
    faqId: null,
    ended: session.ended,
  };
}
