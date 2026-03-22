import { describe, it, expect } from "vitest";
import {
  executeSearchContent,
  executeClassifyRelevance,
  executeExtractStructuredData,
} from "../src/agent/tools.js";
import type { PageContent } from "../src/types.js";

const pages: PageContent[] = [
  {
    url: "https://example.com",
    html: "<html><body><p>Soccer is a popular sport worldwide.</p></body></html>",
    text: "Soccer is a popular sport worldwide. The World Cup is the biggest soccer event.",
    title: "Example Sports",
  },
  {
    url: "https://other.com",
    html: "<html><body><p>Basketball news today.</p></body></html>",
    text: "Basketball news today. NBA scores and highlights.",
    title: "Other Sports",
  },
];

describe("search_content", () => {
  it("finds matching snippets across all pages", () => {
    const result = executeSearchContent(pages, { query: "soccer" });
    expect(result.length).toBeGreaterThan(0);
    expect(result[0].url).toBe("https://example.com");
    expect(result[0].snippet).toContain("Soccer");
  });

  it("returns empty array when no matches", () => {
    const result = executeSearchContent(pages, { query: "cricket" });
    expect(result).toEqual([]);
  });

  it("filters by specific URL when provided", () => {
    const result = executeSearchContent(pages, { query: "sport", url: "https://other.com" });
    expect(result.every((r) => r.url === "https://other.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    const result = executeSearchContent(pages, { query: "SOCCER" });
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("classify_relevance", () => {
  it("returns high relevance for text with many topic matches", () => {
    const result = executeClassifyRelevance({
      text: "Soccer goals, soccer teams, soccer leagues, soccer players",
      topic: "soccer",
    });
    expect(result.relevance).toBe("high");
    expect(result.score).toBeGreaterThan(0);
  });

  it("returns low relevance for unrelated text", () => {
    const result = executeClassifyRelevance({
      text: "The weather today is sunny with mild temperatures",
      topic: "soccer",
    });
    expect(result.relevance).toBe("low");
    expect(result.score).toBe(0);
  });

  it("returns medium relevance for some matches", () => {
    const result = executeClassifyRelevance({
      text: "Sports news: basketball, tennis, and soccer results from today",
      topic: "soccer",
    });
    expect(result.relevance).toBe("medium");
  });
});

describe("extract_structured_data", () => {
  const pagesWithTable: PageContent[] = [
    {
      url: "https://scores.com",
      html: `<html><body>
        <h1>Scores</h1>
        <table><tr><th>Team</th><th>Score</th></tr><tr><td>Arsenal</td><td>3</td></tr><tr><td>Chelsea</td><td>1</td></tr></table>
        <ul><li>Match highlights available</li><li>Next game Tuesday</li></ul>
      </body></html>`,
      text: "Scores Team Score Arsenal 3 Chelsea 1 Match highlights available Next game Tuesday",
      title: "Scores Page",
    },
  ];

  it("extracts tables from HTML", () => {
    const result = executeExtractStructuredData(pagesWithTable, {
      url: "https://scores.com",
    });
    expect(result.tables.length).toBeGreaterThan(0);
    expect(result.tables[0]).toContainEqual({ Team: "Arsenal", Score: "3" });
  });

  it("extracts lists from HTML", () => {
    const result = executeExtractStructuredData(pagesWithTable, {
      url: "https://scores.com",
    });
    expect(result.lists.length).toBeGreaterThan(0);
    expect(result.lists[0]).toContain("Match highlights available");
  });

  it("returns empty structures for unknown URL", () => {
    const result = executeExtractStructuredData(pagesWithTable, {
      url: "https://unknown.com",
    });
    expect(result.tables).toEqual([]);
    expect(result.lists).toEqual([]);
  });
});
