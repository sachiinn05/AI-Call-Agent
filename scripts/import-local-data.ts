/**
 * One-time import of the local files (calls.json, dnc.csv) into MongoDB.
 * Safe to re-run: records are upserted by call id / phone number.
 * Usage: npm run import:local   (needs MONGODB_URI in .env)
 */
import { createReadStream, existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { parse } from "csv-parse";
import { config } from "../backend/config.js";
import { db, dbEnabled } from "../backend/storage/db.js";
import { normalizeNumber } from "../backend/storage/dnc.js";
import { CallResultSchema } from "../backend/types.js";

async function importCalls(): Promise<void> {
  if (!existsSync(config.callsPath)) return console.log("calls: no local file, skipped");
  const raw = JSON.parse(await readFile(config.callsPath, "utf8")) as unknown[];
  const calls = (await db()).collection<{ _id: string }>("calls");

  let imported = 0;
  for (const row of raw) {
    const parsed = CallResultSchema.safeParse(row);
    if (!parsed.success) continue;
    const call = parsed.data;
    const when = new Date(call.timestamp);
    await calls.replaceOne(
      { _id: call.call_id },
      { ...call, created_at: Number.isNaN(when.getTime()) ? new Date() : when },
      { upsert: true },
    );
    imported += 1;
  }
  console.log(`calls: ${imported} of ${raw.length} imported`);
}

async function importDnc(): Promise<void> {
  if (!existsSync(config.dncPath)) return console.log("dnc: no local file, skipped");
  const dnc = (await db()).collection<{ _id: string }>("dnc");
  const parser = createReadStream(config.dncPath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true }),
  );

  let imported = 0;
  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    const value = row.contact_number || row.number || row.phone || "";
    if (!value) continue;
    const added = new Date(row.added_at);
    await dnc.updateOne(
      { _id: normalizeNumber(value) },
      {
        $setOnInsert: {
          reason: row.reason || "requested",
          added_at: Number.isNaN(added.getTime()) ? new Date() : added,
        },
      },
      { upsert: true },
    );
    imported += 1;
  }
  console.log(`dnc: ${imported} imported`);
}

if (!dbEnabled()) {
  console.error("MONGODB_URI is not set in .env");
  process.exit(1);
}
await importCalls();
await importDnc();
process.exit(0);
