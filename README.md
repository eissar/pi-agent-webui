# Pi Agent WebUI

A standalone browser interface and Node.js backend for the [Pi Coding Agent](https://github.com/earendil-works/pi-coding-agent), extracted from [pi-desktop](https://github.com/DLYZZT/pi-desktop) without Electron dependencies.

## Architecture

- **Frontend (`src/renderer/`)**: React 19 + Tailwind CSS + Vite SPA, served in the browser.
- **Backend (`server/` + `src/agent-host/`)**: Node.js HTTP/WebSocket server that hosts the full Pi agent runtime, manages sessions, runs tools, and executes commands over `@contract/rpc`.
- **Contract (`src/contract/`, `src/shared/`)**: Shared TypeScript types and bidirectional RPC definitions.

In browser mode, `window.piBridge` is polyfilled to bridge renderer RPC calls across a WebSocket to the standalone Node.js backend.

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Build

```bash
# Build both the Node backend and Vite renderer
npm run build:server
npm run build:renderer
```

Or build components individually:

```bash
npm run build:server    # builds server bundle to out/server/
npm run build:renderer  # builds Vite assets to out/renderer/
```

### 3. Run

#### Production mode (Node server serves both API and static assets):

```bash
# Start on http://127.0.0.1:7860
npm start

# Or bind to all interfaces / custom port
PI_WEBUI_HOST=0.0.0.0 PI_WEBUI_PORT=8080 npm start
```

_Note on remote access:_ When binding to non-loopback addresses (e.g. `0.0.0.0`), a bearer authentication token is automatically generated and printed in the server log to protect against unauthorized access. You can also supply your own via `PI_WEBUI_TOKEN=secret npm start` and append `?token=secret` to the browser URL.

#### Development mode:

A single command builds and starts the backend (port 7860), waits for it to become
ready, and then starts the Vite dev server with hot reload (port 5173). Terminating
it (Ctrl-C) shuts both down.

```bash
npm run dev

# Bind Vite to all interfaces so it is reachable by hostname/LAN:
npm run dev -- --host 0.0.0.0
```

Then open http://localhost:5173/ (or the host/port Vite reports).

Extra arguments after `--` are forwarded to Vite. To run Vite without the backend,
use `npm run dev:renderer`.

## Testing

```bash
# Integration test for standalone server & RPC over WebSocket
node scripts/test-standalone-server.mjs

# Typecheck both frontend and backend
npm run typecheck
```

## Features Supported & Unsupported

- ✅ **Supported**: Real Pi coding agent sessions, prompting, tool execution, session history, model configuration, workspace/file explorer, skill discovery, plugins.
- ❌ **Unsupported / Disabled**: Electron native menus, Herdr terminal fleet management, native OS window decorations.
