# Rao feature plan

The plan is grouped by concern, and each phase can ship on its own. Item numbers refer to `MISSING.md`.

Every phase follows Rao's rules (`CLAUDE.md`):

1. Contract first: `src/shared/ipc.ts`, then the server handler, then `src/client/api.ts`.
2. Transcript changes go into the fold (`src/shared/transcript.ts`) together with their tests.
3. The UI never invents facts the runtime did not report.
4. `pnpm check` passes before each commit.

---

## Phase 0: Cursor-based pull transport (foundation)

**Why first:** history paging, unread state and reliable live updates all depend on stable cursors.

1. Give each session log entry a durable per-session sequence number `seq` (1, 2, 3…, no gaps), assigned by the server when the entry is appended. Add a separate server-assigned `ts` (UTC) for display only. Restore `lastSeq` from the log tail on startup. `seq` is the only cursor; it is separate from OAR stream ids and runtime timestamps. A jump in `seq` on the client means it missed entries, so it pulls again.
2. Add `session:read(handle, afterCursor, limit)`, which reads from the JSONL store, and `session:readBefore(handle, beforeCursor, limit)` for backwards paging.
3. Shrink the live feed to change notifications: "handle X now ends at seq N". The client then pulls `after > lastSeq` for that handle.
4. Add a server epoch, and have the client detect a restart and pull again. This replaces the ignored `reset` flag and the stale-cursor gap (item 72).
5. Make the first load gap-free: read history, then subscribe from the cursor it returned.
6. Tests: restart, eviction, a slow client, and concurrent appends.

## Phase 1: Transcript rendering

**Goal:** the transcript is readable and comparable to pi-agent-webui.

1. Markdown for assistant text through a library import, rendered from the fold's text items (item 1). While a block is still streaming, show plain text and switch to Markdown once it is complete (item 2).
2. Code blocks: language label, lazy syntax highlighting skipped for very large blocks, and a copy button (item 3).
3. Copy buttons on messages (item 10) and timestamps on user messages (item 11).
4. Thinking blocks: duration taken from record timestamps, and an expanded/collapsed state kept across remounts (item 7).
5. Tool call headers: an argument preview, the duration, error styling and a "(no output)" notice (item 6).
6. Diff view for edit tools. Map each runtime's edit tool name to a shared patch renderer, and fall back to raw output (item 4).
7. Fold the intermediate tool calls and messages in a turn behind "N tool calls" (item 5).
8. A per-message footer with model and usage, but only when the runtime reports them (item 9).
9. Inline phase and retry indicators, built from status and notice events that already exist (item 12).
10. Scroll-follow that releases on user input, plus a "Jump to latest" button (item 13).
11. History windowing: show the last N turns and load earlier ones with `session:readBefore` from Phase 0 (item 15).
12. Optional: a minimap (item 14).

## Phase 2: Composer

**Goal:** writing and sending input reaches parity, without image attachments.

1. `@file` mentions (item 23):
   - Add a server file index scoped to the project cwd, as a new `files:search(handle, query)` channel. Use `fd` when available, with a directory-walk fallback, an ignore list and a timeout.
   - Show a fuzzy picker in the composer, mixing `@note` with the file results.
   - Insert the file reference as a path relative to the cwd.
   - Show a notice when search is degraded (for example, `fd` is missing).
2. Text drafts per project in localStorage, restored when a send fails (item 20). This is small, and can be dropped if you prefer.
3. Steer and queue:
   - Let the user choose steer or queue while a turn is running (item 25).
   - Show a visible queue panel with withdraw, using OAR `withdraw(inputId)`, and "recall" to put queued text back into the box (item 24).
4. An effort picker based on the model's `effortLevels`. Apply it by reopening the session, like the existing model switch (item 26).
5. A model picker in the Create Project dialog, wiring the existing `OpenSessionRequest.model` (item 30).
6. A slash palette for built-ins: `/name`, `/copy`, and `/compact` only if OAR exposes compaction (items 21, 22, 28).
7. Optional: a completion sound toggle (item 29).

## Phase 3: Projects and navigation

**Goal:** finish the project lifecycle and wayfinding.

1. A "Stop runtime" button wired to the existing `session:dispose` (item 43).
2. Validate the cwd on the server at creation, with a recent-folders list built from existing projects (item 40).
3. Let a project's cwd change after creation (item 44).
4. Show the conversation title, and let the user rename it (item 34).
5. An unread dot for background runs that have finished. With Phase 0 this can be "last seen cursor < head cursor" (item 36).
6. Deep link `?project=<id>` (item 37).
7. A project info section in the side panel: id, runtime session id, token breakdown, context usage and copy buttons (item 42).
8. Search over transcript content. This is a server-side search of the JSONL logs (item 39).
9. A git worktree or branch badge on projects (item 41).
10. Optional: auto-title through a cheap runtime call. This needs an OAR-agnostic approach (item 35).

## Phase 4: App shell and settings

**Goal:** basic settings and resilience. No light theme and no mobile layout.

1. A settings screen with General and About sections (items 62, 66).
2. Chat text size, conversation width and reply width, persisted per browser (item 64).
3. Persisted UI preferences, such as the note panel and sidebar state (item 67), and a collapsible sidebar (item 69).
4. A toast shelf with error, warning, success and info tones (item 70).
5. An error boundary, and a connect/retry screen tied to the Phase 0 epoch (item 71).

## Phase 5: Runtime interaction

**Goal:** expose OAR capabilities that Rao does not use yet.

1. Answer `app_request`. Render the request and send the user's answer back (the agnostic part of item 45).
2. A per-project `appendSystemPrompt`, kept next to the project note (item 48).
3. Compaction: show the summary and the files it touched, if OAR reports them (item 17).

## Phase 6: Decision gate (not scheduled)

These are pi-only or clash with Rao's project model. Decide keep or drop before planning them:

1. Several conversations per project, forking, and branch navigation (items 31, 32, 33).
2. Provider, API key and OAuth management, the custom model editor, model tests and per-project enabled models (items 51–57).
3. Skill editing, skill enable toggles, skill search and install, and plugin management (items 58–61).
4. The Pi extension UI beyond `app_request`: widgets, status bar and the terminal panel (item 45), plus extension custom messages (item 18) and the skill invocation view (item 16).
5. Reload, cache warming, the tool permission preset, the read-only guard and toolchain prompts (items 27, 46, 47, 49, 50).
6. Performance tracing (item 73).

**Dropped:** image attachments (items 8 and 19), light theme (item 63), mobile layout for now (item 68), and wildcard host binding (item 74).
