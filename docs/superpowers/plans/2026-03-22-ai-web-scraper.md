# AI-Powered Web Scraper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a full-stack web scraping service that takes URLs + topic, scrapes pages with Playwright, uses an Anthropic SDK tool-use agent to extract topic-relevant JSON, and streams live status to a React frontend via SSE.

**Architecture:** Monorepo with `/client` (React + Vite + shadcn/ui) and `/server` (Express + TypeScript). The server fetches pages via Playwright in parallel, passes content to an Anthropic SDK agent loop with 4 tools (`search_content`, `extract_structured_data`, `classify_relevance`, `submit_result`), and streams progress to the client via SSE over a POST endpoint.

**Tech Stack:** React 18, Vite, shadcn/ui, TypeScript, Node.js, Express, Playwright, Anthropic SDK (`@anthropic-ai/sdk`), SSE

**Spec:** `docs/superpowers/specs/2026-03-22-ai-web-scraper-design.md`

---

## File Map

### Server (`server/`)

| File | Responsibility |
|------|---------------|
| `server/package.json` | Dependencies: express, cors, @anthropic-ai/sdk, playwright, tsx, typescript, vitest |
| `server/tsconfig.json` | TypeScript config for Node.js |
| `server/src/index.ts` | Express app setup, CORS, route registration, listen on port 3001 |
| `server/src/types.ts` | Shared types: `StatusEvent`, `PageContent`, `FetchResult`, `ScrapeRequest`, `ScrapeResult` |
| `server/src/routes/scrape.ts` | POST `/api/scrape` — validates input, orchestrates fetch-then-agent pipeline, writes SSE events |
| `server/src/scraper/fetcher.ts` | `fetchPages()` — launches Playwright, fetches URLs in parallel, returns page content |
| `server/src/agent/tools.ts` | Tool definitions + execution functions for the 4 agent tools |
| `server/src/agent/extractor.ts` | `extractData()` — Anthropic SDK agent loop with tool-use |
| `server/tests/tools.test.ts` | Unit tests for agent tools |
| `server/tests/fetcher.test.ts` | Unit tests for Playwright fetcher |
| `server/tests/extractor.test.ts` | Unit tests for agent extractor (requires API key) |
| `server/tests/scrape.test.ts` | Unit tests for request validation |

### Client (`client/`)

| File | Responsibility |
|------|---------------|
| `client/package.json` | Dependencies: react, react-dom, vite, tailwindcss, shadcn/ui components |
| `client/vite.config.ts` | Vite config with `/api` proxy to `localhost:3001` |
| `client/index.html` | HTML entry point |
| `client/src/main.tsx` | React entry point |
| `client/src/App.tsx` | Root component — state management, wires ScrapeForm + StatusLog + JsonViewer |
| `client/src/lib/api.ts` | `scrape()` — POST fetch with ReadableStream SSE parsing |
| `client/src/lib/types.ts` | Shared frontend types: `StatusEvent`, `ScrapeResult`, `AppState` |
| `client/src/components/ScrapeForm.tsx` | Multi-URL input form + topic + submit button |
| `client/src/components/StatusLog.tsx` | Live scrolling log of SSE events with color-coded entries |
| `client/src/components/JsonViewer.tsx` | Collapsible JSON tree view with copy button |

### Root

| File | Responsibility |
|------|---------------|
| `package.json` | Root scripts: `dev` (runs both client + server), `build` |
| `.env` | `ANTHROPIC_API_KEY` (gitignored) |
| `.gitignore` | node_modules, dist, .env |

---

## Task 1: Project Scaffolding

