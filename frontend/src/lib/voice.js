// Browser mic capture,
// speech recognition (with a MediaRecorder+Whisper fallback for Safari/
// Firefox/mobile), echo detection, and TTS playback. Kept as plain JS
// (framework-agnostic, no DOM lookups besides a <canvas> passed in) so the
// React rewrite doesn't risk this delicate audio logic.
const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

const SILENT_WAV =
  "data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=";

export const voice = {
  stream: null,
  analyser: null,
  audioCtx: null,
  recognition: null,
  speaking: false,
  ignoreUntil: 0,
  player: new Audio(),
  objectUrl: "",
  currentText: "",
  // How long to wait after a bare "haan"/"okay" before treating it as the whole answer. The
  // dashboard raises it while the agent has asked an open question ("how do you handle…?"),
  // where "haan…" is usually the start of a sentence, not the answer.
  ackWaitMs: 450,
  // Barge-in: while true, a caller talking over the agent cuts the agent off. Set per line by
  // speak() (off for fillers and the closing line).
  bargeIn: false,
  // Bumped on every speak()/stopSpeaking() so a line that was cut off can tell it is stale.
  speakId: 0,
  cancelWait: null,
};

function normalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Without headphones, the mic can pick up the agent's own TTS coming out of
 * the speaker — browser echo cancellation isn't guaranteed to fully catch
 * audio played from a plain <audio> element the way it does a real call. If
 * what was "heard" is mostly just the sentence the agent is currently
 * speaking, treat it as echo, not a genuine interruption.
 */
/** 0..1 — how much of what was "heard" is just words the agent is saying. */
export function echoRatio(heard, spoken) {
  const h = normalizeWords(heard || "");
  const s = normalizeWords(spoken || "");
  if (!h || !s) return 0;
  if (s.includes(h)) return 1;
  const heardWords = h.split(" ");
  const spokenWords = new Set(s.split(" "));
  return heardWords.filter((w) => spokenWords.has(w)).length / heardWords.length;
}

export function looksLikeEcho(heard, spoken) {
  return echoRatio(heard, spoken) >= 0.7;
}

const LOCALE = {
  "en-US": "en-US",
  "en-IN": "en-IN",
  "hi-IN-hinglish": "hi-IN",
};

export function ttsLocale(language) {
  return LOCALE[language] || "en-IN";
}

export function listenLocale(language) {
  return language === "hi-IN-hinglish" ? "en-IN" : ttsLocale(language);
}

export async function unlockAudio() {
  if (!voice.audioCtx) voice.audioCtx = new AudioContext();
  if (voice.audioCtx.state === "suspended") await voice.audioCtx.resume();
  voice.player.src = SILENT_WAV;
  voice.player.volume = 0.01;
  try {
    await voice.player.play();
  } catch {
    /* click already consumed; later play() still works on the same element */
  }
  voice.player.pause();
  voice.player.volume = 1;

  const osc = voice.audioCtx.createOscillator();
  const gain = voice.audioCtx.createGain();
  osc.type = "sine";
  osc.frequency.value = 520;
  gain.gain.value = 0.07;
  osc.connect(gain);
  gain.connect(voice.audioCtx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, voice.audioCtx.currentTime + 0.28);
  osc.stop(voice.audioCtx.currentTime + 0.3);
}

export async function openMic() {
  voice.stream = await navigator.mediaDevices.getUserMedia({
    audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  });
  if (!voice.audioCtx) voice.audioCtx = new AudioContext();
  if (voice.audioCtx.state === "suspended") await voice.audioCtx.resume();
  const source = voice.audioCtx.createMediaStreamSource(voice.stream);
  voice.analyser = voice.audioCtx.createAnalyser();
  voice.analyser.fftSize = 256;
  source.connect(voice.analyser);
}

export function closeMic() {
  voice.stream?.getTracks().forEach((t) => t.stop());
  voice.stream = null;
  voice.analyser = null;
}

export function drawWave(canvas, active) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width;
  const h = canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = active ? "#a99bff" : "#2b3042";

  if (!voice.analyser || !active) {
    for (let i = 0; i < 24; i += 1) {
      ctx.fillRect(14 + i * 12, h / 2 - 3, 5, 6);
    }
    return;
  }

  const data = new Uint8Array(voice.analyser.frequencyBinCount);
  voice.analyser.getByteFrequencyData(data);
  for (let i = 0; i < 24; i += 1) {
    const mag = data[i + 2] ?? 0;
    const bar = Math.max(6, (mag / 255) * (h - 8));
    ctx.fillRect(14 + i * 12, (h - bar) / 2, 5, bar);
  }
}

