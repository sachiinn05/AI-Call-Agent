/**
 * Entry point: starts the Express server, serves the built dashboard (web/dist) and mounts
 * the API. Each group of endpoints lives in src/routes/ — see the README's project map.
 */
import express from "express";
import path from "node:path";
import { config } from "./config.js";
import { groqEnabled } from "./llm/groq.js";
import { dashboardRouter } from "./routes/dashboard.js";
import { healthRouter } from "./routes/health.js";
import { phoneRouter } from "./routes/phone.js";
import { simulateRouter } from "./routes/simulate.js";
import { voiceRouter } from "./routes/voice.js";
import { thinkingFillers } from "./script/lines.js";
import { PreferredLanguageSchema } from "./types.js";
import { prewarmSpeech } from "./voice/tts.js";

const app = express();
app.use(express.json({ limit: "2mb" }));
app.use(express.static(path.join(config.root, "web", "dist")));

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
