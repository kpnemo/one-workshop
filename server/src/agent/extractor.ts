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

Your workflow:
1. Search for the topic across all pages to understand what's available
2. If the initial pages lack detail, use extract_links to find relevant sub-pages, then follow_link to fetch them
3. Extract structured data from pages that have relevant content
4. Organize findings into a clean, well-structured JSON object
5. Call submit_result with your final JSON

IMPORTANT: Be efficient. Don't follow more than 3 links. Don't call tools redundantly. Once you have enough data, submit the result promptly.

The JSON structure should be inferred from the content — there is no fixed schema. Choose a structure that best represents the data you found. Use descriptive keys, group related data logically, and include source URLs where helpful.

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

    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: toolDefinitions as Anthropic.Tool[],
      messages,
    });

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
      onStatus({ phase: "agent", state: "done" });
      return { data: result };
    }
  }

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

  return `Topic: ${topic}\n\nExtract all information relevant to "${topic}" from the following web pages. Use your tools to search, extract structured data, and classify relevance. If the pages lack detail, use extract_links and follow_link to explore sub-pages. When done, call submit_result with the final structured JSON.\n\n${pageTexts.join("\n\n")}`;
}
