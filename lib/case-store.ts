// Where cases and files live. The demo keeps them in the browser; a signed-in workspace keeps
// them on the server, scoped to that workspace.
import type { AccidentCase, CaseDocument } from "./types";
import { getFile as getLocalFile, loadCases, putFile as putLocalFile, resetCases, saveCases } from "./store.ts";

export interface SaveResult {
  /** Set when a teammate saved first: the server's copy, which replaces the local one. */
  conflict?: AccidentCase;
}

export interface CaseStore {
  mode: "demo" | "live";
  load(): Promise<AccidentCase[]>;
  create(c: AccidentCase): Promise<void>;
  save(c: AccidentCase): Promise<SaveResult>;
  remove(id: string): Promise<void>;
  putFile(caseId: string, docId: string, file: File): Promise<void>;
  getFile(doc: CaseDocument): Promise<Uint8Array | null>;
  /** Adds the fictional practice cases and returns the full list. */
  addSamples(): Promise<AccidentCase[]>;
}

async function fromSample(doc: CaseDocument): Promise<Uint8Array | null> {
  if (!doc.sampleUrl) return null;
  const res = await fetch(doc.sampleUrl);
  return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
}

export function demoStore(): CaseStore {
  let all: AccidentCase[] = [];
  const persist = () => saveCases(all);
  return {
    mode: "demo",
    async load() {
      all = loadCases();
      return all;
    },
    async create(c) {
      all = [...all, c];
      persist();
    },
    async save(c) {
      all = all.map((x) => (x.id === c.id ? c : x));
      persist();
      return {};
    },
    async remove(id) {
      all = all.filter((x) => x.id !== id);
      persist();
    },
    async putFile(_caseId, docId, file) {
      await putLocalFile(docId, new Uint8Array(await file.arrayBuffer()));
    },
    async getFile(doc) {
      return (await getLocalFile(doc.id)) ?? (await fromSample(doc));
    },
    async addSamples() {
      all = resetCases();
      return all;
    },
  };
}

export class SignedOutError extends Error {}

async function api<T>(url: string, init?: RequestInit): Promise<{ status: number; body: T }> {
  const res = await fetch(url, { cache: "no-store", ...init });
  if (res.status === 401) throw new SignedOutError("Signed out");
  const body = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, body };
}

const jsonInit = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export function liveStore(): CaseStore {
  const versions = new Map<string, number>();
  // Saves for one case run one after another, so a slow save cannot be overtaken by the next.
  const queues = new Map<string, Promise<unknown>>();
  // Files added in this session are kept here too, so a packet built straight after approving a
  // document does not have to wait for the upload to finish.
  const local = new Map<string, Uint8Array>();

  async function load(): Promise<AccidentCase[]> {
    const { body } = await api<{ cases?: Array<{ case: AccidentCase; version: number }> }>("/api/cases");
    versions.clear();
    return (body.cases ?? []).map((r) => {
      versions.set(r.case.id, r.version);
      return r.case;
    });
  }

  return {
    mode: "live",
    load,
    create(c) {
      // Queued like a save, so a change made straight after opening the case waits for the case to exist.
      const run = async () => {
        const { status, body } = await api<{ version?: number; message?: string }>("/api/cases", jsonInit("POST", { case: c }));
        if (status !== 201) throw new Error(body.message ?? "The case could not be created.");
        versions.set(c.id, body.version ?? 1);
      };
      const next = (queues.get(c.id) ?? Promise.resolve()).then(run, run);
      queues.set(c.id, next.catch(() => undefined));
      return next;
    },
    save(c) {
      const run = async (): Promise<SaveResult> => {
        const { status, body } = await api<{ version?: number; case?: AccidentCase; message?: string }>(
          `/api/cases/${encodeURIComponent(c.id)}`,
          jsonInit("PUT", { case: c, version: versions.get(c.id) ?? 1 }),
        );
        if (status === 200) {
          versions.set(c.id, body.version ?? 1);
          return {};
        }
        if (status === 409 && body.case) {
          versions.set(c.id, body.version ?? 1);
          return { conflict: body.case };
        }
        throw new Error(body.message ?? "The change could not be saved.");
      };
      const next = (queues.get(c.id) ?? Promise.resolve()).then(run, run);
      queues.set(c.id, next.catch(() => undefined));
      return next;
    },
    async remove(id) {
      const { status, body } = await api<{ message?: string }>(`/api/cases/${encodeURIComponent(id)}`, { method: "DELETE" });
      if (status !== 200) throw new Error(body.message ?? "The case could not be deleted.");
      versions.delete(id);
    },
    async putFile(caseId, docId, file) {
      local.set(docId, new Uint8Array(await file.arrayBuffer()));
      const form = new FormData();
      form.set("file", file);
      form.set("docId", docId);
      // The case row must exist with this document listed before the file is attached to it.
      await (queues.get(caseId) ?? Promise.resolve());
      const { status, body } = await api<{ message?: string }>(`/api/cases/${encodeURIComponent(caseId)}/documents`, { method: "POST", body: form });
      if (status !== 201) throw new Error(body.message ?? "The file could not be stored.");
    },
    async getFile(doc) {
      if (doc.sampleUrl) return fromSample(doc);
      const held = local.get(doc.id);
      if (held) return held;
      const res = await fetch(`/api/documents/${encodeURIComponent(doc.id)}`, { cache: "no-store" });
      return res.ok ? new Uint8Array(await res.arrayBuffer()) : null;
    },
    async addSamples() {
      const { status, body } = await api<{ message?: string }>("/api/cases/sample", { method: "POST" });
      if (status !== 200) throw new Error(body.message ?? "The practice cases could not be added.");
      return load();
    },
  };
}
