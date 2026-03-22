export type StatusEvent =
  | { phase: "fetching"; url: string; state: "started" }
  | { phase: "fetching"; url: string; state: "done"; duration: number }
  | { phase: "fetching"; url: string; state: "failed"; error: string }
  | { phase: "agent"; state: "started" }
  | { phase: "agent"; state: "tool_call"; tool: string; input: Record<string, unknown> }
  | { phase: "agent"; state: "tool_result"; tool: string }
  | { phase: "agent"; state: "done" };

export type SSEEvent =
  | { type: "status"; data: StatusEvent }
  | { type: "error"; data: { phase: string; error: string } }
  | { type: "result"; data: ScrapeResult };

export interface ScrapeResult {
  success: boolean;
  topic: string;
  urls: string[];
  data: Record<string, unknown> | null;
  warning?: string;
  errors: Array<{ url: string; error: string }>;
}

export type AppStatus = "idle" | "running" | "done" | "error";

export interface LogEntry {
  timestamp: Date;
  type: "info" | "success" | "error" | "agent";
  message: string;
}
