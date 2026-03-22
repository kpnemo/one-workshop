# Suggested Commands

## Development
```bash
pm2 start ecosystem.config.cjs    # Start server (3001) + client (5173)
pm2 logs                          # Tail logs
pm2 restart all                   # Restart after changes
pm2 stop all                      # Stop everything
npm run dev                       # Alternative: concurrently runs both
```

## Testing (server only)
```bash
cd server && npm test                              # Run all tests
cd server && npx vitest run tests/tools.test.ts    # Run specific test file
cd server && npm run test:watch                    # Watch mode
```

## Building
```bash
npm run build    # Builds server (tsc) then client (vite)
```

## Linting (client only)
```bash
cd client && npm run lint    # ESLint
```

## System Utilities (macOS / Darwin)
```bash
git status / git log / git diff   # Version control
ls / find / grep                  # File system navigation
```
