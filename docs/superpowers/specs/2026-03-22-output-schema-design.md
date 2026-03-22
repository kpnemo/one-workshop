# Generic Output Schema — Design Spec

**Date:** 2026-03-22
**Status:** Draft

## Problem

The agent currently produces free-form JSON with no fixed schema ("The JSON structure should be inferred from the content"). When scraping multiple sites, the output is deeply nested, inconsistent, and hard to consume programmatically. Different runs for the same topic produce different structures.

**Example of current behavior:**
- Topic: "tennis", 2 Hebrew sports sites → deeply nested object with `tennis_content.israeli_tennis_administration.federation_chairman.recent_decisions...` — unpredictable, non-deterministic structure.

## Solution

Replace the "no fixed schema" instruction with a **generic output schema** hardcoded in the system prompt. The schema uses a flat `items` array with typed categories, bilingual text fields, and inline entities. It works for any topic (not just tennis).

**Approach:** Prompt-only. The schema is defined in the system prompt text. No runtime validation, no new dependencies. Claude conforms to the schema via instruction following.

## The Schema

```json
{
  "meta": {
    "source_urls": ["https://sport5.co.il", "https://one.co.il"],
    "languages": ["he"],
    "topic": "tennis",
    "topic_translated": "טניס",
    "scraped_at": "2026-03-22T16:30:00Z"
  },
  "items": [
    {
      "id": "sinner-wins-indian-wells-sport5",
      "category": "news",
      "headline": "סינר ניצח את אלקרס באינדיאן וולס",
      "headline_en": "Sinner beats Alcaraz at Indian Wells",
      "summary": "האיטלקי ניצח בסט שלישי מכריע...",
      "summary_en": "The Italian won in a decisive third set...",
      "source_url": "https://sport5.co.il/article/123",
      "published_at": "2026-03-20",
      "tags": ["event:indian_wells", "person:sinner", "type:result"],
      "sentiment": "neutral",
      "entities": [
        { "name": "Jannik Sinner", "type": "person", "role": "winner" },
        { "name": "Carlos Alcaraz", "type": "person", "role": "loser" },
        { "name": "Indian Wells", "type": "tournament" }
      ]
    }
  ]
}
```

### Schema Field Reference

**`meta` (required object):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| source_urls | string[] | yes | All URLs that were scraped |
| languages | string[] | yes | BCP 47 language tags detected (e.g., ["he", "en"]) |
| topic | string | yes | Original topic as provided by user |
| topic_translated | string\|null | yes | Translated topic (null if same language) |
| scraped_at | string | yes | ISO 8601 timestamp — injected server-side via `buildUserMessage`, agent copies it verbatim |

