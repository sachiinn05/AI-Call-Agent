import { createReadStream, existsSync } from "node:fs";
import { appendFile, writeFile } from "node:fs/promises";
import { parse } from "csv-parse";
import { config } from "../config.js";
import { db, dbEnabled } from "./db.js";

function normalizeNumber(raw: string): string {
  const digits = raw.replace(/[^\d+]/g, "");
  if (digits.startsWith("+")) return digits;
  if (digits.startsWith("91") && digits.length === 12) return `+${digits}`;
  if (digits.length === 10) return `+91${digits}`;
  return digits.startsWith("+") ? digits : `+${digits}`;
}

async function readNumbers(filePath: string): Promise<Set<string>> {
  const numbers = new Set<string>();
  if (!existsSync(filePath)) return numbers;

  const parser = createReadStream(filePath).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true }),
  );

  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    const value = row.contact_number || row.number || row.phone || "";
    if (value) numbers.add(normalizeNumber(value));
  }
  return numbers;
}

export async function isSuppressed(contactNumber: string): Promise<boolean> {
  const number = normalizeNumber(contactNumber);
  if (dbEnabled()) {
    return (await (await db()).collection<{ _id: string }>("dnc").countDocuments({ _id: number })) > 0;
  }
  const list = await readNumbers(config.dncPath);
  return list.has(number);
}

export async function addToDnc(contactNumber: string, reason = "requested"): Promise<void> {
  const number = normalizeNumber(contactNumber);
  if (dbEnabled()) {
    await (await db())
      .collection<{ _id: string }>("dnc")
      .updateOne({ _id: number }, { $setOnInsert: { reason, added_at: new Date() } }, { upsert: true });
    return;
  }
  if (await isSuppressed(number)) return;

  if (!existsSync(config.dncPath)) {
    await writeFile(config.dncPath, "contact_number,reason,added_at\n", "utf8");
  }
  await appendFile(
    config.dncPath,
    `${number},${reason},${new Date().toISOString()}\n`,
    "utf8",
  );
}

export { normalizeNumber };
