interface EventStreamError extends Error {
  name: "EventStreamConnectionError";
  status: "timeout" | "closed";
}

function isEventStreamError(error: unknown): error is EventStreamError {
  if (!(error instanceof Error) || error.name !== "EventStreamConnectionError") return false;
  const status = (error as { status?: unknown }).status;
  return status === "timeout" || status === "closed";
}

export function sessionClientErrorMessage(error: unknown, fallback: string): string {
  if (isEventStreamError(error)) {
    return error.status === "timeout"
      ? "Timed out connecting to the agent event stream. Please try again."
      : "Failed to connect to the agent event stream. Please try again.";
  }
  if (error instanceof TypeError) return fallback;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
