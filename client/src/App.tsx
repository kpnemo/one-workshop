import { useState, useCallback } from "react";
import { ScrapeForm } from "./components/ScrapeForm";
import { StatusLog } from "./components/StatusLog";
import { JsonViewer } from "./components/JsonViewer";
import { scrape } from "./lib/api";
import type { AppStatus, LogEntry, ScrapeResult, SSEEvent, StatusEvent } from "./lib/types";

function statusEventToLogEntry(event: StatusEvent): LogEntry {
  const timestamp = new Date();

  if (event.phase === "fetching") {
    switch (event.state) {
      case "started":
        return { timestamp, type: "info", message: `Fetching ${event.url}...` };
      case "done":
        return { timestamp, type: "success", message: `Fetched ${event.url} (${event.duration}s)` };
      case "failed":
        return { timestamp, type: "error", message: `Failed ${event.url} -- ${event.error}` };
    }
  }

  if (event.phase === "agent") {
    switch (event.state) {
      case "started":
        return { timestamp, type: "agent", message: "Starting AI extraction..." };
      case "tool_call":
        return {
          timestamp,
          type: "agent",
          message: `Agent calling ${event.tool}`,
        };
      case "tool_result":
        return { timestamp, type: "agent", message: `Agent received ${event.tool} result` };
      case "done":
        return { timestamp, type: "success", message: "Extraction complete" };
    }
  }

  return { timestamp, type: "info", message: "Unknown event" };
}

export default function App() {
  const [status, setStatus] = useState<AppStatus>("idle");
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [result, setResult] = useState<ScrapeResult | null>(null);

  const addEntry = useCallback((entry: LogEntry) => {
    setEntries((prev) => [...prev, entry]);
  }, []);

  const handleSubmit = useCallback(
    async (urls: string[], topic: string) => {
      setStatus("running");
      setEntries([]);
      setResult(null);

      addEntry({
        timestamp: new Date(),
        type: "info",
        message: `Starting scrape for ${urls.length} URL(s), topic: "${topic}"`,
      });

      try {
        await scrape(urls, topic, (event: SSEEvent) => {
          if (event.type === "status") {
            addEntry(statusEventToLogEntry(event.data));
          } else if (event.type === "error") {
            addEntry({
              timestamp: new Date(),
              type: "error",
              message: `Error: ${event.data.error}`,
            });
            setStatus("error");
          } else if (event.type === "result") {
            setResult(event.data);
            setStatus("done");
          }
        });

        setStatus((prev) => (prev === "running" ? "done" : prev));
      } catch (err) {
        addEntry({
          timestamp: new Date(),
          type: "error",
          message: `Connection error: ${err instanceof Error ? err.message : String(err)}`,
        });
        setStatus("error");
      }
    },
    [addEntry]
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-3xl py-8 px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">AI Web Scraper</h1>
          <p className="text-muted-foreground">
            Enter URLs and a topic to extract relevant information using AI.
          </p>
        </div>

        <ScrapeForm onSubmit={handleSubmit} disabled={status === "running"} />
        <StatusLog entries={entries} />
        <JsonViewer result={result} />
      </div>
    </div>
  );
}
