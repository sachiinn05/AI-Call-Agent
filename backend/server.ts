/**
 * Entry point: starts the Express server, serves the built dashboard (frontend/dist) and mounts
 * the API. Each group of endpoints lives in backend/routes/ — see the README's project map.
 */
import express from "express";
import path from "node:path";
import { config } from "./config.js";
import { groqEnabled } from "./llm/groq.js";
import { rateLimit } from "./rateLimit.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { healthRouter } from "./routes/health.js";
import { phoneRouter } from "./routes/phone.js";
import { simulateRouter } from "./routes/simulate.js";
import { voiceRouter } from "./routes/voice.js";
import { thinkingFillers } from "./script/lines.js";
import { PreferredLanguageSchema } from "./types.js";
import { prewarmSpeech } from "./voice/tts.js";

const app = express();
// Behind Render / a proxy the real visitor IP is in X-Forwarded-For; without this every
// visitor would share one IP and one rate-limit bucket.
app.set("trust proxy", 1);
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(config.root, "frontend", "dist")));

// Limits protect the free API quotas (Groq, Gemini, Sarvam) from a single visitor.
app.use("/api", rateLimit({ max: 240, windowMs: 60_000 }));
app.use(
  ["/api/tts", "/api/stt", "/api/simulate/reply", "/api/simulate/nudge"],
  rateLimit({ max: 60, windowMs: 60_000, message: "You're going a bit fast. Wait a few seconds and try again." }),
);
app.use(
  "/api/simulate/start",
  rateLimit({ max: 8, windowMs: 60 * 60_000, message: "Demo limit reached: 8 calls per hour. Please try again later." }),
);

app.use(healthRouter);
app.use(dashboardRouter);
app.use(voiceRouter);
app.use(simulateRouter);
app.use(phoneRouter);

app.listen(config.port, () => {
  console.log(`Lipi.ai V1 running at http://localhost:${config.port}`);
  console.log("Voice agent: open the dashboard, press Call, allow the mic, and talk.");
  console.log(groqEnabled() ? "Groq is on — it classifies intent; the script speaks." : "Groq is off — keyword intent + scripted lines.");
  console.log("Real dials need VAPI_API_KEY + VAPI_PHONE_NUMBER_ID.");

  // Warm the backchannels in the background so the first "right, got it…"
  // is instant instead of a cold 2s synthesis.
  const warmup = PreferredLanguageSchema.options.flatMap((language) =>
    thinkingFillers(language).map((text) => ({ text, language })),
  );
  void prewarmSpeech(warmup).then((count) => {
    console.log(`Warmed ${count}/${warmup.length} backchannel clips.`);
  });
});
