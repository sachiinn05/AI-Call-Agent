/**
 * Leads: the people the agent can call, read from a CSV (LEADS_PATH, default
 * data/leads.csv). The first run copies data/leads.example.csv so a fresh clone works.
 */
import { createReadStream, existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse";
import { config } from "../config.js";
import { LeadSchema, type Lead } from "../types.js";
import { db, dbEnabled } from "./db.js";

async function ensureLeadsFile(): Promise<string> {
  if (existsSync(config.leadsPath)) return config.leadsPath;
  const example = path.join(config.root, "data", "leads.example.csv");
  if (existsSync(example)) {
    await mkdir(path.dirname(config.leadsPath), { recursive: true });
    const copy = await readFile(example, "utf8");
    await writeFile(config.leadsPath, copy, "utf8");
    return config.leadsPath;
  }
  throw new Error(`No leads file at ${config.leadsPath}. Copy data/leads.example.csv first.`);
}

/** With a database, leads live in the `leads` collection; the first run seeds it from the CSV. */
export async function loadLeads(): Promise<Lead[]> {
  if (!dbEnabled()) return loadLeadsFromCsv();

  const leads = (await db()).collection<{ _id: string }>("leads");
  if ((await leads.estimatedDocumentCount()) === 0) {
    const seed = (await loadLeadsFromCsv()).map((lead) => ({ ...lead, _id: lead.contact_number }));
    if (seed.length) await leads.insertMany(seed, { ordered: false }).catch(() => undefined);
  }
  const rows = await leads.find({}).sort({ company_name: 1 }).toArray();
  return rows.flatMap(({ _id, ...row }) => {
    const parsed = LeadSchema.safeParse(row);
    return parsed.success ? [parsed.data] : [];
  });
}

async function loadLeadsFromCsv(): Promise<Lead[]> {
  const file = await ensureLeadsFile();
  const leads: Lead[] = [];
  const parser = createReadStream(file).pipe(
    parse({ columns: true, skip_empty_lines: true, trim: true }),
  );

  for await (const row of parser as AsyncIterable<Record<string, string>>) {
    const parsed = LeadSchema.safeParse({
      ...row,
      priority_tier: row.priority_tier || "normal",
    });
    if (parsed.success) leads.push(parsed.data);
  }
  return leads;
}
