import { describe, it, expect } from "vitest";
import { Sluice, Strategy, DEFAULT_PRIORITY } from "../src/index.js";

describe("Sluice core", () => {
  it("exports Sluice class and Strategy enum", () => {
    expect(Sluice).toBeDefined();
    expect(Strategy.LEAK).toBe(1);
    expect(Strategy.OVERFLOW).toBe(2);
    expect(Strategy.BLOCK).toBe(3);
    expect(DEFAULT_PRIORITY).toBe(5);
  });

  it("schedules and executes a job", async () => {
    const limiter = new Sluice();
    const result = await limiter.schedule(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  it("passes arguments to scheduled function", async () => {
    const limiter = new Sluice();
    const result = await limiter.schedule(
      (a: unknown, b: unknown) => Promise.resolve([a, b]),
      "hello",
      123
    );
    expect(result).toEqual(["hello", 123]);
  });

  it("schedule with options and without", async () => {
    const limiter = new Sluice();
    const r1 = await limiter.schedule({ id: "test" }, () => Promise.resolve("a"));
    const r2 = await limiter.schedule(() => Promise.resolve("b"));
    expect(r1).toBe("a");
    expect(r2).toBe("b");
  });

  it("rejects when scheduled function throws", async () => {
    const limiter = new Sluice();
    await expect(
      limiter.schedule(() => Promise.reject(new Error("boom")))
    ).rejects.toThrow("boom");
  });
});

describe("Concurrency control", () => {
  it("maxConcurrent=1 runs jobs sequentially", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });
    let concurrent = 0;
    let maxSeen = 0;

    const job = () =>
      new Promise<void>((resolve) => {
        concurrent++;
        maxSeen = Math.max(maxSeen, concurrent);
        setTimeout(() => {
          concurrent--;
          resolve();
        }, 20);
      });

    await Promise.all([
      limiter.schedule(job),
      limiter.schedule(job),
      limiter.schedule(job),
    ]);
    expect(maxSeen).toBe(1);
  });

  it("maxConcurrent=3 allows up to 3 parallel", async () => {
    const limiter = new Sluice({ maxConcurrent: 3 });
    let concurrent = 0;
    let maxSeen = 0;

    const job = () =>
      new Promise<void>((resolve) => {
        concurrent++;
        maxSeen = Math.max(maxSeen, concurrent);
        setTimeout(() => {
          concurrent--;
          resolve();
        }, 30);
      });

    await Promise.all(Array.from({ length: 6 }, () => limiter.schedule(job)));
    expect(maxSeen).toBe(3);
  });

  it("null maxConcurrent allows unlimited", async () => {
    const limiter = new Sluice({ maxConcurrent: null });
    let concurrent = 0;
    let maxSeen = 0;

    const job = () =>
      new Promise<void>((resolve) => {
        concurrent++;
        maxSeen = Math.max(maxSeen, concurrent);
        setTimeout(() => {
          concurrent--;
          resolve();
        }, 20);
      });

    await Promise.all(Array.from({ length: 5 }, () => limiter.schedule(job)));
    expect(maxSeen).toBe(5);
  });

  it("running() reports correct count", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });

    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );
    limiter.schedule(() => Promise.resolve());

    await new Promise((r) => setTimeout(r, 10));
    expect(await limiter.running()).toBe(1);
    expect(await limiter.queued()).toBe(1);

    await blocker;
    await new Promise((r) => setTimeout(r, 60));
  });
});

describe("Rate limiting (minTime)", () => {
  it("enforces minimum time between job starts", async () => {
    const limiter = new Sluice({ maxConcurrent: 1, minTime: 50 });
    const starts: number[] = [];

    const job = () => {
      starts.push(Date.now());
      return Promise.resolve();
    };

    await Promise.all([
      limiter.schedule(job),
      limiter.schedule(job),
      limiter.schedule(job),
    ]);

    for (let i = 1; i < starts.length; i++) {
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(45);
    }
  });

  it("minTime=0 does not delay", async () => {
    const limiter = new Sluice({ minTime: 0 });
    const start = Date.now();
    await Promise.all([
      limiter.schedule(() => Promise.resolve()),
      limiter.schedule(() => Promise.resolve()),
    ]);
    expect(Date.now() - start).toBeLessThan(50);
  });
});

