/**
 * MongoDB connection, used when MONGODB_URI is set (Atlas free tier works).
 * Without it the storage modules keep using the local files, so a fresh clone needs no database.
 */
import { MongoClient, type Db } from "mongodb";
import { config } from "../config.js";

let connecting: Promise<Db> | null = null;

export function dbEnabled(): boolean {
  return Boolean(config.mongoUri);
}

/** The database named in the URI (e.g. .../CallAgent). Only call when dbEnabled(). */
export function db(): Promise<Db> {
  connecting ??= new MongoClient(config.mongoUri).connect().then((client) => client.db());
  return connecting;
}
