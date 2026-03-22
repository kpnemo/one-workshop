# Language Alignment Phase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a language detection and topic translation phase to the agent's system prompt so cross-language extraction works correctly.

**Architecture:** Single-file change to the system prompt in `extractor.ts`. The Claude agent itself detects the page language, translates the topic if needed, and uses the translated topic for all tool calls. No new tools, dependencies, or files.

**Tech Stack:** TypeScript, Anthropic SDK (existing)

**Spec:** `docs/superpowers/specs/2026-03-22-language-alignment-design.md`

---

### Task 1: Update SYSTEM_PROMPT with language alignment instructions

**Files:**
- Modify: `server/src/agent/extractor.ts:16-37` (the `SYSTEM_PROMPT` constant)

- [ ] **Step 1: Read the current SYSTEM_PROMPT**

Open `server/src/agent/extractor.ts` and locate the `SYSTEM_PROMPT` constant (lines 16-37). Confirm it starts with `You are a data extraction agent` and ends with `Be thorough but focused. Extract only what's relevant to the topic.` The workflow section (lines 26-31) is where we insert the new step.

- [ ] **Step 2: Edit the SYSTEM_PROMPT to add language alignment as Step 0**

Insert a new section between the tool list and the workflow. The full updated prompt should be:

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
5. Organize findings into a clean, well-structured JSON object
6. Call submit_result with your final JSON

IMPORTANT: Be efficient. Don't follow more than 3 links. Don't call tools redundantly. Once you have enough data, submit the result promptly.

The JSON structure should be inferred from the content — there is no fixed schema. Choose a structure that best represents the data you found. Use descriptive keys, group related data logically, and include source URLs where helpful.

Be thorough but focused. Extract only what's relevant to the topic.`;
```

Key changes from the original:
- Added "language alignment" block between tool list and workflow
- Updated workflow step 1 to reference language alignment
- Renumbered workflow steps (was 1-5, now 1-6)
- Everything else is unchanged

- [ ] **Step 3: Verify the file compiles**

Run: `cd server && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Verify you are on the `develop` branch**

Run: `git branch --show-current`
Expected: `develop`. If on `main`, run `git checkout develop` first. **Never commit to `main`.**

- [ ] **Step 5: Commit**

```bash
git add server/src/agent/extractor.ts
git commit -m "feat: add language alignment phase to agent system prompt

Instructs the agent to detect page language and translate the topic
before extraction, fixing cross-language extraction failures."
```

---

### Task 2: Manual smoke test — same-language (regression check)

**Files:** None (manual test only)

- [ ] **Step 1: Start the dev server**

Run: `pm2 start ecosystem.config.cjs`

- [ ] **Step 2: Test same-language extraction**

In the browser at `http://localhost:5173`:
- Topic: `soccer`
- URL: `https://www.bbc.com/sport/football`
- Submit and verify extraction completes with relevant results
- Check the SSE status stream shows the language detection message (e.g., "Page language: English | Topic language: English | Using: soccer"). Note: status messages are truncated to 200 characters in the UI — verify the detection line is not cut off

- [ ] **Step 3: Verify no regression**

Confirm the agent still extracts relevant content and the workflow completes within the usual number of turns. The language alignment step should be a near-instant no-op for same-language cases.

---

### Task 3: Manual smoke test — cross-language (the fix)

**Files:** None (manual test only)

- [ ] **Step 1: Test English topic + Hebrew page**

In the browser at `http://localhost:5173`:
- Topic: `tennis`
- URL: A Hebrew sports news site (e.g., `https://www.sport5.co.il/tennis`)
- Submit and verify:
  - SSE status shows language detection: "Page language: Hebrew | Topic language: English | Using: טניס"
  - Agent uses translated topic "טניס" in tool calls
  - Extraction returns relevant content (not empty)

- [ ] **Step 2: Test Hebrew topic + English page**

- Topic: `טניס`
- URL: `https://www.bbc.com/sport/tennis`
- Verify agent detects mismatch, translates to "tennis", and extracts correctly

- [ ] **Step 3: Stop dev server**

Run: `pm2 stop all`
