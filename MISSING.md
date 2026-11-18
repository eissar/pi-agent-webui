# Features in pi-agent-webui that Rao lacks

Compared: `/srv/code/pi-agent-webui` (HEAD `03afc80`) and `/srv/code/rao` (HEAD `3bb68c4 WIP`).

Rao's model is different. A project is one long-running agent conversation plus a note. It drives several runtimes (Claude Code, Codex, Kimi, Pi, Grok) through `@botiverse/oar`. The server owns the records, and the client is a pure fold over them. Each item below therefore notes how it fits Rao:

- **[agnostic]**: can be built for every runtime through OAR.
- **[pi-only]**: depends on the Pi SDK or Pi files. It needs Pi-specific code in Rao, or should be dropped.
- **[model]**: conflicts with Rao's one-conversation-per-project model. Decide before building.

Left out entirely: pi-agent-webui features that are dead or half-wired there (file download, file watch, docx and text-diff helpers, `set_auto_compaction`/`set_auto_retry` toggles, token auth that is never enforced), and anything Rao already has.

## Decisions so far

1. Markdown (item 1): solve with a library import; low effort.
2. Image attachments (items 8 user images, 19): dropped.
3. Light theme (item 63): skipped.
4. Mobile layout (item 68): skipped for now.
5. Reconnect handling (item 72): superseded by the planned move of Rao to a cursor-based pull model.
6. Drafts (item 20) and `@file` mentions (item 23): pending clarification.

---

## 1. Transcript rendering

