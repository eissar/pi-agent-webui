import { existsSync } from "node:fs";
import type { ApiHandler } from "../../contract/rpc";
import { RpcError } from "../../contract/types";
import { listWorktrees, resolveProject } from "../../shared/worktree";
import { allowFileRoot, getAllowedFileRoots, isFilePathAllowed } from "../file-access";

type WorktreeHandlers = {
  list: NonNullable<ApiHandler["worktrees.list"]>;
};

export function createWorktreeHandlers() {
  return {
    list: async (params) => {
      const { projectRoot } = params as { projectRoot: string };
      const allowed = await getAllowedFileRoots();
      if (!isFilePathAllowed(projectRoot, allowed)) {
        throw new RpcError({ code: "FORBIDDEN", message: "Access denied" });
      }
      const project = await resolveProject(projectRoot);
      let worktrees: Awaited<ReturnType<typeof listWorktrees>> = [];
      let isGit = true;
      try {
        worktrees = await listWorktrees(existsSync(projectRoot) ? projectRoot : project.projectRoot);
      } catch {
        isGit = false;
      }
      for (const w of worktrees) allowFileRoot(w.path);
      return {
        worktrees,
        projectRoot: project.projectRoot,
        isGit,
        isTopLevel: project.isTopLevel,
      };
    },
  } satisfies WorktreeHandlers;
}
