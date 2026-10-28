import { useState } from "react";
import type { ToolCapabilityId } from "@shared/toolchains/types";
import { isToolCapabilityId } from "@shared/toolchains/types";

export interface CapabilityIssue {
  code: string;
  capability?: ToolCapabilityId;
  message?: string;
}

export function parseCapabilityIssue(value: unknown): CapabilityIssue | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.code !== "string") return null;
  const detail = record.detail && typeof record.detail === "object" ? (record.detail as Record<string, unknown>) : {};
  const candidate = record.capability ?? detail.capability;
  const capability = isToolCapabilityId(candidate) ? candidate : capabilityFromCode(record.code);
  const isRequired = record.code === "TOOLCHAIN_CAPABILITY_REQUIRED" || /_REQUIRED$/.test(record.code);
  if (!isRequired) return null;
  return {
    code: record.code,
    capability,
    message:
      typeof record.error === "string" ? record.error : typeof record.message === "string" ? record.message : undefined,
  };
}

export function CapabilityRequired({
  issue,
  onContinue,
  onCancel,
}: {
  issue: CapabilityIssue;
  onContinue: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);
  const label = capabilityLabel(issue.capability);

  const retry = async (): Promise<void> => {
    setPending(true);
    try {
      await onContinue();
    } finally {
      setPending(false);
    }
  };

  return (
    <div
      role="alert"
      style={{
        padding: 13,
        border: "1px solid color-mix(in srgb, #f59e0b 45%, var(--border))",
        borderRadius: 8,
        background: "color-mix(in srgb, #f59e0b 8%, var(--bg-panel))",
        color: "var(--text)",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 700 }}>
        {"{tool} is required for this operation.".replace("{tool}", label)}
      </div>
      <p style={{ margin: "5px 0 10px", fontSize: 11, lineHeight: 1.55, color: "var(--text-muted)" }}>
        {issue.message ?? "No usable tool was found on the server."} {"Install it on the server, then retry."}
      </p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 7 }}>
        <PromptButton primary disabled={pending} onClick={() => void retry()}>
          {pending ? "Retrying…" : "Retry"}
        </PromptButton>
        <PromptButton disabled={pending} onClick={onCancel}>
          {"Cancel"}
        </PromptButton>
      </div>
    </div>
  );
}

function PromptButton({
  children,
  disabled,
  primary = false,
  onClick,
}: {
  children: React.ReactNode;
  disabled: boolean;
  primary?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        minHeight: 31,
        padding: "6px 10px",
        border: `1px solid ${primary ? "var(--accent)" : "var(--border)"}`,
        borderRadius: 6,
        background: primary ? "var(--accent)" : "var(--bg)",
        color: primary ? "white" : "var(--text)",
        fontSize: 11,
        fontWeight: 600,
        cursor: disabled ? "wait" : "pointer",
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
    </button>
  );
}

function capabilityFromCode(code: string): ToolCapabilityId | undefined {
  const values: Record<string, ToolCapabilityId> = {
    TOOLCHAIN_NODE_REQUIRED: "js.node",
    TOOLCHAIN_PYTHON_REQUIRED: "python.interpreter",
    TOOLCHAIN_UV_REQUIRED: "python.uv",
    TOOLCHAIN_GIT_REQUIRED: "vcs.git",
    TOOLCHAIN_BASH_REQUIRED: "shell.bash",
  };
  return values[code];
}

function capabilityLabel(capability: ToolCapabilityId | undefined): string {
  if (!capability) return "A developer tool";
  const labels: Partial<Record<ToolCapabilityId, string>> = {
    "js.node": "Node.js/npm",
    "js.npm": "Node.js/npm",
    "js.npx": "Node.js/npm",
    "js.bun": "Bun",
    "python.interpreter": "Python",
    "python.uv": "Python/uv",
    "python.uvx": "Python/uv",
    "vcs.git": "Git",
    "shell.bash": "Bash",
    "data.jq": "jq",
  };
  return labels[capability] ?? capability;
}
