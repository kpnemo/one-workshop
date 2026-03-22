# Generic Output Schema — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a fixed generic output schema to the agent's system prompt so extraction output is deterministic and structured (flat items array with bilingual fields, tags, and entities).

**Architecture:** Prompt-only changes across two files (`extractor.ts` and `tools.ts`). The schema is embedded in the system prompt. Also increases `max_tokens` and injects a server-side timestamp. No new files, no new dependencies.

**Tech Stack:** TypeScript, Anthropic SDK (existing)

**Spec:** `docs/superpowers/specs/2026-03-22-output-schema-design.md`

---

### Task 1: Update SYSTEM_PROMPT with output schema

**Files:**
- Modify: `server/src/agent/extractor.ts:16-48` (the `SYSTEM_PROMPT` constant)

- [ ] **Step 1: Read the current SYSTEM_PROMPT**

Open `server/src/agent/extractor.ts` and locate the `SYSTEM_PROMPT` constant (lines 16-48). Confirm the last content paragraph (line 46) says: `The JSON structure should be inferred from the content — there is no fixed schema. Choose a structure that best represents the data you found. Use descriptive keys, group related data logically, and include source URLs where helpful.`

- [ ] **Step 2: Replace the SYSTEM_PROMPT with the schema-aware version**

Replace the entire `SYSTEM_PROMPT` constant (lines 16-48) with:

```typescript
const SYSTEM_PROMPT = `You are a data extraction agent. Your job is to analyze web page contents and extract all information relevant to a given topic.

You have access to these tools:
- search_content: Search page text for keywords. Use this to find relevant sections.
- extract_structured_data: Pull tables, lists, and structured data from a page's HTML.
- classify_relevance: Check if a piece of text is relevant to the topic.
- extract_links: Find links on a page, optionally filtered by keyword. Use this to discover sub-pages.
- follow_link: Fetch a new URL and add it to your page pool. Use this when you need more data from a linked page.
- submit_result: Submit your final structured JSON result. Call this when done.

Before starting extraction, perform language alignment:
1. From the text already provided above, read the first ~500 characters of the FIRST listed page to detect its language
2. Detect the topic's language
3. If the languages differ, translate the topic into the page's language
4. Report briefly: "Page language: X | Topic language: Y | Using: Z"
5. Use the translated topic for all tool calls — search_content queries, classify_relevance topic parameter, and extract_links filters
6. For extract_links, try BOTH the translated topic and the original topic as filters, since URL hrefs often use a different language than the page text
7. If the translated topic produces zero search results on the first attempt, fall back to the original topic — the translation may have been incorrect
This step costs nothing extra — the page text is already in your context. Do not skip it.

Your workflow:
1. Perform language alignment (above) — detect and translate topic if needed
2. Search for the topic across all pages to understand what's available
3. If the initial pages lack detail, use extract_links to find relevant sub-pages, then follow_link to fetch them
4. Extract structured data from pages that have relevant content
5. Organize findings into items conforming to the output schema below
6. Call submit_result with your final JSON

IMPORTANT: Be efficient. Don't follow more than 3 links. Don't call tools redundantly. Once you have enough data, submit the result promptly.

Your output MUST conform to this schema exactly:
{
  "meta": {
    "source_urls": ["<all URLs scraped>"],
    "languages": ["<BCP 47 codes for each page's language, e.g. he, en>"],
    "topic": "<original topic from user>",
    "topic_translated": "<translated topic from language alignment, or null if same language>",
    "scraped_at": "<copy the timestamp from the user message verbatim>"
  },
  "items": [
    {
      "id": "<slug from headline + source domain, e.g. sinner-wins-iw-sport5>",
      "category": "<news|event|media|opinion|profile|announcement|other>",
      "headline": "<original language>",
      "headline_en": "<English translation, or null if already English>",
      "summary": "<brief summary in original language, or null>",
      "summary_en": "<English translation of summary, or null if already English>",
      "source_url": "<URL where found, or null>",
      "published_at": "<date as found on site, or null>",
      "tags": ["<namespace:value format, e.g. event:wimbledon, person:sinner, type:result>"],
      "sentiment": "<positive|negative|neutral|null>",
      "entities": [
        { "name": "<entity name>", "type": "<person|organization|tournament|place|product|other>", "role": "<context role or null>" }
      ]
    }
  ]
}

Tag namespaces: topic:, person:, org:, event:, type:, country:. Use lowercase slugs. Additional namespaces allowed.