**Files:**
- Create: `package.json`, `.gitignore`, `.env`, `server/package.json`, `server/tsconfig.json`, `client/package.json`, `client/vite.config.ts`, `client/index.html`

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "one-workshop",
  "private": true,
  "scripts": {
    "dev": "concurrently \"npm run dev:server\" \"npm run dev:client\"",
    "dev:server": "cd server && npm run dev",
    "dev:client": "cd client && npm run dev",
    "build": "cd server && npm run build && cd ../client && npm run build"
  },
  "devDependencies": {
    "concurrently": "^9.1.2"
  }
}
```

- [ ] **Step 2: Create .gitignore**

```
node_modules/
dist/
.env
```

- [ ] **Step 3: Create .env with placeholder**

```
ANTHROPIC_API_KEY=your-key-here
```

- [ ] **Step 4: Create server/package.json and install dependencies**

```json
{
  "name": "scraper-server",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@anthropic-ai/sdk": "^0.39.0",
    "cors": "^2.8.5",
    "dotenv": "^16.4.0",
    "express": "^4.21.0",
    "playwright": "^1.52.0"
  },
  "devDependencies": {
    "@types/cors": "^2.8.17",
    "@types/express": "^5.0.0",
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.7.0",
    "vitest": "^3.1.0"
  }
}
```

Run: `cd server && npm install`

- [ ] **Step 5: Create server/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "esModuleInterop": true,
    "strict": true,
    "outDir": "dist",
    "rootDir": "src",
    "resolveJsonModule": true,
    "declaration": true,
    "skipLibCheck": true
  },
  "include": ["src"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

- [ ] **Step 6: Scaffold client with Vite**

Run:
```bash
npm create vite@latest client -- --template react-ts
cd client && npm install
```

- [ ] **Step 7: Install shadcn/ui dependencies in client**

Run:
```bash
cd client
npm install tailwindcss @tailwindcss/vite
npx shadcn@latest init -d
npx shadcn@latest add card badge scroll-area button input
```

- [ ] **Step 8: Configure Vite proxy**

Update `client/vite.config.ts`:

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    proxy: {
      "/api": "http://localhost:3001",
    },
  },
});
```

- [ ] **Step 9: Install Playwright browsers**

Run: `cd server && npx playwright install chromium`

- [ ] **Step 10: Install root dependencies and verify both start**

Run:
```bash
cd /Users/mikeb/one-workshop
npm install
```

- [ ] **Step 11: Commit scaffolding**

```bash
git add -A
git commit -m "chore: scaffold monorepo with server and client"
```

---

## Task 2: Server Shared Types

**Files:**
- Create: `server/src/types.ts`

- [ ] **Step 1: Create shared types file**

```typescript
// SSE event types
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

export interface PageContent {
  url: string;
  html: string;
  text: string;
  title: string;
}

export type FetchResult =
  | ({ success: true } & PageContent)
  | { success: false; url: string; error: string };

export interface ScrapeRequest {
  urls: string[];
  topic: string;
}

export interface ScrapeResult {
  success: boolean;
  topic: string;
  urls: string[];
  data: Record<string, unknown> | null;
  warning?: string;
  errors: Array<{ url: string; error: string }>;
}

export type StatusCallback = (event: StatusEvent) => void;
```

- [ ] **Step 2: Commit**

```bash
git add server/src/types.ts
git commit -m "feat(server): add shared type definitions"
```

---

## Task 3: Agent Tools

**Files:**
- Create: `server/src/agent/tools.ts`, `server/tests/tools.test.ts`

- [ ] **Step 1: Write failing tests for all tools**

Create `server/tests/tools.test.ts` (complete file with all test suites):

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/tools.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement all tool execution functions**

Create `server/src/agent/tools.ts`:

