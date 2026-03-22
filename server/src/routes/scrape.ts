import { Router, Request, Response } from "express";
import { fetchPages } from "../scraper/fetcher.js";
import { extractData } from "../agent/extractor.js";
import type { StatusEvent, ScrapeResult, SSEEvent } from "../types.js";

export const scrapeRouter = Router();

export function validateScrapeRequest(
  body: unknown
): { valid: true; urls: string[]; topic: string } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body must be a JSON object" };
  }

  const { urls, topic } = body as Record<string, unknown>;

  if (!Array.isArray(urls) || urls.length === 0) {
    return { valid: false, error: "urls must be a non-empty array" };
  }

  for (const url of urls) {
    if (typeof url !== "string") {
      return { valid: false, error: "Each URL must be a string" };
    }
    try {
      new URL(url);
    } catch {
      return { valid: false, error: `Invalid URL format: ${url}` };
    }
  }

  if (typeof topic !== "string" || topic.trim().length === 0) {
    return { valid: false, error: "topic must be a non-empty string" };
  }

  return { valid: true, urls: urls as string[], topic: topic as string };
}

function sendSSE(res: Response, event: SSEEvent): void {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

scrapeRouter.post("/scrape", async (req: Request, res: Response) => {
  const validation = validateScrapeRequest(req.body);

  if (!validation.valid) {
    console.log(`[scrape] 400 Bad Request: ${validation.error}`);
    res.status(400).json({ success: false, error: validation.error });
    return;
  }

  const { urls, topic } = validation;
  console.log(`[scrape] POST /api/scrape topic="${topic}" urls=${urls.length}`);

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const onStatus = (event: StatusEvent) => {
    sendSSE(res, { type: "status", data: event });
  };

  try {
    const fetchResults = await fetchPages(urls, onStatus);

    const successfulPages = fetchResults.filter((r) => r.success === true);
    const errors = fetchResults
      .filter((r) => !r.success)
      .map((r) => {
        if (!r.success) return { url: r.url, error: r.error };
        throw new Error("unreachable");
      });

    if (successfulPages.length === 0) {
      const result: ScrapeResult = {
        success: false,
        topic,
        urls,
        data: null,
        errors,
      };
      sendSSE(res, { type: "result", data: result });
      res.end();
      return;
    }

    const pages = successfulPages.map((p) => {
      if (p.success) return { url: p.url, html: p.html, text: p.text, title: p.title };
      throw new Error("unreachable");
    });

    console.log(`[scrape] ${successfulPages.length}/${fetchResults.length} pages fetched, starting extraction`);
    const extraction = await extractData(pages, topic, onStatus);
    console.log(`[scrape] Extraction complete, data=${extraction.data ? "yes" : "null"} warning=${extraction.warning || "none"}`);

    const result: ScrapeResult = {
      success: true,
      topic,
      urls: pages.map((p) => p.url),
      data: extraction.data,
      warning: extraction.warning,
      errors,
    };

    sendSSE(res, { type: "result", data: result });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error(`[scrape] ERROR:`, err instanceof Error ? err.stack || err.message : err);
    sendSSE(res, { type: "error", data: { phase: "agent", error: errorMessage } });
  } finally {
    res.end();
  }
});
