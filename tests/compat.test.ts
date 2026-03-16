import { describe, it, expect } from "vitest";
import Bottleneck from "../src/compat/bottleneck.js";

describe("Bottleneck compatibility", () => {
  it("Bottleneck is a constructor", () => {
    const limiter = new Bottleneck();
    expect(limiter).toBeDefined();
  });

  it("Bottleneck.Strategy matches values", () => {
    expect(Bottleneck.Strategy.LEAK).toBe(1);
    expect(Bottleneck.Strategy.OVERFLOW).toBe(2);
    expect(Bottleneck.Strategy.BLOCK).toBe(3);
  });

  it("Bottleneck.Group is available", () => {
    expect(Bottleneck.Group).toBeDefined();
    const group = new Bottleneck.Group({ maxConcurrent: 5 });
    expect(group).toBeDefined();
  });

  it("schedule works", async () => {
    const limiter = new Bottleneck();
    const result = await limiter.schedule(() => Promise.resolve("ok"));
    expect(result).toBe("ok");
  });

  it("schedule with options works", async () => {
    const limiter = new Bottleneck({ maxConcurrent: 1 });
    const result = await limiter.schedule(
      { priority: 1 },
      () => Promise.resolve("priority")
    );
    expect(result).toBe("priority");
  });

  it("maxConcurrent works", async () => {
    const limiter = new Bottleneck({ maxConcurrent: 2 });
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

    await Promise.all(Array.from({ length: 4 }, () => limiter.schedule(job)));
    expect(maxSeen).toBe(2);
  });

  it("wrap creates rate-limited function", async () => {
    const limiter = new Bottleneck();
    const fn = async (x: unknown) => x;
    const wrapped = limiter.wrap(fn);
    expect(await wrapped(42)).toBe(42);
  });

  it("stop rejects new jobs", async () => {
    const limiter = new Bottleneck();
    limiter.stop();
    await expect(limiter.schedule(() => Promise.resolve())).rejects.toThrow("stopped");
  });

  it("events work", async () => {
    const limiter = new Bottleneck();
    const events: string[] = [];
    limiter.on("executing", () => events.push("executing"));
    limiter.on("done", () => events.push("done"));

    await limiter.schedule(() => Promise.resolve());
    await new Promise((r) => setTimeout(r, 10));

    expect(events).toContain("executing");
    expect(events).toContain("done");
  });

  it("running/queued/done return promises", async () => {
    const limiter = new Bottleneck();
    expect(await limiter.running()).toBe(0);
    expect(await limiter.queued()).toBe(0);
    expect(await limiter.done()).toBe(0);
    expect(await limiter.empty()).toBe(true);
  });

  it("currentReservoir and incrementReservoir work", async () => {
    const limiter = new Bottleneck({ reservoir: 10 });
    expect(await limiter.currentReservoir()).toBe(10);
    await limiter.incrementReservoir(5);
    expect(await limiter.currentReservoir()).toBe(15);
  });

  it("Group.key returns limiters", () => {
    const group = new Bottleneck.Group({ maxConcurrent: 5 });
    const limiter = group.key("test");
    expect(limiter).toBeDefined();
    expect(group.keys()).toContain("test");
  });

  it("updateSettings works", async () => {
    const limiter = new Bottleneck({ maxConcurrent: 1 });
    limiter.updateSettings({ maxConcurrent: 10 });

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

  it("chain works", async () => {
    const outer = new Bottleneck();
    const inner = new Bottleneck();
    inner.chain(outer);
    const result = await inner.schedule(() => Promise.resolve("chained"));
    expect(result).toBe("chained");
  });

  it("disconnect works", () => {
    const limiter = new Bottleneck();
    limiter.disconnect();
    // Should not throw
  });
});
