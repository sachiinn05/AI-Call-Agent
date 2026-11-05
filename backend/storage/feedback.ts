/**
 * "This reply was bad" reports, kept in one JSON file (FEEDBACK_PATH, default data/feedback.json),
 * or in MongoDB when MONGODB_URI is set. Newest first. Text only.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";
import { FeedbackSchema, type Feedback } from "../types.js";
import { db, dbEnabled } from "./db.js";

/** A public demo must not let anyone fill the disk. */
export const MAX_FEEDBACK = 1000;

function parseRows(raw: unknown[]): Feedback[] {
  return raw
    .map((row) => FeedbackSchema.safeParse(row))
    .filter((r) => r.success)
    .map((r) => r.data);
}

export async function loadFeedback(): Promise<Feedback[]> {
  if (dbEnabled()) {
    const rows = await (await db()).collection("feedback").find({}).sort({ created_at: -1 }).toArray();
    return parseRows(rows.map(({ _id, ...row }) => row));
  }
  if (!existsSync(config.feedbackPath)) return [];
  const raw = JSON.parse(await readFile(config.feedbackPath, "utf8")) as unknown;
  return Array.isArray(raw) ? parseRows(raw) : [];
}

async function writeAll(rows: Feedback[]): Promise<void> {
  await mkdir(path.dirname(config.feedbackPath), { recursive: true });
  await writeFile(config.feedbackPath, JSON.stringify(rows, null, 2), "utf8");
}

/** Returns false when the store is full. */
export async function addFeedback(item: Feedback): Promise<boolean> {
  if (dbEnabled()) {
    const col = (await db()).collection<{ _id: string }>("feedback");
    if ((await col.estimatedDocumentCount()) >= MAX_FEEDBACK) return false;
    await col.replaceOne({ _id: item.id }, { ...item, _id: item.id }, { upsert: true });
    return true;
  }
  const rows = await loadFeedback();
  if (rows.length >= MAX_FEEDBACK) return false;
  rows.unshift(item);
  await writeAll(rows);
  return true;
}

export async function setFeedbackStatus(id: string, status: Feedback["status"]): Promise<boolean> {
  if (dbEnabled()) {
    const res = await (await db()).collection<{ _id: string }>("feedback").updateOne({ _id: id }, { $set: { status } });
    return res.matchedCount > 0;
  }
  const rows = await loadFeedback();
  const hit = rows.find((r) => r.id === id);
  if (!hit) return false;
  hit.status = status;
  await writeAll(rows);
  return true;
}

export async function deleteFeedback(id: string): Promise<boolean> {
  if (dbEnabled()) {
    return ((await (await db()).collection<{ _id: string }>("feedback").deleteOne({ _id: id })).deletedCount ?? 0) > 0;
  }
  const rows = await loadFeedback();
  const next = rows.filter((r) => r.id !== id);
  if (next.length === rows.length) return false;
  await writeAll(next);
  return true;
}
