import Anthropic from "@anthropic-ai/sdk";
import { chromium } from "playwright";
import {
  toolDefinitions,
  executeSearchContent,
  executeExtractStructuredData,
  executeClassifyRelevance,
  executeExtractLinks,
} from "./tools.js";
import type { PageContent, StatusCallback } from "../types.js";

const MAX_TURNS = 20;
const MODEL = "claude-sonnet-4-20250514";
const MAX_CONTENT_CHARS = 100_000;

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

export async function extractData(
  pages: PageContent[],
  topic: string,
  onStatus: StatusCallback
): Promise<{ data: Record<string, unknown> | null; warning?: string }> {
  const client = new Anthropic();
  // Mutable page pool — follow_link adds to this
  const pagePool = [...pages];

  onStatus({ phase: "agent", state: "started" });
  console.log(`[agent] Starting extraction: topic="${topic}" pages=${pages.length}`);

  const userContent = buildUserMessage(pages, topic);
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: userContent }];

  let result: Record<string, unknown> | null = null;
  let turns = 0;
  let linksFollowed = 0;

  while (turns < MAX_TURNS) {
    turns++;

    onStatus({
      phase: "agent",
      state: "thinking",
      message: `Turn ${turns}/${MAX_TURNS}...`,
    });
    console.log(`[agent] Turn ${turns}/${MAX_TURNS}`);

    let response: Anthropic.Message;
    try {
      response = await client.messages.create({
        model: MODEL,
        max_tokens: 16384,
        system: SYSTEM_PROMPT,
        tools: toolDefinitions as Anthropic.Tool[],
        messages,
      });
    } catch (err) {
      console.error(`[agent] API error on turn ${turns}:`, err instanceof Error ? err.stack || err.message : err);
      throw err;
    }

    // Extract any text blocks as agent "thinking"
    for (const block of response.content) {
      if (block.type === "text" && block.text.trim()) {
        onStatus({
          phase: "agent",
          state: "thinking",
          message: block.text.trim().slice(0, 200),
        });
      }
    }

    const toolUseBlocks = response.content.filter(
      (block): block is Anthropic.ToolUseBlock => block.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) {
      onStatus({
        phase: "agent",
        state: "thinking",
        message: "Agent stopped without submitting result",
      });
      break;
    }

    const toolResults: Anthropic.ToolResultBlockParam[] = [];

    for (const toolUse of toolUseBlocks) {
      const input = toolUse.input as Record<string, unknown>;

      onStatus({
        phase: "agent",
        state: "tool_call",
        tool: toolUse.name,
        input,
      });

      let toolResult: unknown;
      let summary: string;

      if (toolUse.name === "follow_link") {
        const followUrl = input.url as string;
        if (linksFollowed >= 3) {
          toolResult = { error: "Maximum 3 links can be followed per session" };
          summary = `Blocked — already followed ${linksFollowed} links`;
        } else if (pagePool.some((p) => p.url === followUrl)) {
          toolResult = { error: "Page already in pool", url: followUrl };
          summary = `Skipped — already have ${followUrl}`;
        } else {
          try {
            const newPage = await fetchSingleUrl(followUrl);
            pagePool.push(newPage);
            linksFollowed++;
            toolResult = {
              success: true,
              url: newPage.url,
              title: newPage.title,
              textLength: newPage.text.length,
            };
            summary = `Fetched "${newPage.title}" (${newPage.text.length} chars)`;
          } catch (err) {
            const error = err instanceof Error ? err.message : String(err);
            toolResult = { error, url: followUrl };
            summary = `Failed to fetch: ${error.slice(0, 100)}`;
          }
        }
      } else if (toolUse.name === "submit_result") {
        result = (input as { data: Record<string, unknown> }).data;
        toolResult = { accepted: true };
        summary = "Result submitted";
      } else {
        toolResult = executeTool(pagePool, toolUse.name, input);
        summary = summarizeToolResult(toolUse.name, input, toolResult);
      }

      console.log(`[agent] ${toolUse.name}: ${summary}`);
      onStatus({ phase: "agent", state: "tool_result", tool: toolUse.name, summary });

      toolResults.push({
        type: "tool_result",
        tool_use_id: toolUse.id,
        content: JSON.stringify(toolResult),
      });
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    if (result !== null) {
      console.log(`[agent] Done in ${turns} turn(s)`);
      onStatus({ phase: "agent", state: "done" });
      return { data: result };
    }
  }

  console.log(`[agent] Exhausted ${MAX_TURNS} turns without result`);
  onStatus({ phase: "agent", state: "done" });

  if (result === null) {
    return {
      data: null,
      warning: `Agent did not complete extraction within ${MAX_TURNS} turns`,
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
    case "extract_links":
      return executeExtractLinks(pages, input as { url: string; query?: string });
    default:
      return { error: `Unknown tool: ${name}` };
  }
}

function summarizeToolResult(
  tool: string,
  input: Record<string, unknown>,
  result: unknown
): string {
  if (tool === "search_content") {
    const r = result as Array<unknown>;
    const query = input.query as string;
    return `Found ${r.length} match(es) for "${query}"`;
  }
  if (tool === "extract_structured_data") {
    const r = result as { tables: unknown[][]; lists: unknown[][] };
    return `${r.tables.length} table(s), ${r.lists.length} list(s)`;
  }
  if (tool === "classify_relevance") {
    const r = result as { relevance: string; score: number };
    return `Relevance: ${r.relevance} (score: ${r.score})`;
  }
  if (tool === "extract_links") {
    const r = result as Array<unknown>;
    const query = input.query ? ` for "${input.query}"` : "";
    return `Found ${r.length} link(s)${query}`;
  }
  return JSON.stringify(result).slice(0, 100);
}

async function fetchSingleUrl(url: string): Promise<PageContent> {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30_000 });
    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText);
    const title = await page.title();
    return { url, html, text, title };
  } finally {
    await context.close();
    await browser.close();
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

  return `Topic: ${topic}\nCurrent time: ${new Date().toISOString()}\n\nExtract all information relevant to "${topic}" from the following web pages. Use your tools to search, extract structured data, and classify relevance. If the pages lack detail, use extract_links and follow_link to explore sub-pages. When done, call submit_result with JSON conforming to the output schema.\n\n${pageTexts.join("\n\n")}`;
}
