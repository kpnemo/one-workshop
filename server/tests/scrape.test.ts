import { describe, it, expect } from "vitest";
import { validateScrapeRequest } from "../src/routes/scrape.js";

describe("validateScrapeRequest", () => {
  it("accepts valid request", () => {
    const result = validateScrapeRequest({
      urls: ["https://example.com"],
      topic: "soccer",
    });
    expect(result.valid).toBe(true);
  });

  it("rejects missing urls", () => {
    const result = validateScrapeRequest({ topic: "soccer" });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("urls");
  });

  it("rejects empty urls array", () => {
    const result = validateScrapeRequest({ urls: [], topic: "soccer" });
    expect(result.valid).toBe(false);
  });

  it("rejects invalid URL format", () => {
    const result = validateScrapeRequest({
      urls: ["not-a-url"],
      topic: "soccer",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("URL");
  });

  it("rejects empty topic", () => {
    const result = validateScrapeRequest({
      urls: ["https://example.com"],
      topic: "",
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain("topic");
  });

  it("rejects missing topic", () => {
    const result = validateScrapeRequest({
      urls: ["https://example.com"],
    });
    expect(result.valid).toBe(false);
  });
});
