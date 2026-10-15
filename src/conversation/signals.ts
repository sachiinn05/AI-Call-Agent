import { detectIntent } from "./intent.js";
import type { Intent } from "../types.js";

/**
 * Cues in what the other end says that change HOW the call should go, not what
 * the script asks next:
 *  - machine: a voicemail greeting / IVR menu / telecom recording answered, so
 *    nobody is listening — leave a short line and hang up instead of pitching a tape.
 *  - annoyed: the caller is irritated ("why do you keep calling") — apologise and
 *    let them go instead of working an objection.
 *  - hurry: the caller wants it short — skip the long build-up and go to the ask.
 *
 * Deliberately keyword-based and conservative: a false "machine" hangs up on a
 * real person, so the phrases are ones a human receptionist doesn't say.
 */
export type CallerSignal = "machine" | "annoyed" | "hurry" | "identity" | "confused" | "link";

const MACHINE_RE = new RegExp(
  [
    "after the (beep|tone)",
    "at the (beep|tone)",
    "record your (message|name)",
    "voice ?mail",
    "mail ?box",
    "the (person|number|subscriber) you (have )?(called|are calling|dialed|dialled)",
    "(is|are) (currently )?(switched off|not reachable|out of (coverage|service)|not in service)",
    "(press|dial) (\\d|one|two|three|zero|star|pound|hash)\\b",
    "for [a-z ]{3,40},? press \\d",
    "your call (has been|is being) (forwarded|recorded|transferred)",
    "all (of our )?(agents|representatives|lines) are",
    "please (hold|stay on the line)",
    "kripya (sandesh|message)",
    "beep (ke baad|ki awaaz)",
    "aapne jo number (dial|dail) kiya",
    "number (abhi )?(band|switched off|busy) hai",
    "network (se )?bahar",
  ].join("|"),
  "i",
);

const ANNOYED_RE = new RegExp(
  [
    "why (are you|did you|do you) (calling|call|keep calling)",
    "kyun (call|phone) (kiya|kar rahe|kar rahi|karte|karti)",
    "baar baar",
    "bar bar",
    "phir se (call|phone)",
    "again and again",
    "keep calling",
    "stop (wasting|bothering|disturbing)",
    "waste of (my )?time",
    "time ?waste",
    "annoying",
    "irritat\\w*",
    "pareshan",
    "kitni baar",
    "already told you",
    "ek baar bola",
  ].join("|"),
  "i",
);

const HURRY_RE = new RegExp(
  [
    "in a hurry",
    "jaldi",
    "be quick",
    "make it quick",
    "quickly",
    "briefly",
    "short (mein|me)\\b",
    "get to the point",
    "to the point",
    "point pe aa",
    "seedha (baat|batao|bolo)",
    "(i )?(only )?(have|got) (just )?(a )?(minute|min|sec|second|seconds)\\b",
    "(ek|do|1|2) min(ute)? mein",
  ].join("|"),
  "i",
);

// "Send me the calendar link, I'll book it myself" — don't keep pushing times.
const LINK_RE = new RegExp(
  [
    "calen[dg]a?r.{0,14}link",
    "link.{0,24}(bhej|send|de do|dijiye|do\\b)",
    "(bhej|send|share).{0,24}link",
    "booking link",
    "invite link",
    "apna link",
  ].join("|"),
  "i",
);

// "I didn't follow that" — re-explain in plain words instead of replaying the same line.
const CONFUSED_RE = new RegExp(
  [
    "sam(a)?jh(a|e)? (nahi|nahin|nhi)",
    "samajh nahi aa",
    "(didn'?t|don'?t|do not|did not) (understand|follow|get it)",
    "not clear",
    "confus",
    "kya matlab",
    "matlab kya",
    "aap kya bol rahe",
    "kya bol rahe (ho|hain)",
    "samjha(o|iye)",
    "simple (mein|me|words|language)",
    "easy (mein|me)",
  ].join("|"),
  "i",
);

// "Who is this?" — only a short utterance counts, so "I want to know who Sachin is" is
// left to the knowledge base instead of being answered as if it were about us.
const IDENTITY_RE = /(kaun (hai|ho|bol|baat)|aap kaun|kaun bol rahe|who (is this|are you|is calling|am i speaking))/i;

// An exit with its own compliance wording wins over a tone cue.
const OWNED_BY_OTHER_EXITS = new Set<Intent>(["dnc", "hostile", "no_time", "wrong_person", "call_later"]);

export function detectCallerSignal(text: string): CallerSignal | null {
  const said = text.trim();
  if (!said) return null;
  if (OWNED_BY_OTHER_EXITS.has(detectIntent(said))) return null;

  const words = said.split(/\s+/).length;
  // A lone "voicemail" or "beep" is enough; the longer phrases need a real sentence.
  if (MACHINE_RE.test(said) && (words >= 3 || /voice ?mail|beep/i.test(said))) return "machine";
  if (ANNOYED_RE.test(said)) return "annoyed";
  if (HURRY_RE.test(said)) return "hurry";
  if (LINK_RE.test(said)) return "link";
  if (CONFUSED_RE.test(said)) return "confused";
  if (words <= 5 && IDENTITY_RE.test(said)) return "identity";
  return null;
}
