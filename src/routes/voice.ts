/** Voice endpoints the browser uses: the available agents, speech out (TTS), speech in (STT fallback), backchannels. */
import express, { Router } from "express";
import { thinkingFillers } from "../script/lines.js";
import { PreferredLanguageSchema } from "../types.js";
import { agentsWithVoice } from "../voice/agents.js";
import { describeRouting, routeVoice } from "../voice/routing.js";
import { transcribeAudio } from "../voice/stt.js";
import { synthesizeSpeech } from "../voice/tts.js";

export const voiceRouter = Router();

/** The 3 callable personas — pick one, then only its matching leads show up. */
voiceRouter.get("/api/agents", (_req, res) => {
  res.json(agentsWithVoice());
});

voiceRouter.get("/api/routing", (_req, res) => {
  res.json({
    "en-US": routeVoice("en-US"),
    "en-IN": routeVoice("en-IN"),
    "hi-IN-hinglish": routeVoice("hi-IN-hinglish"),
    note: describeRouting(),
  });
});

/** Backchannels the browser plays instantly while the real reply is generated. */
voiceRouter.get("/api/fillers", (req, res) => {
  const language = PreferredLanguageSchema.catch("en-IN").parse(req.query.language);
  res.json({ language, fillers: thinkingFillers(language) });
});

voiceRouter.post("/api/tts", async (req, res) => {
  const text = String(req.body?.text ?? "");
  const language = String(req.body?.language ?? "en-IN");
  try {
    const audio = await synthesizeSpeech(text, language);
    res.setHeader("Content-Type", audio.type);
    res.setHeader("Cache-Control", "no-store");
    res.send(audio.buffer);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "TTS failed",
    });
  }
});

// STT fallback for browsers without window.SpeechRecognition (Safari, Firefox, mobile) —
// web/src/lib/voice.js records with MediaRecorder and posts the raw clip here instead.
// Scoped express.raw() so the global JSON body parser is untouched for every other route.
voiceRouter.post("/api/stt", express.raw({ type: () => true, limit: "10mb" }), async (req, res) => {
  const language = String(req.query.language ?? "en-IN");
  const buffer = req.body;
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    res.status(400).json({ error: "No audio received" });
    return;
  }
  try {
    const text = await transcribeAudio(buffer, req.headers["content-type"] || "audio/webm", language);
    res.json({ text });
  } catch (error) {
    res.status(500).json({ error: error instanceof Error ? error.message : "Transcription failed" });
  }
});