function waitForPlayer(player) {
  return new Promise((resolve, reject) => {
    const done = () => {
      player.onended = null;
      player.onerror = null;
      voice.cancelWait = null;
      resolve();
    };
    voice.cancelWait = done;
    player.onended = done;
    player.onerror = () => {
      player.onended = null;
      player.onerror = null;
      voice.cancelWait = null;
      reject(new Error("audio element failed"));
    };
  });
}

function waitForVoices() {
  const existing = speechSynthesis.getVoices();
  if (existing.length) return Promise.resolve(existing);
  return new Promise((resolve) => {
    const finish = () => resolve(speechSynthesis.getVoices());
    speechSynthesis.onvoiceschanged = finish;
    setTimeout(finish, 800);
  });
}

async function speakBrowser(text, language) {
  await waitForVoices();
  speechSynthesis.cancel();
  await new Promise((r) => setTimeout(r, 60));
  const utter = new SpeechSynthesisUtterance(text);
  utter.lang = ttsLocale(language);
  utter.volume = 1;
  const voices = speechSynthesis.getVoices();
  const prefer =
    language === "hi-IN-hinglish"
      ? ["hi-IN", "hi", "en-IN"]
      : language === "en-IN"
        ? ["en-IN", "en-GB", "en-US"]
        : ["en-US", "en"];
  const chosen = voices.find((v) => prefer.some((p) => v.lang.replace("_", "-").startsWith(p)));
  if (chosen) utter.voice = chosen;
  await new Promise((resolve, reject) => {
    utter.onend = resolve;
    // cancel() (barge-in or hang-up) is not a failure, just the end of the line.
    utter.onerror = (e) =>
      e.error === "canceled" || e.error === "interrupted" ? resolve() : reject(new Error("browser TTS failed"));
    speechSynthesis.speak(utter);
  });
}

// How long before the agent's audio ends the mic is armed. Chrome's recognizer takes a
// few hundred ms to start hearing after .start(); callers answer the instant a question
// ends, so starting it only AFTER playback finished lost their first words.
const PREARM_MS = 800;

export async function speak(text, language, opts = {}) {
  stopSpeaking();
  const id = ++voice.speakId;
  voice.bargeIn = Boolean(opts.bargeIn);
  voice.speaking = true;
  voice.ignoreUntil = Date.now() + 400;
  voice.currentText = text;
  try {
    const res = await fetch("/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, language }),
    });
    if (!res.ok) throw new Error("server TTS failed");
    const blob = await res.blob();
    if (id !== voice.speakId) return; // the caller already talked over this line
    if (voice.objectUrl) URL.revokeObjectURL(voice.objectUrl);
    voice.objectUrl = URL.createObjectURL(blob);
    voice.player.src = voice.objectUrl;
    voice.player.volume = 1;
    await voice.player.play();
    if (id !== voice.speakId) return;
    if (opts.onNearEnd) {
      let armed = false;
      const onTime = () => {
        const d = voice.player.duration;
        if (!armed && Number.isFinite(d) && d > 0 && d - voice.player.currentTime <= PREARM_MS / 1000) {
          armed = true;
          try {
            opts.onNearEnd();
          } catch {
            /* arming the mic is best-effort */
          }
        }
      };
      voice.player.addEventListener("timeupdate", onTime);
      try {
        await waitForPlayer(voice.player);
      } finally {
        voice.player.removeEventListener("timeupdate", onTime);
      }
    } else {
      await waitForPlayer(voice.player);
    }
  } catch {
    if (id !== voice.speakId) return; // pause() on a cut-off line rejects play(): not a TTS failure
    await speakBrowser(text, language);
  } finally {
    if (id === voice.speakId) {
      voice.speaking = false;
      voice.bargeIn = false;
    }
  }
}

/** Cut the agent off now. Also settles the pending speak() so the call flow carries on. */
export function stopSpeaking() {
  voice.speakId += 1;
  voice.player.pause();
  voice.player.currentTime = 0;
  speechSynthesis.cancel();
  voice.speaking = false;
  voice.bargeIn = false;
  voice.cancelWait?.();
}

// A complete one-or-two-word acknowledgment. When the interim transcript is
// exactly this, there's nothing more coming — send it now instead of waiting
// out the pause timer. This is what made "haan" / "okay" feel slow.
const SHORT_ACK_RE =
  /^(haan|han|ham|hn|haa|ha|hain|hanji|haanji|ji|hmm|ok|okay|yes|yeah|yep|yup|sure|theek|thik|theek hai|thik hai|bilkul|achha|accha)(\s+(haan|han|ha|ji|ok|okay|yes|hai|bilkul))?$/i;

