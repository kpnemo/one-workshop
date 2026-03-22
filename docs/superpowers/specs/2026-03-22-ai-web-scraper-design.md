# AI-Powered Generic Web Scraper Service — Design Spec

## Overview

A full-stack web scraping service that takes multiple URLs and a topic as input, scrapes page content using a headless browser, and uses an AI agent with tool-use to extract topic-relevant information as structured JSON. The frontend shows live execution status as the pipeline progresses.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Client (React + shadcn/ui + Vite)                  │
│  ┌────────────┐ ┌────────────┐ ┌──────────────────┐│
│  │ ScrapeForm │ │ StatusLog  │ │   JsonViewer     ││
│  │ URLs+Topic │ │ Live SSE   │ │   Tree view      ││
│  └────────────┘ └────────────┘ └──────────────────┘│
│         │              ▲               ▲            │
│         └──── POST ────┼───── SSE ─────┘            │
└────────────────────────┼────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────┐
│  Server (Express + Node.js)                         │
│         │                                           │
│  ┌──────▼──────┐                                    │
│  │ POST /api/  │                                    │
│  │   scrape    │──── SSE stream ────►               │
│  └──────┬──────┘                                    │
│         │                                           │
│  ┌──────▼──────┐    ┌───────────────────────┐       │
│  │  Playwright │    │  Anthropic SDK Agent   │       │
│  │   Fetcher   │──►│  with tool-use loop    │       │
│  │  (parallel) │    │                       │       │
│  └─────────────┘    │  Tools:               │       │
│                     │  - search_content     │       │
│                     │  - extract_structured_data │  │
│                     │  - classify_relevance  │       │
│                     │  - submit_result       │       │
│                     └───────────────────────┘       │
└─────────────────────────────────────────────────────┘
```

## Project Structure

```
one-workshop/
├── package.json              # Root scripts: dev, build
├── client/
│   ├── package.json
│   ├── vite.config.ts
│   ├── index.html
│   └── src/
│       ├── main.tsx
│       ├── App.tsx
│       ├── components/
│       │   ├── ScrapeForm.tsx
│       │   ├── StatusLog.tsx
│       │   └── JsonViewer.tsx
│       └── lib/
│           └── api.ts
├── server/
│   ├── package.json
│   ├── tsconfig.json
│   └── src/
│       ├── index.ts
│       ├── routes/
│       │   └── scrape.ts
│       ├── scraper/
│       │   └── fetcher.ts
│       └── agent/
│           ├── extractor.ts
│           └── tools.ts
```

## Stack

- **Frontend**: React 18, Vite, shadcn/ui, TypeScript
- **Backend**: Node.js, Express, TypeScript
- **Scraping**: Playwright
- **AI**: Anthropic SDK (claude-sonnet), tool-use agent loop
- **Streaming**: Server-Sent Events (SSE)

## API Contract

### `POST /api/scrape`

**Request:**
```json
{
  "urls": ["https://espn.com", "https://bbc.com/sport"],
  "topic": "soccer"
}
```

**Response:** HTTP `200` with SSE stream. Note: since this is a POST endpoint, the browser `EventSource` API cannot be used. The client must consume the stream via `fetch` with `ReadableStream` + `TextDecoder` line splitting, or use a library like `eventsource-parser`.

Event types:

```
event: status
data: {"phase": "fetching", "url": "https://espn.com", "state": "started"}

event: status
data: {"phase": "fetching", "url": "https://espn.com", "state": "done", "duration": 2.1}

event: status
data: {"phase": "fetching", "url": "https://bbc.com/sport", "state": "failed", "error": "Navigation timeout"}

event: status
data: {"phase": "agent", "state": "started"}

event: status
data: {"phase": "agent", "state": "tool_call", "tool": "search_content", "input": {"query": "soccer"}}

event: status
data: {"phase": "agent", "state": "tool_result", "tool": "search_content"}

event: status
data: {"phase": "agent", "state": "done"}

event: error
data: {"phase": "agent", "error": "Anthropic API rate limit exceeded"}