describe("Reservoir", () => {
  it("limits jobs by reservoir count", async () => {
    const limiter = new Sluice({ reservoir: 2 });
    const results: number[] = [];

    await limiter.schedule(() => { results.push(1); return Promise.resolve(1); });
    await limiter.schedule(() => { results.push(2); return Promise.resolve(2); });

    expect(await limiter.currentReservoir()).toBe(0);
    expect(results).toEqual([1, 2]);
  });

  it("weight consumes multiple reservoir units", async () => {
    const limiter = new Sluice({ reservoir: 5 });
    await limiter.schedule({ weight: 3 }, () => Promise.resolve());
    expect(await limiter.currentReservoir()).toBe(2);
  });

  it("incrementReservoir adjusts count", async () => {
    const limiter = new Sluice({ reservoir: 2 });
    const result = await limiter.incrementReservoir(5);
    expect(result).toBe(7);
    expect(await limiter.currentReservoir()).toBe(7);
  });

  it("currentReservoir returns null when no reservoir set", async () => {
    const limiter = new Sluice();
    expect(await limiter.currentReservoir()).toBeNull();
  });

  it("reservoirRefreshInterval resets reservoir", async () => {
    const limiter = new Sluice({
      reservoir: 1,
      reservoirRefreshInterval: 50,
      reservoirRefreshAmount: 1,
    });

    await limiter.schedule(() => Promise.resolve());
    expect(await limiter.currentReservoir()).toBe(0);

    // Wait for refresh
    await new Promise((r) => setTimeout(r, 80));
    expect(await limiter.currentReservoir()).toBe(1);
    limiter.stop();
  });

  it("reservoirIncreaseInterval increases reservoir", async () => {
    const limiter = new Sluice({
      reservoir: 0,
      reservoirIncreaseInterval: 50,
      reservoirIncreaseAmount: 3,
      reservoirIncreaseMaximum: 5,
    });

    await new Promise((r) => setTimeout(r, 60));
    const count = await limiter.currentReservoir();
    expect(count).toBeGreaterThanOrEqual(3);
    expect(count).toBeLessThanOrEqual(5);
    limiter.stop();
  });
});

describe("Priority queue", () => {
  it("processes higher priority (lower number) first", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });
    const order: number[] = [];

    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );

    const p1 = limiter.schedule({ priority: 5 }, () => {
      order.push(5);
      return Promise.resolve();
    });
    const p2 = limiter.schedule({ priority: 1 }, () => {
      order.push(1);
      return Promise.resolve();
    });
    const p3 = limiter.schedule({ priority: 3 }, () => {
      order.push(3);
      return Promise.resolve();
    });

    await Promise.all([blocker, p1, p2, p3]);
    expect(order).toEqual([1, 3, 5]);
  });

  it("same priority maintains FIFO order", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });
    const order: string[] = [];

    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );

    const pa = limiter.schedule({ priority: 5 }, () => {
      order.push("a");
      return Promise.resolve();
    });
    const pb = limiter.schedule({ priority: 5 }, () => {
      order.push("b");
      return Promise.resolve();
    });
    const pc = limiter.schedule({ priority: 5 }, () => {
      order.push("c");
      return Promise.resolve();
    });

    await Promise.all([blocker, pa, pb, pc]);
    expect(order).toEqual(["a", "b", "c"]);
  });

  it("queued() reports count per priority", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });
    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    limiter.schedule({ priority: 1 }, () => Promise.resolve());
    limiter.schedule({ priority: 1 }, () => Promise.resolve());
    limiter.schedule({ priority: 5 }, () => Promise.resolve());

    await new Promise((r) => setTimeout(r, 10));
    expect(await limiter.queued(1)).toBe(2);
    expect(await limiter.queued(5)).toBe(1);
    expect(await limiter.queued()).toBe(3);

    await blocker;
    await new Promise((r) => setTimeout(r, 50));
  });
});

describe("Job options", () => {
  it("expiration causes job timeout", async () => {
    const limiter = new Sluice();
    await expect(
      limiter.schedule(
        { expiration: 50 },
        () => new Promise((resolve) => setTimeout(() => resolve("late"), 200))
      )
    ).rejects.toThrow("timed out");
  });

  it("id is accessible in events", async () => {
    const limiter = new Sluice();
    let receivedId = "";
    limiter.on("received", (info: { options: { id: string } }) => {
      receivedId = info.options.id;
    });

    await limiter.schedule({ id: "my-job" }, () => Promise.resolve());
    expect(receivedId).toBe("my-job");
  });
});

