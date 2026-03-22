# Language Alignment Phase — Design Spec

**Date:** 2026-03-22
**Status:** Draft

## Problem

When a user provides a topic in one language (e.g., "tennis" in English) and URLs in a different language (e.g., a Hebrew news site), extraction fails silently. The agent's tools — `search_content`, `classify_relevance`, and `extract_links` — all use substring matching, which returns zero results when the topic language differs from the page content language.

**Example failure:**
- Topic: `"tennis"` (English)
- Page text contains: `"טניס"` (Hebrew for tennis)
- `search_content("tennis")` → 0 matches
- `classify_relevance("tennis")` → score 0, relevance "low"
- Agent concludes no relevant content exists → empty result

## Solution

Add a **language alignment phase** to the existing agent's system prompt. Before extraction begins, the agent:

1. Reads a sample of the first page's text
2. Detects the page language
3. Compares it with the topic language
4. If mismatched: translates the topic into the page language
5. Uses the translated topic for all subsequent tool calls

This requires **no new tools, no new dependencies, and no new files**. Claude's built-in multilingual capabilities handle both detection and translation.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Who detects/translates? | The Claude agent itself | Zero new dependencies; Claude handles 100+ languages natively |
| Per-page or first-page? | First page only | Simpler, fewer tokens; user typically submits same-language URLs |
| Translate results back? | No | Avoids translation artifacts; results stay in source language |
| Where does logic live? | System prompt only | No tool changes, no pipeline changes |

## Changes

### 1. System prompt update (`server/src/agent/extractor.ts`)

Add a "Step 0" to the agent's workflow in `SYSTEM_PROMPT`:

```
Before starting extraction, perform language alignment:
1. From the text already provided above, read the first ~500 characters of the FIRST listed page to detect its language
2. Detect the topic's language
3. If the languages differ, translate the topic into the page's language
4. Report briefly: "Page language: X | Topic language: Y | Using: Z"
5. Use the translated topic for all tool calls — search_content queries, classify_relevance topic parameter, and extract_links filters
6. For extract_links, try BOTH the translated topic and the original topic as filters, since URL hrefs often use a different language than the page text
7. If the translated topic produces zero search results on the first attempt, fall back to the original topic — the translation may have been incorrect

This step costs nothing extra — the page text is already in your context. Do not skip it.
```

### 2. SSE status event for transparency

Emit a `status` event when the agent reports language detection. This happens naturally — the agent's text output is already streamed as `thinking` status events (extractor.ts lines 75-83). No code change needed; the agent's report text will appear in the existing SSE stream.

**Note:** The status message is truncated to 200 characters (extractor.ts line 80). The report format `"Page language: X | Topic language: Y | Using: Z"` is designed to fit within this limit for typical topics. Long multi-word topics may be truncated in the UI but this is cosmetic only — the agent still uses the full translated topic internally.

### 3. No changes to

- Tools (`server/src/agent/tools.ts`) — substring matching works once topic is in the correct language
- Fetcher (`server/src/scraper/fetcher.ts`) — Playwright already handles all Unicode
- Types (`server/src/types.ts`, `client/src/lib/types.ts`) — no new event types needed
- Client (`client/`) — existing status display handles the new message
- Validation (`server/src/routes/scrape.ts`) — no language validation needed at API level

## Token Cost

The language alignment phase adds approximately 100-200 tokens per extraction:
- ~50 tokens for the system prompt addition
- ~50-100 tokens for the agent's detection/translation reasoning
- ~20 tokens for the translated topic

This is negligible relative to the full extraction loop (typically 2000-5000 tokens).

## Edge Cases

| Case | Behavior |
|------|----------|
| Topic and page same language | Agent detects match, skips translation, proceeds normally |
| Topic is already in page language | Same as above — no-op |
| Multiple pages, mixed languages | Uses first page's language for all. Known limitation — if URLs span languages, first page wins. User typically submits same-language URLs. |
| Language detection wrong | Degrades gracefully to current behavior (substring mismatch) |
| Wrong translation (e.g., "Apple" company → "תפוח" fruit) | Agent falls back to original topic if translated topic yields zero results on first search attempt |
| Transliterated terms (e.g., "sushi" in Hebrew) | Agent may keep the original term if it appears as-is in the text |
| Topic has multiple words | Agent translates the full phrase, not word-by-word |
| URL hrefs in different language than page text | Agent tries both original and translated topic for `extract_links` filtering |

## Testing

- Manual test: topic "tennis" + Hebrew sports news URL → should extract relevant content
- Manual test: topic "tennis" + English sports URL → should work as before (no regression)
- Manual test: topic "טניס" + English sports URL → should detect mismatch and translate to English
