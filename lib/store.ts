// Browser-side storage for the demo workspace: cases in localStorage, uploaded files in
// IndexedDB. Both can be unavailable (private windows), so every call degrades to memory.
import type { AccidentCase } from "./types";
import { SAMPLE_CASES } from "./sample-cases.ts";

const KEY = "autocob.cases.v1";

export function loadCases(): AccidentCase[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) return parsed as AccidentCase[];
    }
  } catch {
    // fall through to the samples
  }
  return structuredClone(SAMPLE_CASES);
}

export function saveCases(cases: AccidentCase[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(cases));
  } catch {
    // storage full or blocked: the session still works from memory
  }
}

export function resetCases(): AccidentCase[] {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // nothing to clear
  }
  return structuredClone(SAMPLE_CASES);
}

const memory = new Map<string, Uint8Array>();

function db(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("autocob-files", 1);
    req.onupgradeneeded = () => req.result.createObjectStore("files");
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function putFile(id: string, bytes: Uint8Array): Promise<void> {
  memory.set(id, bytes);
  try {
    const d = await db();
    await new Promise<void>((resolve, reject) => {
      const tx = d.transaction("files", "readwrite");
      tx.objectStore("files").put(bytes, id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // kept in memory for this session only
  }
}

export async function getFile(id: string): Promise<Uint8Array | null> {
  const hit = memory.get(id);
  if (hit) return hit;
  try {
    const d = await db();
    return await new Promise((resolve, reject) => {
      const req = d.transaction("files").objectStore("files").get(id);
      req.onsuccess = () => resolve((req.result as Uint8Array | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}
