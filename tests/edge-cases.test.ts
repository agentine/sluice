import { describe, it, expect } from "vitest";
import { Sluice, Strategy } from "../src/index.js";

describe("Edge cases", () => {
  it("reservoir exhaustion blocks jobs", async () => {
    const limiter = new Sluice({ reservoir: 1 });
    const r1 = await limiter.schedule(() => Promise.resolve("ok"));
    expect(r1).toBe("ok");
    expect(await limiter.currentReservoir()).toBe(0);

    // Next job stays queued (depleted)
    let resolved = false;
    limiter.schedule(() => {
      resolved = true;
      return Promise.resolve();
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 30));
    expect(resolved).toBe(false);
    limiter.stop({ dropWaitingJobs: true });
  });

  it("rapid schedule/stop cycle", async () => {
    const limiter = new Sluice({ maxConcurrent: 1 });
    const promises: Promise<unknown>[] = [];

    for (let i = 0; i < 10; i++) {
      promises.push(limiter.schedule(() => Promise.resolve(i)).catch(() => "dropped"));
    }

    limiter.stop({ dropWaitingJobs: true });

    const results = await Promise.all(promises);
    // Some should resolve, rest should be dropped
    expect(results.some((r) => typeof r === "number")).toBe(true);
    expect(results.some((r) => r === "dropped")).toBe(true);
  });

  it("job with weight 0 always passes reservoir", async () => {
    const limiter = new Sluice({ reservoir: 0 });
    // Weight 0 job should still run (consumes no reservoir)
    const result = await limiter.schedule({ weight: 0 }, () => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("multiple failed jobs emit correct errors", async () => {
    const limiter = new Sluice();
    const errors: string[] = [];
    limiter.on("failed", (err: Error) => errors.push(err.message));

    await limiter.schedule(() => Promise.reject(new Error("err1"))).catch(() => {});
    await limiter.schedule(() => Promise.reject(new Error("err2"))).catch(() => {});
    await new Promise((r) => setTimeout(r, 10));

    expect(errors).toContain("err1");
    expect(errors).toContain("err2");
  });

  it("concurrent maxConcurrent=1 with minTime", async () => {
    const limiter = new Sluice({ maxConcurrent: 1, minTime: 30 });
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
      expect(starts[i] - starts[i - 1]).toBeGreaterThanOrEqual(25);
    }
  });

  it("high weight blocked by low reservoir", async () => {
    const limiter = new Sluice({ reservoir: 3 });
    await limiter.schedule({ weight: 2 }, () => Promise.resolve());
    expect(await limiter.currentReservoir()).toBe(1);

    // Weight 2 job can't run (only 1 in reservoir)
    let ran = false;
    limiter.schedule({ weight: 2 }, () => {
      ran = true;
      return Promise.resolve();
    }).catch(() => {});
    await new Promise((r) => setTimeout(r, 30));
    expect(ran).toBe(false);
    limiter.stop({ dropWaitingJobs: true });
  });

  it("submit with callback style", async () => {
    const limiter = new Sluice();
    let called = false;

    limiter.submit((cb: (err: unknown, result: string) => void) => {
      called = true;
      cb(null, "done");
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(called).toBe(true);
  });

  it("submit with error callback", async () => {
    const limiter = new Sluice();
    const errors: string[] = [];
    limiter.on("failed", (err: Error) => errors.push(err.message));

    limiter.submit((cb: (err: unknown) => void) => {
      cb(new Error("cb error"));
    });

    await new Promise((r) => setTimeout(r, 20));
    expect(errors).toContain("cb error");
  });

  it("empty limiter idle event", async () => {
    const limiter = new Sluice();
    let idled = false;
    limiter.on("idle", () => { idled = true; });

    await limiter.schedule(() => Promise.resolve());
    await new Promise((r) => setTimeout(r, 20));
    expect(idled).toBe(true);
  });

  it("schedule returns correct type", async () => {
    const limiter = new Sluice();
    const num: number = await limiter.schedule(() => Promise.resolve(42));
    const str: string = await limiter.schedule(() => Promise.resolve("hello"));
    expect(num).toBe(42);
    expect(str).toBe("hello");
  });

  it("expiration does not affect fast jobs", async () => {
    const limiter = new Sluice();
    const result = await limiter.schedule(
      { expiration: 1000 },
      () => Promise.resolve("fast")
    );
    expect(result).toBe("fast");
  });
});
