/**
 * Turns the open "this reply was bad" reports into:
 *   - tests/conversation/feedbackRegressions.test.ts  (skipped regression tests — unskip when fixed)
 *   - Q&A lines printed to the terminal for scripts/build-knowledge-pdf.ts
 *
 *   npm run feedback:export
 */
import { writeFile } from "node:fs/promises";
import path from "node:path";
import { feedbackKnowledge, feedbackTests } from "../backend/analytics/feedbackExport.js";
import { config } from "../backend/config.js";
import { loadFeedback } from "../backend/storage/feedback.js";

const open = (await loadFeedback()).filter((f) => f.status === "new");
if (!open.length) {
  console.log("No open feedback reports. Flag a bad reply in the dashboard's Conversations tab first.");
  process.exit(0);
}

const file = path.join(config.root, "tests", "conversation", "feedbackRegressions.test.ts");
await writeFile(file, feedbackTests(open.filter((f) => f.caller_text.trim())), "utf8");
console.log(`Wrote ${open.length} report(s) as skipped tests → ${path.relative(config.root, file)}\n`);
console.log(feedbackKnowledge(open));
process.exit(0);
