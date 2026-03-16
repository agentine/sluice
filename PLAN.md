# Sluice — Drop-in Replacement for Bottleneck

## Overview

**Package:** `@agentine/sluice`
**Replaces:** [bottleneck](https://github.com/SGrondin/bottleneck) (~4.4M weekly npm downloads, 2,000 GitHub stars, 1,002+ dependents, single maintainer SGrondin, last release v2.19.5 in 2019 — 7 years ago, last commit Dec 2022, 75 open issues, 14 unmerged PRs, MIT license)
**Language:** Node.js (TypeScript)
**License:** MIT

## Why

Bottleneck is a widely-used task scheduler and rate limiter for Node.js. It has been effectively abandoned:

- Last npm release: 2019 (v2.19.5) — 7 years ago
- Last commit: December 2022 — 3+ years ago
- Maintainer (SGrondin) does not respond to issues, including the direct question "Is bottleneck still maintained?" (#207)
- 75 open issues, 14 unmerged PRs
- Known bugs: Redis 7.x compatibility broken, truncated stack traces, various unresolved issues
- No native ESM support
- No viable drop-in replacement exists (p-queue, p-limit, limiter, express-rate-limit all cover different/partial use cases)

## Scope

Zero-dependency task scheduler and rate limiter for Node.js and the browser with:

### Core Features (bottleneck parity)
1. **Concurrency control** — maxConcurrent setting
2. **Rate limiting** — minTime (minimum time between task starts)
3. **Reservoir** — finite quota of tasks per interval (reservoir, reservoirRefreshInterval, reservoirRefreshAmount, reservoirIncreaseInterval, reservoirIncreaseAmount, reservoirIncreaseMaximum)
4. **Priority queues** — 10 priority levels (0-9), DEFAULT_PRIORITY = 5
5. **Weight** — tasks can consume multiple reservoir units
6. **Penalty/reward** — dynamic adjustment of reservoir
7. **Job lifecycle events** — received, queued, scheduled, executing, done, failed, dropped, depleted, empty, idle, error
8. **Job options** — id, weight, expiration, priority
9. **Wrap** — wrap async functions for automatic rate limiting
10. **Chaining** — chain limiters for multi-level rate limiting
11. **Group** — create keyed limiter instances with shared settings + automatic cleanup

### Improvements over bottleneck
12. **TypeScript-first** — written in TypeScript with accurate generics
13. **ESM + CJS dual package** — native ESM support with CJS fallback
14. **Node.js 18+** — modern baseline
15. **Redis 7.x support** — fix known compatibility bugs
16. **Bottleneck compatibility layer** — `sluice/compat/bottleneck` import for drop-in migration

### Clustering (Redis)
17. **Redis clustering** — distributed rate limiting across Node.js instances via ioredis
18. **Lua scripts** — atomic Redis operations for consistency
19. **Heartbeat** — detect dead instances and reclaim resources

## Architecture

```
src/
  index.ts              — main Sluice class (Limiter)
  group.ts              — Group class (keyed limiter factory)
  queue.ts              — priority queue implementation
  reservoir.ts          — reservoir/quota management
  events.ts             — event emitter mixin
  wrap.ts               — function wrapping utilities
  compat/
    bottleneck.ts       — bottleneck API compatibility shim
  redis/
    index.ts            — Redis connection management
    scripts.ts          — Lua script loader
    lua/                — Lua scripts for atomic operations
```

## Deliverables

1. `@agentine/sluice` npm package
2. Full bottleneck API parity (local mode)
3. Redis clustering support
4. Bottleneck compatibility layer (`sluice/compat/bottleneck`)
5. TypeScript types
6. ESM + CJS dual package
7. Comprehensive test suite
8. Migration guide from bottleneck
