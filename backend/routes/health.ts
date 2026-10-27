/** GET /api/health — what's configured and which providers are active. */
import { Router } from "express";
import { config } from "../config.js";
import { groqStatus } from "../llm/groq.js";
import { getScript } from "../script/scriptFile.js";
import { describeRouting } from "../voice/routing.js";
import { ttsProviderFor } from "../voice/tts.js";

export const healthRouter = Router();

healthRouter.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    product: "Lipi.ai one-company voice agent",
    approach: "one static script file — every line and FAQ answer comes from content/call-script.yaml",
    script: { path: config.scriptPath, faqEntries: getScript().faq.length },
    company: { id: config.companyId, name: config.companyName },
    voiceRouting: describeRouting(),
    groq: groqStatus(),
    tts: {
      "en-US": ttsProviderFor("en-US"),
      "en-IN": ttsProviderFor("en-IN"),
      "hi-IN-hinglish": ttsProviderFor("hi-IN-hinglish"),
    },
  });
});
