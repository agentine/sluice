# @agentine/sluice

Task scheduler and rate limiter for Node.js — drop-in replacement for [bottleneck](https://github.com/SGrondin/bottleneck).

## Features

- **Concurrency control** — limit parallel tasks with `maxConcurrent`
- **Rate limiting** — enforce minimum time between task starts with `minTime`
- **Reservoir** — finite quota with auto-refresh and incremental increase
- **Priority queues** — 10 priority levels (0-9), weighted tasks
- **Job lifecycle events** — received, queued, scheduled, executing, done, failed, dropped, depleted, empty, idle
- **Group** — keyed limiter instances with shared settings and idle cleanup
- **Redis clustering** — distributed rate limiting via ioredis (optional)
- **Bottleneck compatibility** — drop-in migration path via `@agentine/sluice/compat/bottleneck`
- **TypeScript-first** — accurate types with generics
- **ESM + CJS** — dual package, native ES module support
- **Zero runtime dependencies** — ioredis is an optional peer dependency for clustering

## Install

```bash
npm install @agentine/sluice
```

## Quick Start

```typescript
import { Sluice } from "@agentine/sluice";

const limiter = new Sluice({
  maxConcurrent: 5,
  minTime: 200,
});

const result = await limiter.schedule(() => fetch("https://api.example.com/data"));
```

## API

### Constructor Options

```typescript
const limiter = new Sluice({
  maxConcurrent: 5,       // Max parallel jobs (null = unlimited)
  minTime: 200,           // Min ms between job starts
  highWater: 100,         // Max queued jobs before strategy kicks in
  strategy: Strategy.LEAK, // LEAK, OVERFLOW, or BLOCK
  rejectOnDrop: true,     // Reject promise when job is dropped
  reservoir: 50,          // Finite job quota
  reservoirRefreshInterval: 60000,  // Reset reservoir every N ms
  reservoirRefreshAmount: 50,       // Reset reservoir to this value
  reservoirIncreaseInterval: 1000,  // Increase reservoir every N ms
  reservoirIncreaseAmount: 1,       // Increase by this amount
  reservoirIncreaseMaximum: 100,    // Max reservoir value
  id: "my-limiter",       // Identifier for debugging
  trackDoneStatus: false, // Track completed job count
});
```

### Methods

```typescript
// Schedule a job (returns promise with result)
const result = await limiter.schedule(async () => doWork());
const result = await limiter.schedule({ priority: 1, weight: 2 }, async () => doWork());

// Wrap a function for automatic rate limiting
const limited = limiter.wrap(fetch);
const data = await limited("https://api.example.com");

// Chain limiters (multi-level rate limiting)
const perEndpoint = new Sluice({ maxConcurrent: 5 });
const global = new Sluice({ maxConcurrent: 20 });
perEndpoint.chain(global);

// Reservoir management
await limiter.currentReservoir();      // Get current count
await limiter.incrementReservoir(10);  // Add to reservoir

// Status
await limiter.running();   // Currently executing jobs
await limiter.queued();    // Jobs waiting in queue
await limiter.done();      // Completed jobs (if trackDoneStatus)
await limiter.empty();     // True if no running or queued jobs

// Update settings at runtime
limiter.updateSettings({ maxConcurrent: 10 });

// Stop
limiter.stop({ dropWaitingJobs: true });
limiter.disconnect();
```

### Events

```typescript
limiter.on("executing", (info) => console.log("Job started:", info.options.id));
limiter.on("done", (info) => console.log("Job completed"));
limiter.on("failed", (error, info) => console.error("Job failed:", error));
limiter.on("depleted", () => console.log("Reservoir exhausted"));
limiter.on("idle", () => console.log("All jobs complete"));
```

### Job Options

```typescript
await limiter.schedule({
  id: "job-1",        // Job identifier
  priority: 1,        // 0-9, lower = higher priority (default: 5)
  weight: 2,          // Reservoir units consumed (default: 1)
  expiration: 5000,   // Timeout in ms (default: null)
}, async () => doWork());
```

### Strategy

```typescript
import { Strategy } from "@agentine/sluice";

Strategy.LEAK      // 1 — drop lowest priority job when at highWater
Strategy.OVERFLOW  // 2 — drop new incoming job when at highWater
Strategy.BLOCK     // 3 — pause processing when at highWater
```

### Group

```typescript
import { Group } from "@agentine/sluice";

const group = new Group({
  maxConcurrent: 5,
  minTime: 200,
  timeout: 60000, // Auto-delete idle limiters after 60s
});

const userLimiter = group.key("user-123");
await userLimiter.schedule(() => fetchUserData());

group.on("created", (limiter, key) => console.log("New limiter:", key));
group.deleteKey("user-123");
```

## Migrating from Bottleneck

See [MIGRATION.md](MIGRATION.md) for a complete guide.

**Quick version:**

```diff
- import Bottleneck from "bottleneck";
+ import Bottleneck from "@agentine/sluice/compat/bottleneck";
```

No other code changes needed.

## License

MIT
