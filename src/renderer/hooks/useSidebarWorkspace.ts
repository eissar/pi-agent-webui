import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { call } from "@/lib/api-client";
import type { SessionInfo } from "@/lib/types";

interface WorktreeEntry {
  path: string;
  branch: string | null;
  isMain: boolean;
}

export interface WorktreeState {
  /** The cwd this data was fetched for — guards against stale responses */
  forCwd: string;
  projectRoot: string;
  isGit: boolean;
  /** False when forCwd is a repo subdirectory — the switcher is hidden there
   *  because subdir sessions keep their own project identity */
  isTopLevel: boolean;
  worktrees: WorktreeEntry[];
}

/**
 * Return all projects (deduped by projectRoot so worktrees collapse into their
 * main repo) sorted by most recent session activity.
 */
export function getRecentProjects(sessions: SessionInfo[]): string[] {
  const latestByRoot = new Map<string, string>(); // projectRoot -> most recent modified
  for (const s of sessions) {
    const root = s.projectRoot ?? s.cwd;
    if (!root) continue;
    const prev = latestByRoot.get(root);
    if (!prev || s.modified > prev) {
      latestByRoot.set(root, s.modified);
    }
  }
  return [...latestByRoot.entries()].sort((a, b) => b[1].localeCompare(a[1])).map(([root]) => root);
}

/** Own the effective directory and the project/worktree data used by the sidebar. */
export function useSidebarWorkspace({
  allSessions,
  selectedCwd: selectedCwdProp,
  onCwdChange,
  worktreesRefreshKey,
  projectInfoRevision,
}: {
  allSessions: SessionInfo[];
  selectedCwd?: string | null;
  onCwdChange?: (cwd: string | null, projectRoot?: string | null) => void;
  worktreesRefreshKey?: number;
  projectInfoRevision: number;
}) {
  const [selectedCwd, setSelectedCwd] = useState<string | null>(null);
  const [homeDir, setHomeDir] = useState<string>("");
  const [worktreeState, setWorktreeState] = useState<WorktreeState | null>(null);
  useEffect(() => {
    call("system.home")
      .then((d: { home?: string }) => {
        if (d.home) setHomeDir(d.home);
      })
      .catch(() => {});
  }, []);

  /** Resolve the project root for a cwd from the freshest data available */
  const projectRootFor = useCallback(
    (cwd: string | null): string | null => {
      if (!cwd) return null;
      if (worktreeState && worktreeState.forCwd === cwd) return worktreeState.projectRoot;
      // Any path in the loaded worktree list belongs to that project — covers
      // worktrees without sessions, so switching to them keeps the row mounted.
      if (worktreeState?.worktrees.some((w) => w.path === cwd)) return worktreeState.projectRoot;
      const match = allSessions.find((s) => s.cwd === cwd);
      return match?.projectRoot ?? cwd;
    },
    [worktreeState, allSessions],
  );

  // Metadata reconciliation updates grouping without treating it as directory
  // navigation or remounting the active chat.
  const lastNotifiedCwdRef = useRef<string | null>(null);
  useEffect(() => {
    if (lastNotifiedCwdRef.current === selectedCwd) return;
    lastNotifiedCwdRef.current = selectedCwd;
    onCwdChange?.(selectedCwd, projectRootFor(selectedCwd));
  }, [selectedCwd, onCwdChange, projectRootFor]);

  // Sync the worktree switcher to the selected session's cwd. Sessions of all
  // worktrees in a project share one list, so clicking a session from another
  // worktree should move the effective cwd there. Only fires when the prop
  // value changes, so a manual switcher change is not snapped back.
  const lastSyncedCwdPropRef = useRef<string | null>(null);
  useEffect(() => {
    if (selectedCwdProp && selectedCwdProp !== lastSyncedCwdPropRef.current) {
      lastSyncedCwdPropRef.current = selectedCwdProp;
      setSelectedCwd(selectedCwdProp);
    }
  }, [selectedCwdProp]);

  // Load worktrees for the current effective cwd
  useLayoutEffect(() => {
    if (!selectedCwd) {
      setWorktreeState(null);
      return;
    }
    let cancelled = false;
    void import("@/lib/api-client")
      .then(({ call }) => call("worktrees.list", { projectRoot: selectedCwd }))
      .then((d) => {
        if (cancelled) return;
        setWorktreeState({
          forCwd: selectedCwd,
          projectRoot: d.projectRoot,
          isGit: d.isGit,
          isTopLevel: d.isTopLevel,
          worktrees: d.worktrees.map((worktree) => ({
            path: worktree.path,
            branch: worktree.branch ?? null,
            isMain: worktree.isMain === true,
          })),
        });
      })
      .catch(() => {
        if (!cancelled) {
          setWorktreeState(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedCwd, worktreesRefreshKey, projectInfoRevision]);

  return {
    selectedCwd,
    setSelectedCwd,
    selectedProject: projectRootFor(selectedCwd),
    homeDir,
  };
}
