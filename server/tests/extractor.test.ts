import { describe, it, expect } from "vitest";
import { extractData } from "../src/agent/extractor.js";
import type { PageContent, StatusEvent } from "../src/types.js";

const testPages: PageContent[] = [
  {
    url: "https://example.com",
    html: "<html><body><p>Soccer scores: Arsenal 3, Chelsea 1</p></body></html>",
    text: "Soccer scores: Arsenal 3, Chelsea 1. Premier League match day 25.",
    title: "Sports Scores",
  },
];

describe("extractData", () => {
  it("returns result with data property", async () => {
    const events: StatusEvent[] = [];
    const onStatus = (e: StatusEvent) => events.push(e);

    const result = await extractData(testPages, "soccer", onStatus);

    expect(result).toHaveProperty("data");
    expect(events.some((e) => e.phase === "agent" && e.state === "started")).toBe(true);
    expect(events.some((e) => e.phase === "agent" && e.state === "done")).toBe(true);
  }, 60000);
});
