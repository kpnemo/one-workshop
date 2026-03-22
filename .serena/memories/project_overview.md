# Project Overview: one-workshop

AI-powered web scraper service that takes multiple URLs + a topic, scrapes pages with Playwright, uses a Claude tool-use agent to extract topic-relevant information, and streams live status to a React frontend via SSE.

## Tech Stack

- **Monorepo** with two packages: `client/` and `server/` (no shared packages)
- **Server**: Express + TypeScript, Playwright for scraping, Anthropic SDK for Claude agent
  - Runtime: Node.js with ESM modules (`"type": "module"`)
  - Build: `tsc` to `dist/`
  - Dev: `tsx watch`
  - Test: Vitest
  - Model: `claude-sonnet-4-20250514`
- **Client**: React 19 + Vite + TypeScript + Tailwind CSS v4 + shadcn components
  - UI libraries: Base UI, Lucide icons, class-variance-authority, tailwind-merge
  - Path alias: `@/*` → `./src/*`
- **Process management**: pm2 via `ecosystem.config.cjs`
- **Ports**: Server on 3001, Client (Vite) on 5173 with proxy for `/api`

## Architecture

### Data Flow
```
Client POST /api/scrape {urls[], topic}
  → Express validates, sets SSE headers
  → Playwright fetches all URLs in parallel
    ← SSE: fetching started/done/failed per URL
  → Agent extractor runs Claude tool-use loop (max 20 turns)
    ← SSE: thinking, tool_call, tool_result per turn
  → Agent calls submit_result with final JSON
    ← SSE: result event with extracted data
```

### SSE Streaming
POST endpoint returns SSE stream (not JSON). Client parses with `fetch` + `ReadableStream` (not EventSource, which doesn't support POST). Three event types: `status`, `error`, `result`.

### Agent Tools (6 total)
- `search_content` — substring search across page text
- `extract_structured_data` — regex HTML table/list extraction
- `classify_relevance` — keyword density heuristic
- `extract_links` — find links on a page, optionally filtered
- `follow_link` — fetch new URL mid-session (max 3, launches new browser)
- `submit_result` — terminates agent loop with final JSON

### Key Files
- `server/src/types.ts` — Server-side type definitions
- `client/src/lib/types.ts` — Client-side type definitions (must be kept in sync manually)
- `server/src/agent/extractor.ts` — Claude agent loop
- `server/src/agent/tools.ts` — Tool definitions and handlers
- `server/src/scraper/fetcher.ts` — Playwright page fetching
- `server/src/routes/scrape.ts` — SSE endpoint
- `client/src/lib/api.ts` — SSE client parsing
- `client/src/App.tsx` — Main app component

### Codebase Structure
```
server/src/
  index.ts          — Express app entry point (port 3001)
  types.ts          — Shared type definitions
  routes/scrape.ts  — POST /api/scrape SSE endpoint
  agent/extractor.ts — Claude tool-use agent loop
  agent/tools.ts    — Tool definitions and handlers
  scraper/fetcher.ts — Playwright page fetcher
server/tests/       — Vitest test files

client/src/
  main.tsx          — React entry point
  App.tsx           — Main app with form, status log, JSON viewer
  index.css         — Global styles (Tailwind)
  lib/api.ts        — SSE fetch client
  lib/types.ts      — Client-side type definitions
  lib/utils.ts      — Utility functions (cn helper)
  components/       — ScrapeForm, StatusLog, JsonViewer
  components/ui/    — shadcn primitives (card, button, input, badge, scroll-area)
```

## Environment
- `ANTHROPIC_API_KEY` in root `.env` (loaded by server via dotenv)
- Server loads `.env` from `path.resolve(__dirname, "../../.env")` relative to `server/src/`
