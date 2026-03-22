# Task Completion Checklist

When a task is completed, verify the following:

1. **Type sync**: If types in `server/src/types.ts` or `client/src/lib/types.ts` were changed, ensure the other file is updated to match
2. **Tests pass**: Run `cd server && npm test` to verify server tests
3. **Lint**: Run `cd client && npm run lint` for client-side changes
4. **Build**: Run `npm run build` to verify both server and client compile
5. **No secrets committed**: Ensure `.env` and credentials are not staged