1. **Markdown rendering** of assistant text: headings, lists, tables in a scroll container, links. Rao prints plain `pre-wrap` text. [agnostic]
2. **Lightweight preview for large streaming text.** Text over about 2 KB shows as plain text while streaming and renders as Markdown once settled. [agnostic]
3. **Code blocks** with a language label, Prism syntax highlighting (light and dark themes, lazy-loaded, skipped above 50 KB), language aliases and a copy button. [agnostic]
4. **Edit and diff rendering** for edit tools: side-by-side and unified patch views. Rao has no tool-specific rendering. [agnostic, but each runtime names its edit tool differently]
5. **Collapsed process details.** Intermediate tool calls and messages inside a turn fold behind "N tool calls / messages". [agnostic]
6. **Tool call header details:** an argument preview, the duration, error styling and a "(no output)" notice. [agnostic]
7. **Thinking blocks with a duration** ("thought for Ns"), a streaming placeholder, and an expanded/collapsed state that survives remounts. Rao shows only "thinking · N chars". [agnostic]
8. **Images in messages:** user message images, plus local-file images in Markdown loaded through an authorized file read (`files.read` with `sourceSessionId`). [agnostic, needs a file-read endpoint]
9. **Assistant message footer:** model name, a usage line ("N in · N out · N cache") and cost per message. Rao shows usage only in the Dashboard. [agnostic, if the runtime reports per-message usage]
10. **Copy buttons** on messages, code blocks and custom messages, and a `/copy` command for the last reply. [agnostic]
11. **Timestamps** on user messages. [agnostic]
12. **Phase labels and streaming indicators:** "Waiting for model…", "Running command…", an estimated-token counter, and a retry banner (attempt n/max plus the error). Rao has a status pill and notices, not inline indicators. [agnostic]
13. **Scroll-follow behaviour.** Following releases on wheel, touch or keys, and a floating "Jump to latest" button appears. [agnostic]
14. **Minimap** of the conversation for click or drag navigation. [agnostic]
15. **History windowing.** The first 20 turns load, then "Load earlier messages" or automatic loading near the top, cursor paging, and deferred loading of large entries ("Load full content"). Rao replays the whole log. [agnostic, server-side paging of Rao's JSONL]
16. **Skill invocation view** (`<skill …>` blocks shown as `/skill:name`). [pi-only]
17. **Compaction summary messages** with Read and Modified file lists. Rao shows only start and end notices. [mostly pi-only, depends on what OAR reports]
18. **Extension custom messages** with a title and Markdown. [pi-only]

## 2. Composer

19. **Image attachments:** file picker, paste and drag-and-drop, downscaled to 2048 px and JPEG-compressed, with rejection notices. [agnostic, if OAR input supports images]
20. **Persisted drafts** per conversation, including images, restored if a send fails. Rao's composer state is lost when you switch projects. [agnostic, client-only]
21. **Slash command palette.** Groups (built-in, extensions, prompts, skills), ranked matching, and keyboard navigation with Arrow keys, Tab and Enter. [built-ins agnostic; the extension, prompt and skill lists are pi-only unless OAR exposes commands]
22. **Built-in commands:** `/compact [instructions]`, `/reload`, `/name <name>`, `/session`, `/copy`. [compact and reload depend on what OAR offers; `/name` and `/copy` are agnostic]
23. **`@file` mentions:** fuzzy file search in the project cwd (`fd` with a fallback), degraded-mode notices, and an inserted file reference. Rao has only `@note`. [agnostic, needs a server file index]
24. **Visible queue panel:** "Queued · N" with Steer and Follow-up badges, and "Recall queue", which puts queued text back into the box. Rao sends `steerOrQueue` but shows no queue. [agnostic; withdraw needs OAR `withdraw`]
25. **Explicit steer vs follow-up choice** while a turn is running: two buttons, with steer as the default. Rao picks one automatically based on capability. [agnostic]
26. **Thinking or effort level picker** (off through extra high, taken from the model's levels). Rao displays effort levels but cannot set them. [agnostic, OAR `effort` session option; may need a reopen like model switch]
27. **Tool permission preset** (Off, Default, Full). [pi-only; OAR runs every runtime in yolo mode]
28. **Compact context button** with a before → after token result. [depends on OAR compaction support]
29. **Completion sound toggle** (Web Audio tone when a run finishes). [agnostic, client-only]
30. **Model picker at creation.** Rao has `OpenSessionRequest.model` with no UI. Model selection is also missing auto mode and the per-project enabled-models list (see §5). [agnostic]

## 3. Sessions, projects and navigation

31. **Several conversations per project or folder**, with a list grouped by date (Today, Last 7 days, Older). [model]
32. **Fork a conversation from a message** into a new independent conversation. [model, and runtime support varies]
33. **Branching within a conversation.** "Edit from here" rewinds to that point and puts the message back in the composer, and the branch navigator shows a tree of entries and switches between branches. [pi-only or model; OAR `session.graph()` may help]
34. **Conversation rename and visible titles.** Rao computes a title but never shows it, and only the project name can be edited. [agnostic]
35. **Auto title generation** with a silent, tool-less model call, which a manual rename always overrides. [agnostic in principle; today it uses the Pi model runtime]
36. **Unread indicator** for background runs that have finished, persisted per browser. [agnostic]
37. **Deep link** to a project or conversation (`?session=<id>`). [agnostic]
38. **Manual refresh** of the list, plus live list updates with a polling fallback. [agnostic]
39. **Search covering conversation content, ids and branches.** Rao filters by name and cwd only. [agnostic]
40. **Recent-folder picker** built from history, with a "default cwd" shortcut (`~/pi-cwd-YYYYMMDD`) and server-side validation of the cwd before use. Rao takes a typed path and does not validate it. [agnostic]
41. **Git worktree awareness:** worktrees collapse into one project, and a branch badge appears on conversations. [agnostic]
42. **Session info panel:** file path, id, message counts, token breakdown including cache read and write, cost, context usage, with copy buttons. Some of this is in Rao's Dashboard, but not per project. [agnostic]
43. **Stop runtime without deleting.** `session:dispose` exists in Rao but has no UI. [agnostic, already wired]
44. **Changing a project's cwd** after creation. [agnostic]

## 4. Agent runtime features

45. **Extension UI protocol:**
    - dialog requests (select, confirm, input, editor);
    - notify, status bar, widgets above or below the editor, set title and set editor text;
    - an interactive terminal panel (`custom`) that receives keystrokes.

    Rao shows `app_request` and `app_answered` only as notices and cannot answer them. [OAR `app_request` is agnostic; the rest is pi-only]
46. **Reload** of extensions, skills, prompts and tools in a running session. [pi-only]
47. **Prompt cache warming** (off, during long tool runs, also while idle). [pi-only]
48. **Injected system prompt policy:** an available-toolchain block, and an option to force an empty prompt. [partly agnostic via OAR `appendSystemPrompt`, which Rao does not use yet]
49. **Toolchain detection with a capability-required prompt** (Retry and install guidance when bash, git, node and so on are missing). [Pi and webui-specific; mostly irrelevant to Rao]
50. **Read-only session guard** (history stays viewable when the file is not writable). [pi-only]

## 5. Models and auth

Rao relies on each runtime's own CLI login. Everything here is a product decision as much as a missing feature.

51. **In-app provider management:** add a provider (OAuth subscription, API key, OpenAI- or Anthropic-compatible custom endpoint), and disconnect. [pi-only]
52. **API key entry** with an optional base URL override and verified credential writes. [pi-only]
53. **OAuth login flows** with progress, a paste-code step, cancel, re-login and logout. [pi-only; OAR has device login for some runtimes, e.g. Kimi]
54. **Custom provider and model editor** (`models.json`): API type, image input, reasoning, max tokens, thinking-level map, conflict-safe saves, rename and delete. [pi-only]
55. **Model connection test.** [pi-only]
56. **Per-project enabled-models list** (enable/disable, Enable all, search). [agnostic idea, Pi implementation]
57. **Model catalog refresh** that can be cancelled. Rao re-queries `listModels` with a 15 s timeout. [agnostic, minor]

## 6. Skills and plugins

Rao already shows each runtime's skills, MCP servers and tools (`RuntimeInventory`), read-only.

58. **Skill detail with an editable SKILL.md** (atomic save, unsaved-changes guard). [pi-only]
59. **Enable or disable a skill in the model prompt** (frontmatter toggle). [pi-only]
60. **Skill search** (the skills.sh API, falling back to the `npx skills` CLI) and **install** (global or project scope). [mostly pi-only]
61. **Plugin package manager:** list (global and project), details with resolved resources, add from npm, git, URL or path, plus update, remove and enable/disable, all in an isolated worker process. [pi-only]

## 7. Settings and appearance

62. **A settings screen** (Rao has none) with General, Models, Skills, Plugins and About tabs, a focus trap and keyboard tab navigation. [agnostic shell]
63. **Light theme and a theme toggle** (persisted, set before first paint, with a View Transition wipe). Rao is dark-only. [agnostic]
64. **Chat text size** (four steps), **conversation width** and **reply width** settings, persisted per browser. [agnostic]
65. **Auto-title on/off setting.** [agnostic]
66. **About tab:** app version, Pi version and links. Rao has version information in the Dashboard. [agnostic, minor]
67. **Persisted UI preferences in general.** Rao stores none; for example the note panel toggle is not remembered. [agnostic]

## 8. Layout, transport and system

68. **Mobile layout:** an overlay drawer sidebar, collapsed toolbar menus, and no flash of the drawer before hydration. Rao has a fixed 240 px sidebar and 288 px panel. [agnostic]
69. **Collapsible sidebar.** [agnostic]
70. **Notice shelf** with error, warning, success and info toasts. Rao has only error and info notices. [agnostic]
71. **Error boundary** showing the message and stack, and a connect screen with Retry. [agnostic]
72. **Reconnect handling:** pushed events are reconciled after a reconnect or when the tab becomes visible again. Rao's own docs say it ignores feed `reset` and stale cursors after a server restart. [agnostic, already a planned Rao step]
73. **Performance tracing** on both sides (server session-load timings; client traces behind a localStorage flag). [agnostic, minor]
74. **Static server exposure on a wildcard host.** pi-agent-webui allows `--host 0.0.0.0`. Rao deliberately accepts only specific IPs and checks Host and Origin. This is listed only for completeness; **do not port it**. Rao's approach is safer, and pi-agent-webui's token auth is not enforced anyway.

---

## Rao features pi-agent-webui lacks

For context, not to port:

- Multi-runtime support through OAR.
- Runtime switching with a Markdown handoff.
- Live model switching by reopening the runtime.
- Per-runtime account usage and quota windows.
- Skill, MCP and tool inventory per runtime.
- Project notes with `@note`.
- SQLite project store with crash-recovery intents.
- Data-directory lock.
- Host and Origin allowlists.
- Long-poll pull feed.
- Stall detection ("no output for a while").
- Context usage ring.