```typescript
import type { PageContent } from "../types.js";

// --- Tool input types ---

interface SearchContentInput {
  query: string;
  url?: string;
}

interface ExtractStructuredDataInput {
  url: string;
  elementName?: string;
}

interface ClassifyRelevanceInput {
  text: string;
  topic: string;
}

// --- Tool execution functions ---

export function executeSearchContent(
  pages: PageContent[],
  input: SearchContentInput
): Array<{ url: string; snippet: string; context: string }> {
  const query = input.query.toLowerCase();
  const targetPages = input.url ? pages.filter((p) => p.url === input.url) : pages;
  const results: Array<{ url: string; snippet: string; context: string }> = [];

  for (const page of targetPages) {
    const text = page.text;
    const lowerText = text.toLowerCase();
    let searchFrom = 0;

    while (true) {
      const idx = lowerText.indexOf(query, searchFrom);
      if (idx === -1) break;

      const contextStart = Math.max(0, idx - 100);
      const contextEnd = Math.min(text.length, idx + query.length + 100);
      const snippet = text.slice(idx, idx + query.length + 50).trim();
      const context = text.slice(contextStart, contextEnd).trim();

      results.push({ url: page.url, snippet, context });
      searchFrom = idx + query.length;
    }
  }

  return results;
}

export function executeExtractStructuredData(
  pages: PageContent[],
  input: ExtractStructuredDataInput
): { tables: Record<string, string>[][]; lists: string[][]; metadata: Record<string, string> } {
  const page = pages.find((p) => p.url === input.url);
  if (!page) {
    return { tables: [], lists: [], metadata: {} };
  }

  let html = page.html;

  // Apply CSS selector if provided (basic support)
  if (input.elementName) {
    const elementRegex = new RegExp(
      `<${input.elementName}[^>]*>([\\s\\S]*?)<\\/${input.elementName}>`,
      "gi"
    );
    const matches = html.match(elementRegex);
    html = matches ? matches.join("\n") : html;
  }

  // Extract tables
  const tables: Record<string, string>[][] = [];
  const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi;
  let tableMatch;
  while ((tableMatch = tableRegex.exec(html)) !== null) {
    const tableHtml = tableMatch[1];
    const headers: string[] = [];
    const headerRegex = /<th[^>]*>([\s\S]*?)<\/th>/gi;
    let headerMatch;
    while ((headerMatch = headerRegex.exec(tableHtml)) !== null) {
      headers.push(headerMatch[1].replace(/<[^>]*>/g, "").trim());
    }

    const rows: Record<string, string>[] = [];
    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let rowMatch;
    let isFirstRow = true;
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      if (isFirstRow && headers.length > 0) {
        isFirstRow = false;
        continue; // skip header row
      }
      isFirstRow = false;

      const cells: string[] = [];
      const cellRegex = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let cellMatch;
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        cells.push(cellMatch[1].replace(/<[^>]*>/g, "").trim());
      }

      if (cells.length > 0 && headers.length > 0) {
        const row: Record<string, string> = {};
        headers.forEach((h, i) => {
          row[h] = cells[i] || "";
        });
        rows.push(row);
      }
    }
    if (rows.length > 0) tables.push(rows);
  }

  // Extract lists
  const lists: string[][] = [];
  const listRegex = /<[ou]l[^>]*>([\s\S]*?)<\/[ou]l>/gi;
  let listMatch;
  while ((listMatch = listRegex.exec(html)) !== null) {
    const items: string[] = [];
    const itemRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
    let itemMatch;
    while ((itemMatch = itemRegex.exec(listMatch[1])) !== null) {
      items.push(itemMatch[1].replace(/<[^>]*>/g, "").trim());
    }
    if (items.length > 0) lists.push(items);
  }

  // Extract metadata (title)
  const metadata: Record<string, string> = {};
  metadata.title = page.title;

  return { tables, lists, metadata };
}

export function executeClassifyRelevance(
  input: ClassifyRelevanceInput
): { relevance: "high" | "medium" | "low"; score: number; reason: string } {
  const text = input.text.toLowerCase();
  const topic = input.topic.toLowerCase();
  const words = text.split(/\s+/);
  const totalWords = words.length;
  const topicWords = topic.split(/\s+/);

  let matchCount = 0;
  for (const topicWord of topicWords) {
    for (const word of words) {
      if (word.includes(topicWord)) matchCount++;
    }
  }

  const density = totalWords > 0 ? matchCount / totalWords : 0;

  let relevance: "high" | "medium" | "low";
  let reason: string;

  if (matchCount >= 3 || density > 0.05) {
    relevance = "high";
    reason = `Found ${matchCount} matches (density: ${(density * 100).toFixed(1)}%)`;
  } else if (matchCount >= 1) {
    relevance = "medium";
    reason = `Found ${matchCount} match(es) (density: ${(density * 100).toFixed(1)}%)`;
  } else {
    relevance = "low";
    reason = "No topic matches found";
  }

  return { relevance, score: matchCount, reason };
}

// --- Anthropic tool definitions (for API registration) ---

export const toolDefinitions = [
  {
    name: "search_content",
    description:
      "Search across all scraped page contents for a keyword or phrase. Returns matching snippets with context. Optionally filter to a specific URL.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: { type: "string", description: "The search query (case-insensitive)" },
        url: { type: "string", description: "Optional: limit search to this specific URL" },
      },
      required: ["query"],
    },
  },
  {
    name: "extract_structured_data",
    description:
      "Extract structured data (tables, lists, key-value pairs) from a specific page's HTML. Optionally focus on a specific HTML element name.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The URL of the page to extract data from" },
        elementName: {
          type: "string",
          description: "Optional HTML element name to focus extraction on (e.g. 'table', 'div')",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "classify_relevance",
    description:
      "Classify how relevant a text chunk is to the given topic. Returns relevance level (high/medium/low), score, and reason.",
    input_schema: {
      type: "object" as const,
      properties: {
        text: { type: "string", description: "The text to classify" },
        topic: { type: "string", description: "The topic to check relevance against" },
      },
      required: ["text", "topic"],
    },
  },
  {
    name: "submit_result",
    description:
      "Submit the final structured JSON result. Call this when you have finished extracting and organizing all topic-relevant data. This ends the extraction process.",
    input_schema: {
      type: "object" as const,
      properties: {
        data: {
          type: "object",
          description: "The final structured JSON containing all extracted topic-relevant data",
        },
      },
      required: ["data"],
    },
  },
];
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/tools.test.ts`
Expected: All tests PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/agent/tools.ts server/tests/tools.test.ts
git commit -m "feat(server): implement agent tools with tests"
```

---

## Task 4: Playwright Fetcher

**Files:**
- Create: `server/src/scraper/fetcher.ts`, `server/tests/fetcher.test.ts`

- [ ] **Step 1: Write failing tests for fetcher**

Create `server/tests/fetcher.test.ts`:

```typescript
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

    const results = await fetchPages(
      ["https://example.com", "https://example.org"],
      onStatus
    );

    expect(results.length).toBe(2);
    expect(results.some((r) => r.success)).toBe(true);
  });
}, 60000);
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/fetcher.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement fetcher**

