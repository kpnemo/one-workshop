import { describe, it, expect } from "vitest";
import { fetchPages } from "../src/scraper/fetcher.js";
import type { StatusEvent } from "../src/types.js";

describe("fetchPages", () => {
  it("fetches a real page and returns content", async () => {
    const events: StatusEvent[] = [];
    const onStatus = (e: StatusEvent) => events.push(e);
    const results = await fetchPages(["https://example.com"], onStatus);
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(true);
    if (results[0].success) {
      expect(results[0].html).toContain("Example Domain");
      expect(results[0].text).toContain("Example Domain");
      expect(results[0].title).toBe("Example Domain");
      expect(results[0].url).toBe("https://example.com");
    }
    expect(events.some((e) => e.phase === "fetching" && e.state === "started")).toBe(true);
    expect(events.some((e) => e.phase === "fetching" && e.state === "done")).toBe(true);
  });

  it("handles unreachable URLs gracefully", async () => {
    const events: StatusEvent[] = [];
    const onStatus = (e: StatusEvent) => events.push(e);
    const results = await fetchPages(["https://this-url-does-not-exist-xyz.com"], onStatus);
    expect(results.length).toBe(1);
    expect(results[0].success).toBe(false);
    if (!results[0].success) {
      expect(results[0].error).toBeTruthy();
    }
    expect(events.some((e) => e.phase === "fetching" && e.state === "failed")).toBe(true);
  });

  it("fetches multiple URLs in parallel", async () => {
    const events: StatusEvent[] = [];
    const onStatus = (e: StatusEvent) => events.push(e);
    const results = await fetchPages(["https://example.com", "https://example.org"], onStatus);
    expect(results.length).toBe(2);
    expect(results.some((r) => r.success)).toBe(true);
  });
}, 60000);
