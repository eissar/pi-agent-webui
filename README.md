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
npm run build
```

Or build components individually:

```bash
npm run build:server    # builds server bundle to out/server/
npm run build:renderer  # builds Vite assets to out/renderer/
```

### 3. Run

#### Production mode (Node server serves both API and static assets):

```bash
# Start on localhost:3456
npm start

# Or with custom port / host
PORT=8080 HOST=0.0.0.0 npm start
```

_Note on remote access:_ When binding to non-loopback addresses (e.g. `0.0.0.0`), a bearer authentication token is automatically generated and printed in the server log to protect against unauthorized access. You can also supply your own via `PI_WEBUI_TOKEN=secret npm start` and append `?token=secret` to the browser URL.

#### Development mode:

```bash
# Terminal 1: run the backend server
npm run dev:server

# Terminal 2: run Vite dev server with hot reload
npm run dev:renderer
```

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
