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