function pickRecorderMimeType() {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || "";
}

function micLevel(analyser) {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  let sum = 0;
  for (const v of data) sum += v;
  return sum / data.length;
}

// Amplitude-based voice activity detection for browsers without
// SpeechRecognition (Safari, Firefox, mobile): the mic still works via
// getUserMedia, there's just no built-in live transcript. Record while the
// analyser reads "loud" (reusing the analyser openMic() already sets up),
// stop after a beat of silence, and send the whole clip to /api/stt (Groq
// Whisper) — no interim partials, but it works everywhere the real call
// still needs to run.
const VAD_LOUD = 14;
const VOICE_PRESENT = 6; // any speech-like energy on the mic at all
const VAD_SILENCE_MS = 700;
const VAD_POLL_MS = 100;
// Words of non-echo speech needed to count as an interruption (one word is too often noise).
const BARGE_IN_MIN_WORDS = 2;

function createRecorderListener({ language, onPartial, onFinal, onInterrupt, onIdle }) {
  const mimeType = pickRecorderMimeType();
  let pollHandle = 0;
  let silenceHandle = 0;
  let recorder = null;
  let chunks = [];
  let recording = false;
  let loudStreak = 0;
  let running = false;

  async function transcribe(blob) {
    if (blob.size < 900) return; // too short to be real speech — a mic blip
    try {
      const res = await fetch(`/api/stt?language=${encodeURIComponent(language)}`, {
        method: "POST",
        body: blob,
      });
      if (!res.ok) return;
      const data = await res.json();
      const text = (data.text || "").trim();
      if (text) onFinal?.(text);
    } catch {
      /* dropped utterance — caller just speaks again */
    }
  }

  function beginRecording() {
    if (!voice.stream || recording) return;
    chunks = [];
    recorder = new MediaRecorder(voice.stream, mimeType ? { mimeType } : undefined);
    recorder.ondataavailable = (e) => {
      if (e.data.size) chunks.push(e.data);
    };
    recorder.onstop = () => void transcribe(new Blob(chunks, { type: mimeType || "audio/webm" }));
    recorder.start();
    recording = true;
  }

  function endRecording() {
    if (!recording) return;
    recording = false;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    recorder = null;
  }

  function poll() {
    if (!running) return;
    if (voice.analyser) {
      const loud = micLevel(voice.analyser) > VAD_LOUD;

      if (voice.speaking) {
        // The agent is talking — only a sustained loud stretch counts as a
        // real interruption, not a click or a stray syllable.
        loudStreak = loud && voice.bargeIn ? loudStreak + 1 : 0;
        if (loudStreak === 3) {
          stopSpeaking();
          beginRecording();
          onInterrupt?.();
        }
      } else {
        loudStreak = 0;
        if (loud && !recording) beginRecording();
        if (loud) onPartial?.("…");
      }

      if (recording) {
        if (loud) window.clearTimeout(silenceHandle);
        else {
          window.clearTimeout(silenceHandle);
          silenceHandle = window.setTimeout(endRecording, VAD_SILENCE_MS);
        }
      }
    }
    pollHandle = window.setTimeout(poll, VAD_POLL_MS);
  }

  return {
    start() {
      if (running) return;
      running = true;
      poll();
    },
    stop() {
      running = false;
      window.clearTimeout(pollHandle);
      window.clearTimeout(silenceHandle);
      endRecording();
      onIdle?.();
    },
  };
}