Rules:
- Create separate items for each piece of content from each source, even if sources cover the same story
- Always include headline_en and summary_en fields (set to null if source is English, don't omit)
- For meta.languages, detect the language of each page in your pool and list all unique BCP 47 codes
- meta.topic_translated comes from your language alignment step
- meta.scraped_at: copy the "Current time" value from the user message verbatim

Be thorough but focused. Extract only what's relevant to the topic.`;
```

Key changes from the current prompt:
- Workflow step 5 updated: "Organize findings into items conforming to the output schema below"
- Replaced the "no fixed schema" paragraph with the full schema definition
- Added conformance rules section
- Added per-page language detection instruction for `meta.languages`
- Preserved all existing sections (tool list, language alignment, workflow, IMPORTANT)

- [ ] **Step 3: Verify the file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify you are on the `develop` branch**

Run: `git branch --show-current`
Expected: `develop`. If on `main`, run `git checkout develop` first. **Never commit to `main`.**

- [ ] **Step 5: Commit**

```bash
git add server/src/agent/extractor.ts
git commit -m "feat: add generic output schema to agent system prompt

Replaces free-form JSON output with a fixed schema: meta object
with source info + flat items array with bilingual fields, tags,
and inline entities."
```

---

### Task 2: Update submit_result tool description

**Files:**
- Modify: `server/src/agent/tools.ts:286-298` (the `submit_result` tool definition)

- [ ] **Step 1: Read the current submit_result definition**

Open `server/src/agent/tools.ts` and locate the `submit_result` entry in `toolDefinitions` (around line 286). Confirm the description says: `"Submit the final structured JSON result. Call this when you have finished extracting and organizing all topic-relevant data. This ends the extraction process."`

- [ ] **Step 2: Update the description and data field description**

Replace the `submit_result` tool definition (lines 285-299) with:

```typescript
  {
    name: "submit_result",
    description:
      "Submit the final JSON result conforming to the required output schema (meta + items array). Call this when you have finished extracting and organizing all topic-relevant data. This ends the extraction process.",
    input_schema: {
      type: "object" as const,
      properties: {
        data: {
          type: "object",
          description: "The final JSON object with 'meta' and 'items' fields conforming to the output schema",
        },
      },
      required: ["data"],
    },
  },
```

Changes:
- Description now references "output schema (meta + items array)"
- Data field description now references "'meta' and 'items' fields"

- [ ] **Step 3: Verify the file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify you are on the `develop` branch**

Run: `git branch --show-current`
Expected: `develop`. If on `main`, run `git checkout develop` first. **Never commit to `main`.**

- [ ] **Step 5: Commit**

```bash
git add server/src/agent/tools.ts
git commit -m "feat: update submit_result tool description to reference output schema"
```

---

### Task 3: Update buildUserMessage + increase max_tokens

**Files:**
- Modify: `server/src/agent/extractor.ts:83` (`max_tokens` value)
- Modify: `server/src/agent/extractor.ts:261-280` (`buildUserMessage` function)

- [ ] **Step 1: Increase max_tokens from 4096 to 16384**

In `server/src/agent/extractor.ts`, find line 83:
```typescript
        max_tokens: 4096,
```

Replace with:
```typescript
        max_tokens: 16384,
```

- [ ] **Step 2: Update buildUserMessage to inject timestamp and reference schema**

In `server/src/agent/extractor.ts`, find the `buildUserMessage` function (line 261). Replace the return statement (line 279) with:

Current (line 279):
```typescript
  return `Topic: ${topic}\n\nExtract all information relevant to "${topic}" from the following web pages. Use your tools to search, extract structured data, and classify relevance. If the pages lack detail, use extract_links and follow_link to explore sub-pages. When done, call submit_result with the final structured JSON.\n\n${pageTexts.join("\n\n")}`;
```

New:
```typescript
  return `Topic: ${topic}\nCurrent time: ${new Date().toISOString()}\n\nExtract all information relevant to "${topic}" from the following web pages. Use your tools to search, extract structured data, and classify relevance. If the pages lack detail, use extract_links and follow_link to explore sub-pages. When done, call submit_result with JSON conforming to the output schema.\n\n${pageTexts.join("\n\n")}`;
```

Changes:
- Added `Current time: ${new Date().toISOString()}` line after Topic
- Changed "final structured JSON" to "JSON conforming to the output schema"

- [ ] **Step 3: Verify the file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify you are on the `develop` branch**

Run: `git branch --show-current`
Expected: `develop`. If on `main`, run `git checkout develop` first. **Never commit to `main`.**

- [ ] **Step 5: Commit**

```bash
git add server/src/agent/extractor.ts
git commit -m "feat: inject timestamp into user message, increase max_tokens to 16384

Timestamp enables accurate meta.scraped_at in output.
Higher max_tokens prevents truncation of structured bilingual output."
```

---

### Task 4: Manual smoke test — single English URL

**Files:** None (manual test only)

- [ ] **Step 1: Start the dev server**

Run: `pm2 start ecosystem.config.cjs` (or `pm2 restart all` if already running)

- [ ] **Step 2: Test single English URL**

In the browser at `http://localhost:5173`:
- Topic: `tennis`
- URL: `https://www.bbc.com/sport/tennis`
- Submit and verify:
  - Output has `meta` object with `source_urls`, `languages: ["en"]`, `topic: "tennis"`, `topic_translated: null`, `scraped_at` (valid ISO timestamp)
  - Output has `items` array with objects containing `id`, `category`, `headline`, `headline_en: null` (English source), `tags`, `entities`
  - No deeply nested freeform structure

- [ ] **Step 3: Check pm2 logs for errors**

Run: `pm2 logs --lines 50 --nostream`
Verify no errors in the agent turns.

---

### Task 5: Manual smoke test — Hebrew URL with bilingual output

**Files:** None (manual test only)

- [ ] **Step 1: Test Hebrew URL**

In the browser at `http://localhost:5173`:
- Topic: `tennis`
- URL: `https://www.sport5.co.il`
- Submit and verify:
  - Language alignment detects Hebrew, translates topic to "טניס"
  - `meta.languages: ["he"]`, `meta.topic_translated: "טניס"`
  - Items have `headline` in Hebrew + `headline_en` with English translation
  - Items have `summary_en` with English translation
  - Tags use correct namespaces (e.g., `event:`, `person:`, `type:`)

- [ ] **Step 2: Stop dev server**

Run: `pm2 stop all`
