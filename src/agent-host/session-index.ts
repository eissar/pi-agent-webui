import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { getSessionContentSnapshot } from "./session-content-cache.ts";
import type { SessionInfo } from "../shared/types";
import { buildSessionInfoFromManager } from "./session-reader";

interface Fingerprint {
  size: number;
  mtimeMs: number;
  ctimeMs: number;
  ino: number;
}

interface IndexRecord {
  filePath: string;
  fingerprint: Fingerprint;
  info: SessionInfo | null;
  parentPath?: string;
  valid: boolean;
}

export interface SessionIndexMetrics {
  filesDiscovered: number;
  filesParsed: number;
  filesReused: number;
  invalidFiles: number;
  totalMs: number;
}

function fingerprint(filePath: string): Fingerprint {
  const stat = statSync(filePath);
  return { size: stat.size, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs, ino: stat.ino };
}

function sameFingerprint(left: Fingerprint, right: Fingerprint): boolean {
  return (
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.ctimeMs === right.ctimeMs &&
    left.ino === right.ino
  );
}

function discoverSessionFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  const directories = [root];
  while (directories.length > 0) {
    const directory = directories.pop()!;
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const candidate = path.join(directory, entry.name);
      // Subagent sessions live under sessions/subagent/<token>/<...>.jsonl;
      // they are internal child sessions and must not appear in the session list.
      if (entry.isDirectory()) {
        if (directory === root && entry.name === "subagent") continue;
        directories.push(candidate);
      } else if (entry.isFile() && entry.name.endsWith(".jsonl")) files.push(candidate);
    }
  }
  return files;
}

export class SessionIndex {
  private readonly byPath = new Map<string, IndexRecord>();
  private readonly pathById = new Map<string, string>();
  private refreshPromise: Promise<void> | null = null;
  private initialized = false;
  private metrics: SessionIndexMetrics = {
    filesDiscovered: 0,
    filesParsed: 0,
    filesReused: 0,
    invalidFiles: 0,
    totalMs: 0,
  };

  private sessionsRoot(): string {
    return path.resolve(process.env.PI_CODING_AGENT_SESSION_DIR || path.join(getAgentDir(), "sessions"));
  }

  private rebuildDerivedState(): void {
    this.pathById.clear();
    const idByPath = new Map<string, string>();
    for (const record of this.byPath.values()) {
      if (record.info) {
        this.pathById.set(record.info.id, record.filePath);
        idByPath.set(record.filePath, record.info.id);
      }
    }
    for (const record of this.byPath.values()) {
      if (!record.info) continue;
      const parentSessionId = record.parentPath ? idByPath.get(record.parentPath) : undefined;
      record.info = {
        ...record.info,
        ...(parentSessionId ? { parentSessionId } : { parentSessionId: undefined }),
      };
    }
  }