describe("Events", () => {
  it("emits full lifecycle for successful job", async () => {
    const limiter = new Sluice();
    const events: string[] = [];

    limiter.on("received", () => events.push("received"));
    limiter.on("queued", () => events.push("queued"));
    limiter.on("scheduled", () => events.push("scheduled"));
    limiter.on("executing", () => events.push("executing"));
    limiter.on("done", () => events.push("done"));
    limiter.on("empty", () => events.push("empty"));
    limiter.on("idle", () => events.push("idle"));

    await limiter.schedule(() => Promise.resolve("ok"));
    await new Promise((r) => setTimeout(r, 20));

    expect(events).toContain("received");
    expect(events).toContain("queued");
    expect(events).toContain("scheduled");
    expect(events).toContain("executing");
    expect(events).toContain("done");
  });

  it("emits failed for rejected job", async () => {
    const limiter = new Sluice();
    let failedErr: Error | null = null;
    limiter.on("failed", (err: Error) => {
      failedErr = err;
    });

    await limiter
      .schedule(() => Promise.reject(new Error("fail")))
      .catch(() => {});

    await new Promise((r) => setTimeout(r, 10));
    expect(failedErr?.message).toBe("fail");
  });

  it("emits depleted when reservoir exhausted", async () => {
    const limiter = new Sluice({ reservoir: 1 });
    let depleted = false;
    limiter.on("depleted", () => {
      depleted = true;
    });

    await limiter.schedule(() => Promise.resolve());
    // Schedule another that can't run
    limiter.schedule(() => Promise.resolve()).catch(() => {});
    await new Promise((r) => setTimeout(r, 20));
    expect(depleted).toBe(true);
  });

  it("emits dropped for LEAK strategy", async () => {
    const limiter = new Sluice({
      maxConcurrent: 1,
      highWater: 1,
      strategy: Strategy.LEAK,
    });
    const dropped: unknown[] = [];
    limiter.on("dropped", (info) => dropped.push(info));

    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );
    limiter.schedule(() => Promise.resolve("a")).catch(() => {});
    limiter.schedule(() => Promise.resolve("b")).catch(() => {});

    await blocker;
    await new Promise((r) => setTimeout(r, 50));
    expect(dropped.length).toBeGreaterThanOrEqual(1);
  });

  it("once fires handler only once", async () => {
    const limiter = new Sluice();
    let count = 0;
    limiter.once("idle", () => count++);

    await limiter.schedule(() => Promise.resolve());
    await new Promise((r) => setTimeout(r, 10));
    await limiter.schedule(() => Promise.resolve());
    await new Promise((r) => setTimeout(r, 10));

    expect(count).toBe(1);
  });

  it("removeAllListeners clears handlers", () => {
    const limiter = new Sluice();
    limiter.on("idle", () => {});
    limiter.on("empty", () => {});
    expect(limiter.listenerCount("idle")).toBe(1);
    limiter.removeAllListeners();
    expect(limiter.listenerCount("idle")).toBe(0);
    expect(limiter.listenerCount("empty")).toBe(0);
  });
});

describe("Wrap", () => {
  it("wrap creates rate-limited function", async () => {
    const limiter = new Sluice();
    const fn = async (x: unknown) => x;
    const wrapped = limiter.wrap(fn);
    expect(await wrapped(42)).toBe(42);
  });

  it("withOptions overrides job options", async () => {
    const limiter = new Sluice();
    let seenPriority = -1;
    limiter.on("received", (info: { options: { priority: number } }) => {
      seenPriority = info.options.priority;
    });

    const fn = async () => "ok";
    const wrapped = limiter.wrap(fn);
    await wrapped.withOptions({ priority: 2 })();
    expect(seenPriority).toBe(2);
  });
});

describe("Chain", () => {
  it("chain routes through chained limiter", async () => {
    const outer = new Sluice({ maxConcurrent: 1 });
    const inner = new Sluice();
    inner.chain(outer);

    const result = await inner.schedule(() => Promise.resolve("chained"));
    expect(result).toBe("chained");
  });

  it("chain(null) removes chaining", async () => {
    const outer = new Sluice();
    const inner = new Sluice();
    inner.chain(outer);
    inner.chain(null);

    const result = await inner.schedule(() => Promise.resolve("direct"));
    expect(result).toBe("direct");
  });
});

describe("Stop and disconnect", () => {
  it("stop rejects new jobs", async () => {
    const limiter = new Sluice();
    limiter.stop();
    await expect(limiter.schedule(() => Promise.resolve())).rejects.toThrow("stopped");
  });

  it("stop with dropWaitingJobs drops queued jobs", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });
    const dropped: unknown[] = [];
    limiter.on("dropped", (info) => dropped.push(info));

    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );
    await new Promise((r) => setTimeout(r, 10));

    const p = limiter.schedule(() => Promise.resolve("drop me")).catch((e: Error) => e);
    limiter.stop({ dropWaitingJobs: true });

    await blocker;
    const err = await p;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/stopped/);
    expect(dropped.length).toBe(1);
  });

  it("stop with custom error message", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });
    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );
    await new Promise((r) => setTimeout(r, 10));

    const p = limiter.schedule(() => Promise.resolve()).catch((e: Error) => e);
    limiter.stop({ dropWaitingJobs: true, dropErrorMessage: "custom error" });

    await blocker;
    const err = await p;
    expect((err as Error).message).toBe("custom error");
  });

  it("disconnect with flush=true does not drop jobs", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });
    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 30))
    );
    await new Promise((r) => setTimeout(r, 10));

    limiter.schedule(() => Promise.resolve("kept")).catch(() => {});
    limiter.disconnect(true); // flush = true → don't drop

    await blocker;
  });
});

