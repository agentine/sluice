# Migrating from Bottleneck to Sluice

## Quick Start

### 1. Install

```bash
npm uninstall bottleneck
npm install @agentine/sluice
```

### 2. Update Imports

**Option A — Use the compatibility layer (zero code changes):**

```diff
- import Bottleneck from "bottleneck";
+ import Bottleneck from "@agentine/sluice/compat/bottleneck";
```

Everything works exactly the same — constructor options, methods, events, Strategy enum, Group class.

**Option B — Use the native Sluice API:**

```diff
- import Bottleneck from "bottleneck";
+ import { Sluice, Strategy, Group } from "@agentine/sluice";
```

Then rename `new Bottleneck(...)` to `new Sluice(...)`.

### 3. Done

No further changes needed for local (non-Redis) usage.

---

## API Compatibility

### Constructor Options

All bottleneck constructor options are supported with identical names and defaults:

| Option | Default | Notes |
|--------|---------|-------|
| `maxConcurrent` | `null` (unlimited) | Same |
| `minTime` | `0` | Same |
| `highWater` | `null` (unlimited) | Same |
| `strategy` | `Strategy.LEAK` | Same values: LEAK=1, OVERFLOW=2, BLOCK=3 |
| `rejectOnDrop` | `true` | Same |
| `trackDoneStatus` | `false` | Same |
| `id` | `"default"` | Same |
| `reservoir` | `null` | Same |
| `reservoirRefreshInterval` | `null` | Same |
| `reservoirRefreshAmount` | `null` | Same |
| `reservoirIncreaseInterval` | `null` | Same |
| `reservoirIncreaseAmount` | `null` | Same |
| `reservoirIncreaseMaximum` | `null` | Same |
| `datastore` | `"local"` | Same |
| `clientOptions` | — | Same (ioredis options) |
| `clusterNodes` | — | Same |
| `timeout` | `null` | Same |
| `heartbeatInterval` | `5000` | Same |

### Methods

All bottleneck methods are supported with identical signatures:

- `schedule([options], fn, ...args)` → `Promise`
- `submit([options], fn, ...args)` → callback-style
- `wrap(fn)` → rate-limited function with `.withOptions()`
- `chain(limiter)` → multi-level rate limiting
- `stop([options])` → stop the limiter
- `disconnect([flush])` → disconnect (alias for stop)
- `updateSettings(options)` → update limiter settings
- `currentReservoir()` → `Promise<number | null>`
- `incrementReservoir(amount)` → `Promise<number | null>`
- `running()` → `Promise<number>`
- `queued([priority])` → `Promise<number>`
- `done()` → `Promise<number>`
- `empty()` → `Promise<boolean>`

### Events

All bottleneck events are emitted with identical payloads:

`received`, `queued`, `scheduled`, `executing`, `done`, `failed`, `dropped`, `depleted`, `empty`, `idle`, `error`

### Strategy

```js
Bottleneck.Strategy.LEAK      // 1
Bottleneck.Strategy.OVERFLOW   // 2
Bottleneck.Strategy.BLOCK      // 3
```

### Group

```js
const group = new Bottleneck.Group({ maxConcurrent: 5 });
const limiter = group.key("user-123");
```

Methods: `key(id)`, `deleteKey(id)`, `keys()`, `limiters()`, `updateSettings(options)`
Events: `created(limiter, key)`

---

## Redis Clustering

### Changes from Bottleneck

1. **ioredis is a peer dependency** — install it separately:
   ```bash
   npm install ioredis
   ```

2. **Redis 7.x works correctly** — bottleneck had known bugs with Redis 7.x that are fixed in Sluice.

3. **Same configuration:**
   ```js
   const limiter = new Sluice({
     datastore: "ioredis",
     clientOptions: { host: "127.0.0.1", port: 6379 },
     id: "my-limiter",
   });
   ```

---

## What's Different

### Improvements

- **TypeScript-first** — accurate types, no `@types/bottleneck` needed
- **ESM + CJS dual package** — native ES module support
- **Node.js 18+** — modern baseline
- **Redis 7.x support** — fixes known bottleneck bugs
- **Zero runtime dependencies** — bottleneck bundles its own Redis client

### Behavioral Differences

- None for local mode. The API is fully compatible.
- Redis mode uses Lua scripts with different key prefixes (`sluice:` instead of `b_`).
  If migrating a running system with Redis, you may need to clear existing keys.