  private async parsePath(
    filePath: string,
    currentFingerprint: Fingerprint,
    resolveProjectInfo: boolean,
  ): Promise<IndexRecord> {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const before = attempt === 0 ? currentFingerprint : fingerprint(filePath);
      try {
        const { manager, entries } = getSessionContentSnapshot(filePath);
        const header = manager.getHeader();
        const info = await buildSessionInfoFromManager(filePath, manager, entries, { resolveProjectInfo });
        const after = fingerprint(filePath);
        if (!sameFingerprint(before, after)) {
          if (attempt === 0) continue;
          throw new Error("session changed during index parse");
        }
        return {
          filePath,
          fingerprint: after,
          info,
          parentPath: header?.parentSession,
          valid: Boolean(info),
        };
      } catch {
        if (attempt === 0) {
          try {
            const after = fingerprint(filePath);
            if (!sameFingerprint(before, after)) continue;
          } catch {
            // File disappeared; the invalid record is removed on the next discovery pass.
          }
        }
        return { filePath, fingerprint: before, info: null, valid: false };
      }
    }
    return { filePath, fingerprint: currentFingerprint, info: null, valid: false };
  }

  initialize(): Promise<void> {
    return this.refreshAll();
  }

  refreshAll(): Promise<void> {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const startedAt = performance.now();
      const files = discoverSessionFiles(this.sessionsRoot());
      const discovered = new Set(files);
      let filesParsed = 0;
      let filesReused = 0;
      let invalidFiles = 0;

      for (const existingPath of [...this.byPath.keys()]) {
        if (!discovered.has(existingPath)) this.byPath.delete(existingPath);
      }
      
      const CHUNK_SIZE = 64;
      for (let i = 0; i < files.length; i += CHUNK_SIZE) {
        const chunk = files.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (filePath) => {
            let currentFingerprint: Fingerprint;
            try {
              currentFingerprint = fingerprint(filePath);
            } catch {
              return;
            }
            const existing = this.byPath.get(filePath);
            if (existing && sameFingerprint(existing.fingerprint, currentFingerprint)) {
              filesReused += 1;
              if (!existing.valid) invalidFiles += 1;
              return;
            }
            const record = await this.parsePath(filePath, currentFingerprint, false);
            this.byPath.set(filePath, record);
            filesParsed += 1;
            if (!record.valid) invalidFiles += 1;
          }),
        );
      }

      this.rebuildDerivedState();
      this.initialized = true;
      this.metrics = {
        filesDiscovered: files.length,
        filesParsed,
        filesReused,
        invalidFiles,
        totalMs: Math.round((performance.now() - startedAt) * 10) / 10,
      };
    })().finally(() => {
      this.refreshPromise = null;
    });
    return this.refreshPromise;
  }

  async resolvePath(sessionId: string): Promise<string | null> {
    if (!this.initialized) await this.initialize();
    const resolved = this.pathById.get(sessionId);
    if (resolved && existsSync(resolved)) return resolved;
    await this.refreshAll();
    return this.pathById.get(sessionId) ?? null;
  }

  async refreshPath(filePath: string): Promise<SessionInfo | null> {
    const resolved = path.resolve(filePath);
    const root = this.sessionsRoot();
    if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) return null;
    if (!resolved.endsWith(".jsonl") || !existsSync(resolved)) {
      this.removePath(resolved);
      return null;
    }
    let currentFingerprint: Fingerprint;
    try {
      currentFingerprint = fingerprint(resolved);
    } catch {
      this.removePath(resolved);
      return null;
    }
    const existing = this.byPath.get(resolved);
    if (existing && sameFingerprint(existing.fingerprint, currentFingerprint)) return existing.info;
    const startedAt = performance.now();
    const record = await this.parsePath(resolved, currentFingerprint, true);
    this.byPath.set(resolved, record);
    this.rebuildDerivedState();
    this.initialized = true;
    this.metrics = {
      filesDiscovered: 1,
      filesParsed: 1,
      filesReused: 0,
      invalidFiles: record.valid ? 0 : 1,
      totalMs: Math.round((performance.now() - startedAt) * 10) / 10,
    };
    return record.info;
  }

  removePath(filePath: string): SessionInfo | null {
    const existing = this.byPath.get(path.resolve(filePath));
    this.byPath.delete(path.resolve(filePath));
    this.rebuildDerivedState();
    return existing?.info ?? null;
  }

  getByPath(filePath: string): SessionInfo | null {
    return this.byPath.get(path.resolve(filePath))?.info ?? null;
  }

  async getAll(): Promise<SessionInfo[]> {
    if (!this.initialized) await this.initialize();
    return [...this.byPath.values()]
      .flatMap((record) => (record.info ? [record.info] : []))
      .sort((left, right) => Date.parse(right.modified) - Date.parse(left.modified));
  }

  getMetrics(): SessionIndexMetrics {
    return { ...this.metrics };
  }
}

export const sessionIndex = new SessionIndex();