**`items` (required array of objects):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| id | string | yes | Best-effort slug derived from headline + source domain (e.g., "sinner-wins-iw-sport5"). Not guaranteed unique — consumers must not rely on uniqueness as a primary key. |
| category | string | yes | Content type: "news", "event", "media", "opinion", "profile", "announcement", or other |
| headline | string | yes | Original language headline |
| headline_en | string\|null | yes | English translation, or null if source is already English. Always include the field (set to null, don't omit). |
| summary | string\|null | no | Brief summary in original language |
| summary_en | string\|null | yes | English translation of summary, or null if source is already English. Always include the field. |
| source_url | string\|null | no | URL where this item was found |
| published_at | string\|null | no | Date string as found on site (ISO 8601 or free-form) |
| tags | string[] | yes | Controlled vocabulary tags in `namespace:value` format |
| sentiment | string\|null | no | "positive", "negative", or "neutral" |
| entities | object[] | yes | People, organizations, events, places mentioned in this item |

**`entities` (per-item array):**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| name | string | yes | Entity name |
| type | string | yes | "person", "organization", "tournament", "place", "product", or other |
| role | string\|null | no | Context-specific role (e.g., "winner", "chairman", "host city") |

### Tag Namespaces

Tags use `namespace:value` format with lowercase slugs. Standard namespaces:
- `topic:` — sub-topics (e.g., `topic:coaching`, `topic:rankings`)
- `person:` — people mentioned (e.g., `person:sinner`, `person:alcaraz`)
- `org:` — organizations (e.g., `org:atp`, `org:ita`)
- `event:` — events/tournaments (e.g., `event:indian_wells`, `event:davis_cup`)
- `type:` — content type (e.g., `type:result`, `type:interview`, `type:opinion`)
- `country:` — country context (e.g., `country:israel`, `country:italy`)

Agent may use additional namespaces as appropriate for the topic.

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Schema scope | One generic schema for all topics | Simpler than per-topic schemas; categories and tags provide topic-specific structure |
| Schema location | Hardcoded in system prompt | No new files, no runtime loading, easy to update |
| Enforcement | Prompt instruction only | Claude follows JSON schemas reliably; no runtime validation needed (can add later) |
| Structure | Flat items array with categories | More flexible than multi-section; easy to filter/query |
| Bilingual | headline_en / summary_en fields | Works with language alignment feature; preserves original + provides English |
| Deduplication | No dedup — keep all items | Each source produces its own items, even for same story. Simple, no merge logic. |
| Entities | Inline per-item | Shows who/what in context; avoids cross-referencing between sections |
| item_count | Dropped from meta | Redundant (derivable from `items.length`); LLMs reliably get computed counts wrong |
| scraped_at | Server-injected timestamp | Agent has no clock; timestamp injected into user message, agent copies verbatim |
| id uniqueness | Best-effort, not guaranteed | Agent-generated slugs may collide; consumers must not treat as primary key |
| max_tokens | Increased to 16384 | Structured output with bilingual fields needs more room than freeform JSON |

## Changes

### 1. System prompt update (`server/src/agent/extractor.ts`)

**Replace** the "no fixed schema" paragraph (currently: "The JSON structure should be inferred from the content — there is no fixed schema. Choose a structure that best represents the data you found. Use descriptive keys, group related data logically, and include source URLs where helpful.") with the schema definition and conformance instructions.

The new text should include:
- The complete schema structure with field descriptions
- Instruction: "Your output MUST conform to this schema exactly"
- Instruction: "Create separate items for each source, even if they cover the same story"
- Instruction: "Set headline_en and summary_en to null if the source is already in English"
- Instruction: "meta.topic_translated comes from your language alignment step — use the translated topic or null if no translation was needed"

### 2. Update `submit_result` tool description (`server/src/agent/tools.ts`)

Current description: "Submit the final structured JSON result. Call this when you have finished extracting and organizing all topic-relevant data."

New: "Submit the final JSON result conforming to the required output schema (meta + items array). Call this when you have finished extracting and organizing all topic-relevant data."

### 3. Update user message (`server/src/agent/extractor.ts` — `buildUserMessage`)

Current: "When done, call submit_result with the final structured JSON."

New: "When done, call submit_result with JSON conforming to the output schema."

Also inject the current timestamp into the user message so the agent can copy it into `meta.scraped_at`:
```
Current time: ${new Date().toISOString()}
```

### 4. Increase `max_tokens` (`server/src/agent/extractor.ts`)

Current: `max_tokens: 4096`

New: `max_tokens: 16384`

The structured schema with bilingual fields and entities produces significantly more tokens per item than freeform JSON. At 4096 tokens, moderate scrapes (12+ items) will be truncated mid-JSON, resulting in corrupted output. 16384 provides comfortable headroom.

### 5. Add per-page language detection instruction to system prompt

The language alignment step (from the previous feature) only detects the first page's language. The `meta.languages` field needs all unique languages. Add an instruction to the system prompt:

"For meta.languages, detect the language of each page in your pool and list all unique BCP 47 codes."

### 6. No changes to

- Tool implementations (`tools.ts` logic) — only the `submit_result` description text changes
- Types (`types.ts`) — `ScrapeResult.data` remains `Record<string, unknown> | null`
- Client — `JsonViewer` displays whatever JSON comes back
- Fetcher, validation, SSE events — untouched

## Token Cost

The schema definition in the system prompt adds approximately 300-400 tokens. This is a one-time cost per extraction session (system prompt is sent once). The agent's output tokens may slightly increase due to bilingual fields and structured tags, but the deterministic structure reduces wasted tokens on the agent "deciding" a structure.

## Edge Cases

| Case | Behavior |
|------|----------|
| No content found for topic | `items` is empty array `[]` |
| Single URL, single language | Works normally, `meta.source_urls` has one entry, `meta.languages` has one entry |
| Multiple URLs, same language | All items tagged with their respective `source_url` |
| Multiple URLs, mixed languages | Items in their source language with _en translations |
| Same-language (English) source | `headline_en` and `summary_en` are null |
| Agent doesn't follow schema perfectly | Graceful degradation — client JsonViewer displays whatever comes back |
| Very large page with many items | Agent extracts up to ~30 items (bounded by max_tokens on response) |

## Testing

- Manual test: single English URL → verify output conforms to schema
- Manual test: single Hebrew URL → verify bilingual fields populated
- Manual test: two URLs (mixed language) → verify both sources produce items, meta has both URLs
- Compare output JSON against schema structure — all required fields present, correct types
