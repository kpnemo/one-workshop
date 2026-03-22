# AI Web Scraper

A full-stack web scraping service that takes any URLs and a topic, scrapes the pages using a headless browser, and uses an AI agent to extract only the topic-relevant information as structured JSON.

## How It Works

1. You provide one or more URLs and a topic (e.g., "soccer")
2. The server fetches all pages in parallel using Playwright
3. A Claude AI agent analyzes the content using tools — searching for keywords, extracting tables and lists, following links to sub-pages when needed
4. The agent dynamically structures the extracted data into JSON — no hardcoded schema
5. The frontend shows live execution status as each step happens via Server-Sent Events

## Stack

- **Frontend**: React, Vite, shadcn/ui, TypeScript
- **Backend**: Node.js, Express, TypeScript
- **Scraping**: Playwright (headless Chromium)
- **AI**: Anthropic SDK (Claude Sonnet) with tool-use agent loop
- **Streaming**: Server-Sent Events (SSE)

## Setup

```bash
# Install dependencies
cd server && npm install && npx playwright install chromium && cd ..
cd client && npm install && cd ..
npm install

# Set your Anthropic API key
echo "ANTHROPIC_API_KEY=sk-ant-..." > .env
```

## Running

**With PM2 (recommended):**
```bash
pm2 start ecosystem.config.cjs
pm2 logs          # watch output
pm2 stop all      # stop
```

**Without PM2:**
```bash
npm run dev
```

Open **http://localhost:5173**

## Agent Tools

The AI agent has 6 tools it can use to analyze pages:

| Tool | Purpose |
|------|---------|
| `search_content` | Search page text for keywords |
| `extract_structured_data` | Pull tables and lists from HTML |
| `classify_relevance` | Score how relevant a text chunk is to the topic |
| `extract_links` | Find links on a page, filtered by keyword |
| `follow_link` | Navigate to a sub-page for more data (max 3 per session) |
| `submit_result` | Submit the final structured JSON |

The agent decides which tools to use and in what order based on the content it finds. It can follow links to sub-pages when the initial URLs don't have enough detail.

## Testing

```bash
cd server && npm test
```

## Project Structure

```
├── client/          # React + Vite frontend
│   └── src/
│       ├── components/   # ScrapeForm, StatusLog, JsonViewer
│       └── lib/          # API client, types
├── server/          # Express + TypeScript backend
│   ├── src/
│   │   ├── agent/        # Claude agent loop + tool implementations
│   │   ├── scraper/      # Playwright page fetcher
│   │   └── routes/       # POST /api/scrape SSE endpoint
│   └── tests/
└── docs/            # Design spec and implementation plan
```
