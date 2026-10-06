import { defineConfig } from "tsup";
import { readFileSync } from "node:fs";

const packageJson = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as {
  dependencies?: Record<string, string>;
};
const expectedPiVersion = packageJson.dependencies?.["@earendil-works/pi-coding-agent"];
if (!expectedPiVersion || !/^\d+\.\d+\.\d+$/.test(expectedPiVersion)) {
  throw new Error("@earendil-works/pi-coding-agent must be an exact dependency");
}
const piVersionDefine = {
  "process.env.PI_DESKTOP_EXPECTED_PI_VERSION": JSON.stringify(expectedPiVersion),
};

export default defineConfig([
  {
    // ESM — pi-coding-agent only exports "import" condition
    entry: {
      main: "server/main.ts",
      // Worker entrypoints are resolved at runtime relative to the bundle
      // directory (plugin-worker-client.ts / managed-process/service.ts).
      "plugin-worker": "src/agent-host/plugin-worker.ts",
      "managed-process-worker": "src/agent-host/managed-process/worker.ts",
    },
    format: ["esm"],
    platform: "node",
    target: "node22",
    outDir: "out/server",
    clean: false,
    sourcemap: true,
    external: [
      "ws",
      "@larksuiteoapi/node-sdk",
      "@earendil-works/pi-coding-agent",
      "@earendil-works/pi-ai",
      "@earendil-works/pi-agent-core",
      "@earendil-works/pi-tui",
      // Keep the adjacent silk.wasm asset resolvable from the packaged dependency.
      "silk-wasm",
    ],
    splitting: false,
    treeshake: true,
    define: piVersionDefine,
    outExtension() {
      return { js: ".mjs" };
    },
  },
]);
