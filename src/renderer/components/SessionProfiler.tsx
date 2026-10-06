import { Fragment, type ReactNode } from "react";

/** Opt-in development profiler: Preact doesn't include React's Profiler, so render children directly */
export function SessionProfiler({ id: _id, children }: { id: string; children: ReactNode }) {
  return <Fragment>{children}</Fragment>;
}
