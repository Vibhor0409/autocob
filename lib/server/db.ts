// Postgres access. One HTTP query function for the whole server; no connection pool to manage
// on a serverless host.
import "server-only";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let client: NeonQueryFunction<false, false> | null = null;

export function sql(): NeonQueryFunction<false, false> {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    client = neon(url);
  }
  return client;
}

export const dbConfigured = (): boolean => Boolean(process.env.DATABASE_URL);
