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
        continue;
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

  if (matchCount >= 3) {
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

// --- Extract links from HTML ---

export function executeExtractLinks(
  pages: PageContent[],
  input: { url: string; query?: string }
): Array<{ href: string; text: string }> {
  const page = pages.find((p) => p.url === input.url);
  if (!page) return [];

  const linkRegex = /<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const links: Array<{ href: string; text: string }> = [];
  let match;

  while ((match = linkRegex.exec(page.html)) !== null) {
    let href = match[1];
    const text = match[2].replace(/<[^>]*>/g, "").trim();
    if (!text || href.startsWith("#") || href.startsWith("javascript:")) continue;

    // Resolve relative URLs
    try {
      href = new URL(href, page.url).toString();
    } catch {
      continue;
    }

    if (input.query) {
      const q = input.query.toLowerCase();
      if (!text.toLowerCase().includes(q) && !href.toLowerCase().includes(q)) continue;
    }

    links.push({ href, text });
  }

  // Deduplicate by href
  const seen = new Set<string>();
  return links.filter((l) => {
    if (seen.has(l.href)) return false;
    seen.add(l.href);
    return true;
  });
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
    name: "extract_links",
    description:
      "Extract all links from a page's HTML. Optionally filter by a search query to find links related to a specific topic. Use this to discover sub-pages worth following.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The URL of the page to extract links from" },
        query: {
          type: "string",
          description: "Optional: filter links whose text or href contains this query",
        },
      },
      required: ["url"],
    },
  },
  {
    name: "follow_link",
    description:
      "Navigate to a new URL and fetch its content. Use this when the initial pages don't have enough information about the topic, and you found a promising link via extract_links. The new page content becomes available to all other tools.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: { type: "string", description: "The URL to fetch and add to the page pool" },
      },
      required: ["url"],
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