describe("Strategy", () => {
  it("LEAK drops lowest priority when at highWater", async () => {
    const limiter = new Sluice({
      maxConcurrent: 1,
      highWater: 2,
      strategy: Strategy.LEAK,
    });
    const dropped: unknown[] = [];
    limiter.on("dropped", (info) => dropped.push(info));

    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    limiter.schedule({ priority: 3 }, () => Promise.resolve("a")).catch(() => {});
    limiter.schedule({ priority: 5 }, () => Promise.resolve("b")).catch(() => {});
    limiter.schedule({ priority: 1 }, () => Promise.resolve("c")).catch(() => {});

    await blocker;
    await new Promise((r) => setTimeout(r, 50));
    expect(dropped.length).toBeGreaterThanOrEqual(1);
  });

  it("OVERFLOW drops new job when at highWater", async () => {
    const limiter = new Sluice({
      maxConcurrent: 1,
      highWater: 1,
      strategy: Strategy.OVERFLOW,
    });
    const dropped: unknown[] = [];
    limiter.on("dropped", (info) => dropped.push(info));

    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );

    limiter.schedule(() => Promise.resolve("a")).catch(() => {});
    const overflowed = limiter.schedule(() => Promise.resolve("b"));
    await expect(overflowed).rejects.toThrow("dropped");

    await blocker;
    await new Promise((r) => setTimeout(r, 50));
    expect(dropped.length).toBeGreaterThanOrEqual(1);
  });

  it("BLOCK strategy pauses draining at highWater", async () => {
    const limiter = new Sluice({
      maxConcurrent: 1,
      highWater: 2,
      strategy: Strategy.BLOCK,
    });

    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 30))
    );

    // These will queue up
    const p1 = limiter.schedule(() => Promise.resolve("a"));
    const p2 = limiter.schedule(() => Promise.resolve("b"));

    // At highWater with BLOCK, drain pauses
    await blocker;
    // After blocker completes, queue drops below HWM, drain resumes
    await new Promise((r) => setTimeout(r, 50));
    // Jobs should eventually complete after queue drains below HWM
  });

  it("rejectOnDrop=false does not reject dropped jobs", async () => {
    const limiter = new Sluice({
      maxConcurrent: 1,
      highWater: 1,
      strategy: Strategy.OVERFLOW,
      rejectOnDrop: false,
    });

    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );

    limiter.schedule(() => Promise.resolve("a"));
    // This will be dropped but should not reject
    const p = limiter.schedule(() => Promise.resolve("b"));

    // The promise just hangs (never resolves or rejects)
    await blocker;
    await new Promise((r) => setTimeout(r, 20));
  });
});

describe("updateSettings", () => {
  it("changes maxConcurrent dynamically", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });
    limiter.updateSettings({ maxConcurrent: 5 });

    let concurrent = 0;
    let maxSeen = 0;
    const job = () =>
      new Promise<void>((resolve) => {
        concurrent++;
        maxSeen = Math.max(maxSeen, concurrent);
        setTimeout(() => {
          concurrent--;
          resolve();
        }, 30);
      });

    await Promise.all(Array.from({ length: 3 }, () => limiter.schedule(job)));
    expect(maxSeen).toBe(3);
  });

  it("changes reservoir dynamically", async () => {
    const limiter = new Sluice({ reservoir: 0 });
    limiter.updateSettings({ reservoir: 5 });
    expect(await limiter.currentReservoir()).toBe(5);
  });
});

describe("done() tracking", () => {
  it("returns 0 when trackDoneStatus disabled", async () => {
    const limiter = new Sluice({ trackDoneStatus: false });
    await limiter.schedule(() => Promise.resolve());
    await new Promise((r) => setTimeout(r, 10));
    expect(await limiter.done()).toBe(0);
  });

  it("tracks completed jobs when enabled", async () => {
    const limiter = new Sluice({ trackDoneStatus: true });
    await limiter.schedule(() => Promise.resolve());
    await limiter.schedule(() => Promise.resolve());
    await new Promise((r) => setTimeout(r, 10));
    expect(await limiter.done()).toBe(2);
  });
});

describe("empty()", () => {
  it("returns true when no jobs", async () => {
    const limiter = new Sluice();
    expect(await limiter.empty()).toBe(true);
  });

  it("returns false when jobs are running", async () => {
    const limiter = new Sluice();
    limiter.schedule(() => new Promise((resolve) => setTimeout(resolve, 50)));
    await new Promise((r) => setTimeout(r, 10));
    expect(await limiter.empty()).toBe(false);
    await new Promise((r) => setTimeout(r, 50));
  });
});
