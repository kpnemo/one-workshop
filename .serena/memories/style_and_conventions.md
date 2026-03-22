# Code Style and Conventions

## TypeScript
- Strict mode enabled in both server and client
- ESM modules throughout (`"type": "module"`)
- Server targets ES2022, client uses Vite defaults
- Types are duplicated between `server/src/types.ts` and `client/src/lib/types.ts` — must be kept in sync manually

## Server
- Express with async route handlers
- Discriminated unions for SSE event types (`StatusEvent` with phase + state)
- Playwright for browser automation
- Anthropic SDK with tool-use pattern for agent loop

## Client
- React 19 with functional components
- Tailwind CSS v4 with `cn()` utility (clsx + tailwind-merge)
- shadcn/ui component primitives
- Path alias: `@/*` maps to `./src/*`

## Naming
- TypeScript files: camelCase for variables/functions, PascalCase for types/interfaces/components
- File names: camelCase for utilities, PascalCase for React components, kebab-case for UI primitives

## No Shared Package
- No shared types package; types duplicated and manually synchronized