event: result
data: {"success": true, "topic": "soccer", "urls": ["https://espn.com"], "data": {...}, "errors": [{"url": "https://bbc.com/sport", "error": "Navigation timeout"}]}
```

**Validation:**
- `urls`: non-empty array, each valid URL format
- `topic`: non-empty string

**Error (non-SSE, immediate — HTTP `400`):**
```json
{
  "success": false,
  "error": "Validation failed: urls must be a non-empty array"
}
```

## Backend Design

### Express Server (`src/index.ts`)

- Starts Express on port 3001
- Registers `/api/scrape` route
- CORS configured for dev (Vite proxy handles this, but belt-and-suspenders)

### Scrape Route (`src/routes/scrape.ts`)

- Validates request body
- Sets SSE headers (`Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`)
- Orchestrates the pipeline:
  1. Emit `fetching` status events as each URL is fetched in parallel
  2. Collect successful page contents
  3. If zero pages succeeded, emit error result and close
  4. Pass successful pages + topic to agent extractor
  5. Forward agent status events to SSE stream
  6. Emit final `result` event and close stream

### Playwright Fetcher (`src/scraper/fetcher.ts`)

- **`fetchPages(urls: string[], onStatus: StatusCallback): Promise<FetchResult[]>`**
- Launches a single Playwright browser instance
- Opens pages in parallel (one per URL) via `Promise.allSettled`
- Per page: navigate, wait for `networkidle`, extract `{ html, text, title, url }`
- Timeout: 30s per page
- Calls `onStatus` callback for each URL start/done/fail
- Closes browser after all pages complete
- Returns array of `{ success: true, html, text, title, url }` or `{ success: false, url, error }`

### Agent Extractor (`src/agent/extractor.ts`)

- **`extractData(pages: PageContent[], topic: string, onStatus: StatusCallback): Promise<any>`**
- Creates Anthropic client from `ANTHROPIC_API_KEY` env var
- System prompt: instructs agent to analyze provided web pages and extract topic-relevant information using available tools, then call `submit_result` with final structured JSON
- User message: includes `text` and `title` per page (not raw HTML) with source URLs. If total text exceeds 100k characters, truncate each page proportionally. The `extract_structured_data` tool accesses `html` on demand for specific pages.
- Runs agent loop:
  1. Send messages to Claude with tool definitions
  2. If response has tool calls, execute them and append results
  3. Emit status events for each tool call/result
  4. Repeat until `submit_result` is called or max 10 turns reached
- If `submit_result` is called, returns its `data` payload
- If 10 turns elapse without `submit_result`, returns `{ data: null, warning: "Agent did not complete extraction within 10 turns" }` in the result event
- All fetched page data (html, text, title, url) is held in memory and accessible to tool implementations for the duration of the agent loop

### Agent Tools (`src/agent/tools.ts`)

**`search_content`**
- Input: `{ query: string, url?: string }` — optional URL to search a specific page
- Behavior: searches across all page text contents for the query string (case-insensitive substring match)
- Returns: array of `{ url, snippet, context }` — matching snippets with surrounding text

**`extract_structured_data`**
- Input: `{ url: string, selector?: string }` — which page, optionally a CSS selector to focus on
- Behavior: parses HTML from that page, extracts tables, lists, and key-value patterns into structured objects
- Returns: `{ tables: [...], lists: [...], metadata: {...} }`

**`classify_relevance`**
- Input: `{ text: string, topic: string }`
- Behavior: simple heuristic — counts topic keyword occurrences, checks for related terms
- Returns: `{ relevance: "high" | "medium" | "low", score: number, reason: string }`

**`submit_result`**
- Input: `{ data: object }` — the final structured JSON
- Behavior: signals the agent loop to terminate, returns the data
- Returns: `{ accepted: true }`

## Frontend Design

### App.tsx

- Single page layout
- State: `status` (idle | running | done | error), `events[]`, `result`
- Renders `ScrapeForm` (top), `StatusLog` (middle), `JsonViewer` (bottom)
- `ScrapeForm` disabled while `status === running`

### ScrapeForm.tsx

- Dynamic URL list: starts with one input, "Add URL" button appends more, "X" removes
- Topic text input
- Submit button — triggers SSE connection via `api.ts`
- Minimal validation: at least one URL, non-empty topic

### StatusLog.tsx

- Renders `events[]` as a scrollable log
- Each entry: timestamp, status icon, human-readable message
- Color coding:
  - Blue/gray: in-progress (spinner)
  - Green: success (checkmark)
  - Red: failure (X)
  - Purple: agent activity
- Auto-scrolls to latest entry
- Uses shadcn `ScrollArea`, `Badge`

### JsonViewer.tsx

- Renders only when `result` is available
- Collapsible JSON tree view
- Shows error badges for any failed URLs
- Copy-to-clipboard button for the JSON
- Uses shadcn `Card`, `ScrollArea`

### api.ts

- **`scrape(urls: string[], topic: string, onEvent: EventCallback): Promise<void>`**
- Uses `fetch` with `ReadableStream` + `TextDecoder` to consume SSE from `POST /api/scrape` (cannot use `EventSource` — POST not supported)
- Parses SSE text protocol line-by-line (or uses `eventsource-parser` library)
- Calls `onEvent` for each parsed event
- Handles connection errors

### Vite Config

- Proxy `/api` to `http://localhost:3001` in dev mode

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Invalid request body | 400 JSON error (not SSE) |
| All URLs fail to fetch | SSE stream with per-URL failure events, then result with `success: false` |
| Some URLs fail | Partial success — agent processes what succeeded, `errors` array in result |
| Agent exceeds 10 turns | Force termination, return whatever data extracted so far |
| Anthropic API error | SSE error event, stream closes |
| Playwright crash | Caught per-URL, reported as fetch failure |

## Not in Scope (MVP)

- Authentication / authorization
- Database / persistence
- Request queuing / rate limiting
- Caching of results
- Custom schema definitions
- Multi-phase agent logic (designed for, not implemented)
