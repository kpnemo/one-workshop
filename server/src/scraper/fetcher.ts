import { chromium } from "playwright";
import type { FetchResult, StatusCallback } from "../types.js";

const FETCH_TIMEOUT = 30_000;

export async function fetchPages(
  urls: string[],
  onStatus: StatusCallback
): Promise<FetchResult[]> {
  const browser = await chromium.launch({ headless: true });
  try {
    const results = await Promise.allSettled(
      urls.map((url) => fetchSinglePage(browser, url, onStatus))
    );
    return results.map((result, i) => {
      if (result.status === "fulfilled") {
        return result.value;
      }
      const error = result.reason instanceof Error ? result.reason.message : String(result.reason);
      onStatus({ phase: "fetching", url: urls[i], state: "failed", error });
      return { success: false as const, url: urls[i], error };
    });
  } finally {
    await browser.close();
  }
}

async function fetchSinglePage(
  browser: Awaited<ReturnType<typeof chromium.launch>>,
  url: string,
  onStatus: StatusCallback
): Promise<FetchResult> {
  onStatus({ phase: "fetching", url, state: "started" });
  const startTime = Date.now();
  const context = await browser.newContext();
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: FETCH_TIMEOUT });
    const html = await page.content();
    const text = await page.evaluate(() => document.body.innerText);
    const title = await page.title();
    const duration = (Date.now() - startTime) / 1000;
    onStatus({ phase: "fetching", url, state: "done", duration });
    return { success: true, url, html, text, title };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    onStatus({ phase: "fetching", url, state: "failed", error });
    return { success: false, url, error };
  } finally {
    await context.close();
  }
}
