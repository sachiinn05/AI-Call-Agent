// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// A scripted stand-in for Chrome's SpeechRecognition, so the real createListener()
// logic can be driven with the exact event shapes Chrome produces.
class FakeRecognition {
  lang = "";
  continuous = false;
  interimResults = false;
  maxAlternatives = 1;
  onresult: ((e: unknown) => void) | null = null;
  onend: (() => void) | null = null;
  started = 0;
  start() {
    this.started += 1;
  }
  stop() {
    this.onend?.();
  }
}

type Piece = { text: string; final: boolean };
function event(pieces: Piece[]) {
  const results = pieces.map((p) => Object.assign([{ transcript: p.text }], { isFinal: p.final }));
  return { results };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let voiceModule: any;
let recognition: FakeRecognition;
let heard: string[];

beforeEach(async () => {
  vi.useFakeTimers();
  (window as unknown as { SpeechRecognition: unknown }).SpeechRecognition = FakeRecognition;
  vi.resetModules();
  // @ts-expect-error - plain browser ESM, not part of the tsconfig src build
  voiceModule = await import("../../frontend/src/lib/voice.js");
  heard = [];
  recognition = voiceModule.createListener({
    language: "hi-IN-hinglish",
    onPartial: () => undefined,
    onFinal: (text: string) => heard.push(text),
    onBargeIn: () => undefined,
    onIdle: () => undefined,
  }) as unknown as FakeRecognition;
  voiceModule.voice.speaking = false;
  voiceModule.voice.ignoreUntil = 0;
  voiceModule.voice.currentText = "";
  voiceModule.voice.analyser = null;
});

/** A stand-in microphone whose loudness the test controls (0 = silence, ~40 = someone talking). */
function fakeMic(level: { value: number }) {
  voiceModule.voice.analyser = {
    frequencyBinCount: 8,
    getByteFrequencyData: (a: Uint8Array) => a.fill(level.value),
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("listener keeps the caller's WHOLE sentence", () => {
  it("joins results that arrive separately ('demo kaun' then 'dikhayega')", () => {
    recognition.onresult?.(event([{ text: "demo kaun", final: true }]));
    recognition.onresult?.(event([{ text: "demo kaun", final: true }, { text: "dikhayega", final: false }]));
    vi.advanceTimersByTime(1500);
    expect(heard).toEqual(["demo kaun dikhayega"]);
  });

  it("does not cut a two-word start off early", () => {
    recognition.onresult?.(event([{ text: "demo kaun", final: false }]));
    vi.advanceTimersByTime(1000); // the old 850ms window would already have sent "demo kaun"
    expect(heard).toEqual([]);
    recognition.onresult?.(event([{ text: "demo kaun dikhayega", final: false }]));
    vi.advanceTimersByTime(1500);
    expect(heard).toEqual(["demo kaun dikhayega"]);
  });

  it("still sends a bare 'haan' straight away", () => {
    recognition.onresult?.(event([{ text: "haan", final: false }]));
    vi.advanceTimersByTime(500);
    expect(heard).toEqual(["haan"]);
  });

  it("starts the next utterance clean (no leftovers from the last one)", () => {
    recognition.onresult?.(event([{ text: "haan", final: false }]));
    vi.advanceTimersByTime(500);
    recognition.onresult?.(event([{ text: "haan", final: true }, { text: "demo kaun dikhayega", final: false }]));
    vi.advanceTimersByTime(1500);
    expect(heard).toEqual(["haan", "demo kaun dikhayega"]);
  });
});

describe("a caller who starts talking before the agent has finished", () => {
  it("is banked while the agent speaks and delivered the moment it stops", () => {
    voiceModule.voice.speaking = true;
    voiceModule.voice.currentText = "Ek chhota demo dikhaun?";
    recognition.onresult?.(event([{ text: "demo kaun dikhayega", final: false }]));
    vi.advanceTimersByTime(3000);
    expect(heard).toEqual([]); // agent still talking: nothing sent, nothing lost
    voiceModule.voice.speaking = false;
    vi.advanceTimersByTime(400);
    expect(heard).toEqual(["demo kaun dikhayega"]);
  });

  it("ignores the agent's own voice coming back through the speaker", () => {
    voiceModule.voice.speaking = true;
    voiceModule.voice.currentText = "Ek chhota demo dikhaun?";
    recognition.onresult?.(event([{ text: "ek chhota demo dikhaun", final: true }]));
    voiceModule.voice.speaking = false;
    recognition.onresult?.(event([{ text: "ek chhota demo dikhaun", final: true }, { text: "haan", final: false }]));
    vi.advanceTimersByTime(600);
    expect(heard).toEqual(["haan"]); // only what the caller said, not the echo glued on
  });

  it("delivers what it already heard when Chrome ends the session on its own", () => {
    recognition.onresult?.(event([{ text: "demo kaun dikhayega", final: false }]));
    recognition.onend?.();
    expect(heard).toEqual(["demo kaun dikhayega"]);
  });
});

describe("the agent only answers what it actually heard", () => {
  it("ignores a bare 'haan' when the microphone heard no voice at all (noise / echo)", () => {
    fakeMic({ value: 0 });
    recognition.onresult?.(event([{ text: "haan", final: false }]));
    vi.advanceTimersByTime(3000);
    expect(heard).toEqual([]);
  });

  it("accepts a bare 'haan' when there was a real voice on the mic", () => {
    const level = { value: 40 };
    fakeMic(level);
    recognition.onresult?.(event([{ text: "haan", final: false }]));
    vi.advanceTimersByTime(150); // the mic hears them say it…
    level.value = 0; // …then they stop
    vi.advanceTimersByTime(900);
    expect(heard).toEqual(["haan"]);
  });

  it("does not answer while the caller is still audibly speaking", () => {
    const level = { value: 40 };
    fakeMic(level);
    recognition.onresult?.(event([{ text: "demo kaun dikhayega aur uska price", final: true }]));
    vi.advanceTimersByTime(2500); // a pause in the words, but the voice never stopped
    expect(heard).toEqual([]);
    level.value = 0; // now they really are done
    vi.advanceTimersByTime(1000);
    expect(heard).toEqual(["demo kaun dikhayega aur uska price"]);
  });

  it("treats even partly-agent words as echo while the agent is talking", () => {
    voiceModule.voice.speaking = true;
    voiceModule.voice.currentText = "Ek chhota demo dikhaun?";
    recognition.onresult?.(event([{ text: "chhota demo", final: false }]));
    voiceModule.voice.speaking = false;
    vi.advanceTimersByTime(3000);
    expect(heard).toEqual([]);
  });
});