Create `server/src/scraper/fetcher.ts`:

```typescript
import { chromium } from "playwright";
import type { FetchResult, StatusCallback } from "../types.js";

const FETCH_TIMEOUT = 30_000;

export async function fetchPages(
  urls: string[],
  onStatus: StatusCallback
): Promise<FetchResult[]> {
  const browser = await chromium.launch({ headless: true });

  try {
    const results = await Promise.allSettled(
      urls.map((url) => fetchSinglePage(browser, url, onStatus))
    );

    return results.map((result, i) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      onStatus({ phase: "fetching", url: urls[i], state: "failed", error });
      return { success: false as const, url: urls[i], error };
    });
  } finally {
    await browser.close();
  }
}

async function fetchSinglePage(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  url: string,
  onStatus: StatusCallback
): Promise<FetchResult> {
  onStatus({ phase: "fetching", url, state: "started" });
  const startTime = Date.now();

  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: FETCH_TIMEOUT });

    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText);
    const title = await page.title();

    const duration = (Date.now() - startTime) / 1000;
    onStatus({ phase: "fetching", url, state: "done", duration });

    return { success: true, url, html, text, title };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    onStatus({ phase: "fetching", url, state: "failed", error });
    return { success: false, url, error };
  } finally {
    await context.close();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd server && npx vitest run tests/fetcher.test.ts`
Expected: All tests PASS (requires network access and Playwright chromium installed)

- [ ] **Step 5: Commit**

```bash
git add server/src/scraper/fetcher.ts server/tests/fetcher.test.ts
git commit -m "feat(server): implement Playwright page fetcher with tests"
```

---

## Task 5: Agent Extractor

**Files:**
- Create: `server/src/agent/extractor.ts`, `server/tests/extractor.test.ts`

- [ ] **Step 1: Write failing tests for extractor**

