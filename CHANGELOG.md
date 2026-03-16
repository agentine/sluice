# Changelog

## 0.1.0 — 2026-03-16

Initial release.

- Core `Sluice` limiter: `maxConcurrent`, `minTime`, reservoir (refresh/increase), priority queue (10 levels), weight, penalty/reward, lifecycle events, job expiration, `wrap()`, `chain()`, `stop()`/`disconnect()`, `updateSettings()`
- Scheduling strategies: `LEAK`, `OVERFLOW`, `BLOCK`
- `Group` class with keyed limiter factory, idle cleanup, `created` event
- Redis clustering via `RedisConnection` (ioredis): Lua-based atomic operations, dead instance detection, heartbeat, Redis 7.x compatible
- Bottleneck compatibility layer at `@agentine/sluice/compat/bottleneck` with migration guide
- ESM + CJS dual package build
- TypeScript-first, zero runtime dependencies (ioredis optional peer dep)
- 119 tests across 7 test suites
