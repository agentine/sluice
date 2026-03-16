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

  it("respects maxConcurrent", async () => {
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

  it("respects minTime", async () => {
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
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(45); // allow small timing variance
    }
  });

  it("respects reservoir", async () => {
    const limiter = new Sluice({ reservoir: 2 });
    const results: number[] = [];

    const job = (n: number) => {
      results.push(n);
      return Promise.resolve(n);
    };

    const p1 = limiter.schedule(() => job(1));
    const p2 = limiter.schedule(() => job(2));
    const p3 = limiter.schedule(() => job(3)); // should be depleted

    await p1;
    await p2;

    const reservoir = await limiter.currentReservoir();
    expect(reservoir).toBe(0);
    expect(results).toEqual([1, 2]);
  });

  it("priority ordering", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });
    const order: number[] = [];

    // Block the limiter with a slow job
    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );

    // Queue jobs with different priorities (lower number = higher priority)
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

  it("emits lifecycle events", async () => {
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
    // Allow drain to fire
    await new Promise((r) => setTimeout(r, 10));

    expect(events).toContain("received");
    expect(events).toContain("queued");
    expect(events).toContain("scheduled");
    expect(events).toContain("executing");
    expect(events).toContain("done");
  });

  it("stop rejects new jobs", async () => {
    const limiter = new Sluice();
    limiter.stop();

    await expect(limiter.schedule(() => Promise.resolve())).rejects.toThrow(
      "stopped"
    );
  });

  it("stop with dropWaitingJobs", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });
    const dropped: unknown[] = [];
    limiter.on("dropped", (info) => dropped.push(info));

    // Block the limiter
    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );

    // Wait for blocker to actually start executing
    await new Promise((r) => setTimeout(r, 10));

    // Queue a job that will be dropped
    const p = limiter.schedule(() => Promise.resolve("should be dropped")).catch((e: Error) => e);

    limiter.stop({ dropWaitingJobs: true });
    await blocker;

    const err = await p;
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).toMatch(/stopped/);
    expect(dropped.length).toBe(1);
  });

  it("wrap creates rate-limited function", async () => {
    const limiter = new Sluice();
    const fn = async (x: unknown) => x;
    const wrapped = limiter.wrap(fn);
    const result = await wrapped(42);
    expect(result).toBe(42);
  });

  it("LEAK strategy drops lowest priority job", async () => {
    const limiter = new Sluice({
      maxConcurrent: 1,
      highWater: 2,
      strategy: Strategy.LEAK,
    });
    const dropped: unknown[] = [];
    limiter.on("dropped", (info) => dropped.push(info));

    // Block the limiter
    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    // Fill to high water
    limiter.schedule({ priority: 3 }, () => Promise.resolve("a")).catch(() => {});
    limiter.schedule({ priority: 5 }, () => Promise.resolve("b")).catch(() => {});

    // This should cause a drop (lowest priority = highest number = 5)
    limiter.schedule({ priority: 1 }, () => Promise.resolve("c")).catch(() => {});

    await blocker;
    await new Promise((r) => setTimeout(r, 50));
    expect(dropped.length).toBeGreaterThanOrEqual(1);
  });

  it("OVERFLOW strategy drops new incoming job", async () => {
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

    // Fill to high water
    limiter.schedule(() => Promise.resolve("a"));

    // This should be dropped immediately
    const overflowed = limiter.schedule(() => Promise.resolve("dropped"));
    await expect(overflowed).rejects.toThrow("dropped");

    await blocker;
    await new Promise((r) => setTimeout(r, 50));
    expect(dropped.length).toBeGreaterThanOrEqual(1);
  });

  it("weight consumes reservoir", async () => {
    const limiter = new Sluice({ reservoir: 5 });

    await limiter.schedule({ weight: 3 }, () => Promise.resolve());
    const remaining = await limiter.currentReservoir();
    expect(remaining).toBe(2);
  });

  it("incrementReservoir adjusts reservoir", async () => {
    const limiter = new Sluice({ reservoir: 2 });
    await limiter.incrementReservoir(5);
    const count = await limiter.currentReservoir();
    expect(count).toBe(7);
  });

  it("running() and queued() report correct counts", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });

    const blocker = limiter.schedule(
      () => new Promise((resolve) => setTimeout(resolve, 50))
    );
    limiter.schedule(() => Promise.resolve());

    // Wait for first job to start
    await new Promise((r) => setTimeout(r, 10));

    const running = await limiter.running();
    const queued = await limiter.queued();
    expect(running).toBe(1);
    expect(queued).toBe(1);

    await blocker;
    await new Promise((r) => setTimeout(r, 60));
  });

  it("done() tracks completed jobs when trackDoneStatus enabled", async () => {
    const limiter = new Sluice({ trackDoneStatus: true });

    await limiter.schedule(() => Promise.resolve());
    await limiter.schedule(() => Promise.resolve());

    // Allow events to propagate
    await new Promise((r) => setTimeout(r, 10));
    const count = await limiter.done();
    expect(count).toBe(2);
  });

  it("expiration causes job timeout", async () => {
    const limiter = new Sluice();
    const result = limiter.schedule(
      { expiration: 50 },
      () => new Promise((resolve) => setTimeout(() => resolve("late"), 200))
    );
    await expect(result).rejects.toThrow("timed out");
  });

  it("updateSettings changes limiter behavior", async () => {
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

    await Promise.all([
      limiter.schedule(job),
      limiter.schedule(job),
      limiter.schedule(job),
    ]);
    expect(maxSeen).toBe(3);
  });

  it("chain routes through chained limiter", async () => {
    const outer = new Sluice({ maxConcurrent: 1 });
    const inner = new Sluice();
    inner.chain(outer);

    const result = await inner.schedule(() => Promise.resolve("chained"));
    expect(result).toBe("chained");
  });
});