Create `server/tests/extractor.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/extractor.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement extractor**

Create `server/src/agent/extractor.ts`:

```typescript
import Anthropic from "@anthropic-ai/sdk";
import {
  toolDefinitions,
  executeSearchContent,
  executeExtractStructuredData,
  executeClassifyRelevance,
} from "./tools.js";
import type { PageContent, StatusCallback } from "../types.js";

const MAX_TURNS = 10;
const MODEL = "claude-sonnet-4-20250514";
const MAX_CONTENT_CHARS = 100_000;

const SYSTEM_PROMPT = `You are a data extraction agent. Your job is to analyze web page contents and extract all information relevant to a given topic.

You have access to these tools:
- search_content: Search page text for keywords. Use this to find relevant sections.
- extract_structured_data: Pull tables, lists, and structured data from a page's HTML.
- classify_relevance: Check if a piece of text is relevant to the topic.
- submit_result: Submit your final structured JSON result. Call this when done.

Your workflow:
1. Search for the topic across all pages to understand what's available
2. Extract structured data from pages that have relevant content
3. Organize findings into a clean, well-structured JSON object
4. Call submit_result with your final JSON

The JSON structure should be inferred from the content — there is no fixed schema. Choose a structure that best represents the data you found. Use descriptive keys, group related data logically, and include source URLs where helpful.

Be thorough but focused. Extract only what's relevant to the topic.`;

export async function extractData(
  pages: PageContent[],
  topic: string,
  onStatus: StatusCallback
): Promise<{ data: Record<string, unknown> | null; warning?: string }> {
  const client = new Anthropic();

  onStatus({ phase: "agent", state: "started" });

  const userContent = buildUserMessage(pages, topic);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];

  let result: Record<string, unknown> | null = null;
  let turns = 0;

  while (turns < MAX_TURNS) {
    turns++;

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions as Anthropic.Tool[],
      messages,
    });

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      onStatus({
        phase: "agent",
        state: "tool_call",
        tool: toolUse.name,
        input: toolUse.input as Record<string, unknown>,
      });

      const toolResult = executeTool(pages, toolUse.name, toolUse.input as Record<string, unknown>);

      if (toolUse.name === "submit_result") {
        result = (toolUse.input as { data: Record<string, unknown> }).data;
      }

      onStatus({ phase: "agent", state: "tool_result", tool: toolUse.name });

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(toolResult),
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    if (result !== null) {
      onStatus({ phase: "agent", state: "done" });
      return { data: result };
    }
  }

  onStatus({ phase: "agent", state: "done" });

  if (result === null) {
    return {
      data: null,
      warning: "Agent did not complete extraction within 10 turns",
    };
  }

  return { data: result };
}

