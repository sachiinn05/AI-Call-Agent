/**
 * Call history: every finished call (transcript, outcome, booking, follow-up email) is
 * kept newest-first in one JSON file (CALLS_PATH, default data/calls.json).
 * Only text is stored — there are no audio recordings.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { CallResultSchema, type CallResult } from "../types.js";
import { db, dbEnabled } from "./db.js";

function parseRows(raw: unknown[]): CallResult[] {
  return raw
    .map((row) => CallResultSchema.safeParse(row))
    .filter((r) => r.success)
    .map((r) => r.data);
}

export async function loadCalls(): Promise<CallResult[]> {
  if (dbEnabled()) {
    const rows = await (await db()).collection("calls").find({}).sort({ created_at: -1 }).toArray();
    return parseRows(rows.map(({ _id, created_at, ...call }) => call));
  }
  if (!existsSync(config.callsPath)) return [];
  const raw = JSON.parse(await readFile(config.callsPath, "utf8")) as unknown;
  return Array.isArray(raw) ? parseRows(raw) : [];
}

export async function saveCall(result: CallResult): Promise<void> {
  if (dbEnabled()) {
    await (await db())
      .collection<{ _id: string }>("calls")
      .replaceOne({ _id: result.call_id }, { ...result, created_at: new Date() }, { upsert: true });
    return;
  }
  const existing = await loadCalls();
  existing.unshift(result);
  await mkdir(path.dirname(config.callsPath), { recursive: true });
  await writeFile(config.callsPath, JSON.stringify(existing, null, 2), "utf8");
}