export function createListener({ language, onPartial, onFinal, onInterrupt, onIdle }) {
  if (!SpeechRecognition) {
    // No live browser recognition (Safari, Firefox, mobile): fall back to
    // record-then-transcribe. Same start()/stop() shape as a real
    // SpeechRecognition instance, so startListening()/stopListening() below
    // and every caller need no changes at all.
    const fallback = createRecorderListener({ language, onPartial, onFinal, onInterrupt, onIdle });
    voice.recognition = fallback;
    return fallback;
  }
  const recognition = new SpeechRecognition();
  recognition.lang = listenLocale(language);
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let pauseTimer = 0;
  // Everything Chrome has heard since the last committed utterance is the
  // utterance in progress. Chrome keeps ONE growing `results` list for the whole
  // session, so the transcript is rebuilt from `baseIndex` on every event instead
  // of trusting only the newest result — a sentence that arrives as several
  // results (or several results in one event) is never truncated to its last piece.
  let baseIndex = 0;
  let latestText = "";
  let latestLen = 0;

  // The mic's own loudness, sampled while listening. Speech recognition alone can't tell
  // "the caller is still talking" from "the caller stopped", and it will happily turn room
  // noise or the agent's own echo into a bare "haan" — which used to make the agent answer
  // without having heard anyone.
  let lastLoudAt = 0;
  let lastVoiceAt = 0;
  let sampler = 0;
  function startSampler() {
    if (sampler || !voice.analyser) return;
    sampler = window.setInterval(() => {
      if (!voice.analyser) return;
      const level = micLevel(voice.analyser);
      const now = Date.now();
      if (level > VAD_LOUD) lastLoudAt = now;
      if (level > VOICE_PRESENT) lastVoiceAt = now;
    }, 80);
  }
  function stopSampler() {
    window.clearInterval(sampler);
    sampler = 0;
  }
  const callerStillTalking = () => Boolean(voice.analyser) && Date.now() - lastLoudAt < 450;

  function commit() {
    window.clearTimeout(pauseTimer);
    const full = latestText.trim();
    baseIndex = latestLen;
    latestText = "";
    if (!full) return;
    // A bare "haan"/"okay" with no sign of a voice on the mic is noise, not an answer.
    const bareAck = SHORT_ACK_RE.test(full.replace(/[.,!?]+$/, ""));
    if (bareAck && voice.analyser && sampler && Date.now() - lastVoiceAt > 2500) return;
    onFinal?.(full);
  }

  function scheduleCommit(wait) {
    window.clearTimeout(pauseTimer);
    const giveUpAt = Date.now() + 5000; // never wait forever on a noisy room
    pauseTimer = window.setTimeout(function fire() {
      // Never hand over a sentence while the agent is still talking: the words are
      // banked, and go out the moment the agent stops. (The listener is armed a
      // little before the agent finishes, so a caller who starts early isn't lost.)
      if (voice.speaking) {
        pauseTimer = window.setTimeout(fire, 200);
        return;
      }
      // …and never while the caller is still audibly speaking: wait for them to finish.
      if (callerStillTalking() && Date.now() < giveUpAt) {
        pauseTimer = window.setTimeout(fire, 250);
        return;
      }
      commit();
    }, wait);
  }

  recognition.onstart = () => startSampler();

  recognition.onresult = (event) => {
    const results = event.results;
    let text = "";
    for (let i = baseIndex; i < results.length; i += 1) text += ` ${results[i][0]?.transcript ?? ""}`;
    text = text.trim();
    if (!text) return;

    startSampler();
    if (voice.speaking) {
      // Our own voice coming back through the speaker: skip those results entirely
      // so they can't get glued onto what the caller says next. While the agent is
      // talking the bar is stricter — even partly agent words counts as echo.
      if (Date.now() < voice.ignoreUntil || echoRatio(text, voice.currentText) >= 0.4) {
        baseIndex = results.length;
        return;
      }
    }

    const words = text.split(/\s+/).length;
    latestText = text;
    latestLen = results.length;

    // Barge-in: real words (the agent's echo was filtered out above) from a mic that is
    // audibly loud mean the caller is talking over the agent. Stop the agent at once; what
    // the caller says is committed by the normal pause timer below.
    if (voice.speaking && voice.bargeIn && words >= BARGE_IN_MIN_WORDS && callerStillTalking()) {
      stopSpeaking();
      onInterrupt?.();
    }
    onPartial?.(text);

    const last = results[results.length - 1];
    // A bare "haan" / "okay" is complete the moment we hear it. A one- or two-word
    // fragment ("demo kaun…") is usually the start of a sentence, so give it longer
    // before assuming the caller is done.
    const wait = SHORT_ACK_RE.test(text.replace(/[.,!?]+$/, "")) ? voice.ackWaitMs : last.isFinal ? 1000 : words <= 2 ? 1300 : 1100;
    scheduleCommit(wait);
  };

  recognition.onend = () => {
    window.clearTimeout(pauseTimer);
    stopSampler();
    // Chrome ends sessions on its own. Anything already heard is a real utterance —
    // deliver it instead of throwing it away with the session.
    const pending = latestText.trim();
    latestText = "";
    baseIndex = 0;
    latestLen = 0;
    if (pending) {
      const deliver = () => {
        if (voice.speaking) window.setTimeout(deliver, 200);
        else onFinal?.(pending);
      };
      deliver();
    }
    onIdle?.();
  };

  voice.recognition = recognition;
  return recognition;
}

export function startListening() {
  try {
    voice.recognition?.start();
  } catch {
    /* already started */
  }
}

export function stopListening() {
  try {
    voice.recognition?.stop();
  } catch {
    /* already stopped */
  }
}