function executeTool(
  pages: PageContent[],
  name: string,
  input: Record<string, unknown>
): unknown {
  switch (name) {
    case "search_content":
      return executeSearchContent(pages, input as { query: string; url?: string });
    case "extract_structured_data":
      return executeExtractStructuredData(pages, input as { url: string; elementName?: string });
    case "classify_relevance":
      return executeClassifyRelevance(input as { text: string; topic: string });
    case "submit_result":
      return { accepted: true };
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function buildUserMessage(pages: PageContent[], topic: string): string {
  let totalLength = 0;
  const pageTexts: string[] = [];

  for (const page of pages) {
    const entry = `--- Page: ${page.title} (${page.url}) ---\n${page.text}`;
    totalLength += entry.length;
    pageTexts.push(entry);
  }

  if (totalLength > MAX_CONTENT_CHARS) {
    const ratio = MAX_CONTENT_CHARS / totalLength;
    for (let i = 0; i < pageTexts.length; i++) {
      const maxLen = Math.floor(pageTexts[i].length * ratio);
      pageTexts[i] = pageTexts[i].slice(0, maxLen) + "\n[... truncated]";
    }
  }

  return `Topic: ${topic}\n\nExtract all information relevant to "${topic}" from the following web pages. Use your tools to search, extract structured data, and classify relevance. When done, call submit_result with the final structured JSON.\n\n${pageTexts.join("\n\n")}`;
}
```

- [ ] **Step 4: Set ANTHROPIC_API_KEY and run tests**

Ensure `/Users/mikeb/one-workshop/.env` has a valid API key, then:

Run: `cd server && ANTHROPIC_API_KEY=$(grep ANTHROPIC_API_KEY ../.env | cut -d= -f2) npx vitest run tests/extractor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/src/agent/extractor.ts server/tests/extractor.test.ts
git commit -m "feat(server): implement agent extractor with tool-use loop"
```

---

## Task 6: Express Server + SSE Scrape Route

**Files:**
- Create: `server/src/index.ts`, `server/src/routes/scrape.ts`, `server/tests/scrape.test.ts`

- [ ] **Step 1: Write failing tests for request validation**

Create `server/tests/scrape.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd server && npx vitest run tests/scrape.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement scrape route with validation and SSE**

Create `server/src/routes/scrape.ts`:

```typescript
import { Router, Request, Response } from "express";
import { fetchPages } from "../scraper/fetcher.js";
import { extractData } from "../agent/extractor.js";
import type { StatusEvent, ScrapeResult, SSEEvent } from "../types.js";

export const scrapeRouter = Router();

export function validateScrapeRequest(
  body: unknown
): { valid: true; urls: string[]; topic: string } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const { urls, topic } = body as Record<string, unknown>;

  if (!Array.isArray(urls) || urls.length === 0) {
    return { valid: false, error: "urls must be a non-empty array" };
  }

  for (const url of urls) {
    if (typeof url !== "string") {
      return { valid: false, error: "Each URL must be a string" };
    }
    try {
      new URL(url);
    } catch {
      return { valid: false, error: `Invalid URL format: ${url}` };
    }
  }

  if (typeof topic !== "string" || topic.trim().length === 0) {
    return { valid: false, error: "topic must be a non-empty string" };
  }

  return { valid: true, urls: urls as string[], topic: topic as string };
}

function sendSSE(res: Response, event: SSEEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

scrapeRouter.post("/scrape", async (req: Request, res: Response) => {
  const validation = validateScrapeRequest(req.body);

  if (!validation.valid) {
    res.status(400).json({ success: false, error: validation.error });
    return;
  }

  const { urls, topic } = validation;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const onStatus = (event: StatusEvent) => {
    sendSSE(res, { type: "status", data: event });
  };

  try {
    const fetchResults = await fetchPages(urls, onStatus);

    const successfulPages = fetchResults.filter((r) => r.success === true);
    const errors = fetchResults
      .filter((r) => !r.success)
      .map((r) => {
        if (!r.success) return { url: r.url, error: r.error };
        throw new Error("unreachable");
      });

    if (successfulPages.length === 0) {
      const result: ScrapeResult = {
        success: false,
        topic,
        urls,
        data: null,
        errors,
      };
      sendSSE(res, { type: "result", data: result });
      res.end();
      return;
    }

    const pages = successfulPages.map((p) => {
      if (p.success) return { url: p.url, html: p.html, text: p.text, title: p.title };
      throw new Error("unreachable");
    });

    const extraction = await extractData(pages, topic, onStatus);

    const result: ScrapeResult = {
      success: true,
      topic,
      urls: pages.map((p) => p.url),
      data: extraction.data,
      warning: extraction.warning,
      errors,
    };

    sendSSE(res, { type: "result", data: result });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    sendSSE(res, { type: "error", data: { phase: "agent", error: errorMessage } });
  } finally {
    res.end();
  }
});
```

- [ ] **Step 4: Implement Express server**

Create `server/src/index.ts`:

```typescript
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../../.env") });

import express from "express";
import cors from "cors";
import { scrapeRouter } from "./routes/scrape.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

app.use("/api", scrapeRouter);

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
```

- [ ] **Step 5: Run validation tests to verify they pass**

Run: `cd server && npx vitest run tests/scrape.test.ts`
Expected: All validation tests PASS

- [ ] **Step 6: Manually verify server starts**

Run: `cd server && npx tsx src/index.ts`
Expected: "Server running on http://localhost:3001"
Kill with Ctrl+C after verification.

- [ ] **Step 7: Commit**

```bash
git add server/src/index.ts server/src/routes/scrape.ts server/tests/scrape.test.ts
git commit -m "feat(server): implement Express server with SSE scrape route"
```

---

## Task 7: Client — Types + API Layer

**Files:**
- Create: `client/src/lib/types.ts`, `client/src/lib/api.ts`

- [ ] **Step 1: Create client-side types**

Create `client/src/lib/types.ts`:

```typescript
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
```

- [ ] **Step 2: Implement SSE API client**

Create `client/src/lib/api.ts`:

```typescript
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
```

- [ ] **Step 3: Commit**

```bash
git add client/src/lib/types.ts client/src/lib/api.ts
git commit -m "feat(client): add types and SSE API client"
```

---

## Task 8: Client — ScrapeForm Component

**Files:**
- Create: `client/src/components/ScrapeForm.tsx`

- [ ] **Step 1: Implement ScrapeForm**

Create `client/src/components/ScrapeForm.tsx`:

```tsx
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface ScrapeFormProps {
  onSubmit: (urls: string[], topic: string) => void;
  disabled: boolean;
}

export function ScrapeForm({ onSubmit, disabled }: ScrapeFormProps) {
  const [urls, setUrls] = useState<string[]>([""]);
  const [topic, setTopic] = useState("");

  const addUrl = () => setUrls([...urls, ""]);

  const removeUrl = (index: number) => {
    if (urls.length === 1) return;
    setUrls(urls.filter((_, i) => i !== index));
  };

  const updateUrl = (index: number, value: string) => {
    const updated = [...urls];
    updated[index] = value;
    setUrls(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const validUrls = urls.filter((u) => u.trim().length > 0);
    if (validUrls.length === 0 || topic.trim().length === 0) return;
    onSubmit(validUrls, topic.trim());
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <label className="text-sm font-medium">URLs</label>
        {urls.map((url, i) => (
          <div key={i} className="flex gap-2">
            <Input
              type="url"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => updateUrl(i, e.target.value)}
              disabled={disabled}
            />
            {urls.length > 1 && (
              <Button
                type="button"
                variant="outline"
                size="icon"
                onClick={() => removeUrl(i)}
                disabled={disabled}
              >
                X
              </Button>
            )}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addUrl} disabled={disabled}>
          + Add URL
        </Button>
      </div>

      <div className="space-y-2">
        <label className="text-sm font-medium">Topic</label>
        <Input
          type="text"
          placeholder="e.g. soccer, machine learning, recipes..."
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          disabled={disabled}
        />
      </div>

      <Button type="submit" disabled={disabled || urls.every((u) => !u.trim()) || !topic.trim()}>
        {disabled ? "Scraping..." : "Scrape"}
      </Button>
    </form>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/ScrapeForm.tsx
git commit -m "feat(client): implement ScrapeForm component"
```

---

## Task 9: Client — StatusLog Component

**Files:**
- Create: `client/src/components/StatusLog.tsx`

- [ ] **Step 1: Implement StatusLog**

Create `client/src/components/StatusLog.tsx`:

```tsx
import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import type { LogEntry } from "@/lib/types";

interface StatusLogProps {
  entries: LogEntry[];
}

const badgeStyles: Record<LogEntry["type"], string> = {
  info: "bg-blue-100 text-blue-800",
  success: "bg-green-100 text-green-800",
  error: "bg-red-100 text-red-800",
  agent: "bg-purple-100 text-purple-800",
};

const icons: Record<LogEntry["type"], string> = {
  info: "...",
  success: "OK",
  error: "!",
  agent: ">",
};

export function StatusLog({ entries }: StatusLogProps) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [entries.length]);

  if (entries.length === 0) return null;

  return (
    <div className="border rounded-lg">
      <div className="px-4 py-2 border-b bg-muted/50">
        <h3 className="text-sm font-medium">Execution Log</h3>
      </div>
      <ScrollArea className="h-64">
        <div className="p-4 space-y-1 font-mono text-sm">
          {entries.map((entry, i) => (
            <div key={i} className="flex items-start gap-2">
              <span className="text-muted-foreground text-xs whitespace-nowrap">
                {entry.timestamp.toLocaleTimeString()}
              </span>
              <Badge variant="outline" className={`text-xs ${badgeStyles[entry.type]}`}>
                {icons[entry.type]}
              </Badge>
              <span>{entry.message}</span>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/StatusLog.tsx
git commit -m "feat(client): implement StatusLog component"
```

---

## Task 10: Client — JsonViewer Component

**Files:**
- Create: `client/src/components/JsonViewer.tsx`

- [ ] **Step 1: Implement JsonViewer**

Create `client/src/components/JsonViewer.tsx`:

```tsx
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ScrapeResult } from "@/lib/types";

interface JsonViewerProps {
  result: ScrapeResult | null;
}

export function JsonViewer({ result }: JsonViewerProps) {
  const [copied, setCopied] = useState(false);

  if (!result) return null;

  const jsonString = JSON.stringify(result.data, null, 2);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/50">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium">Result</h3>
          {result.success ? (
            <Badge variant="outline" className="bg-green-100 text-green-800">
              Success
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-red-100 text-red-800">
              Failed
            </Badge>
          )}
          {result.warning && (
            <Badge variant="outline" className="bg-yellow-100 text-yellow-800">
              Warning
            </Badge>
          )}
        </div>
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? "Copied!" : "Copy JSON"}
        </Button>
      </div>

      {result.errors.length > 0 && (
        <div className="px-4 py-2 border-b bg-red-50">
          <p className="text-sm text-red-700 font-medium">Fetch errors:</p>
          {result.errors.map((err, i) => (
            <p key={i} className="text-sm text-red-600">
              {err.url}: {err.error}
            </p>
          ))}
        </div>
      )}

      {result.warning && (
        <div className="px-4 py-2 border-b bg-yellow-50">
          <p className="text-sm text-yellow-700">{result.warning}</p>
        </div>
      )}

      <ScrollArea className="h-96">
        <pre className="p-4 text-sm overflow-x-auto">
          <code>{result.data ? jsonString : "No data extracted"}</code>
        </pre>
      </ScrollArea>
    </Card>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add client/src/components/JsonViewer.tsx
git commit -m "feat(client): implement JsonViewer component"
```

---

## Task 11: Client — App.tsx Wiring

**Files:**
- Modify: `client/src/App.tsx`, `client/src/main.tsx`

- [ ] **Step 1: Implement App.tsx with state management and event wiring**

Replace `client/src/App.tsx` contents:

```tsx
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
```

- [ ] **Step 2: Clean up default Vite boilerplate**

Remove default Vite CSS and assets:
```bash
rm -f client/src/App.css
```

Ensure `client/src/main.tsx` is:

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

Note: Keep `index.css` — it should contain the shadcn/tailwind imports generated by `npx shadcn init`.

- [ ] **Step 3: Commit**

```bash
git add client/src/
git commit -m "feat(client): wire up App with form, status log, and JSON viewer"
```

---

## Task 12: Integration Test — End to End

**Files:**
- No new files — manual testing and final adjustments

- [ ] **Step 1: Set ANTHROPIC_API_KEY**

Ensure `/Users/mikeb/one-workshop/.env` has a valid key:
```bash
echo "ANTHROPIC_API_KEY=sk-ant-your-key" > /Users/mikeb/one-workshop/.env
```

- [ ] **Step 2: Run all server tests**

Run: `cd server && npx vitest run`
Expected: All tests pass

- [ ] **Step 3: Start both servers and test in browser**

Run: `cd /Users/mikeb/one-workshop && npm run dev`

Open `http://localhost:5173` in browser.

Test with:
- URL: `https://example.com`
- Topic: `example`

Verify:
1. Form submits and disables
2. StatusLog shows fetching events then agent events then done
3. JsonViewer shows extracted JSON
4. Copy button works

- [ ] **Step 4: Test error handling**

Test with:
- URL: `https://this-does-not-exist-xyz.com`
- Topic: `anything`

Verify:
1. StatusLog shows fetch failure
2. Result shows `success: false`

- [ ] **Step 5: Test multi-URL**

Test with:
- URL 1: `https://example.com`
- URL 2: `https://example.org`
- Topic: `domain`

Verify:
1. Both URLs show fetch status
2. Agent processes both pages
3. Result contains merged data

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete MVP -- AI web scraper with live status streaming"
```
