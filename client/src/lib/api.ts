import type { SSEEvent } from "./types";

export async function scrape(
  urls: string[],
  topic: string,
  onEvent: (event: SSEEvent) => void
): Promise<void> {
  const response = await fetch("/api/scrape", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls, topic }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";
  let currentEvent = "";
  let currentData = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("event: ")) {
        currentEvent = line.slice(7).trim();
      } else if (line.startsWith("data: ")) {
        currentData = line.slice(6).trim();
      } else if (line === "" && currentEvent && currentData) {
        try {
          const parsed = JSON.parse(currentData);
          onEvent({ type: currentEvent, data: parsed } as SSEEvent);
        } catch {
          console.warn("Failed to parse SSE data:", currentData);
        }
        currentEvent = "";
        currentData = "";
      }
    }
  }
}
