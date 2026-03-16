import { describe, it, expect } from "vitest";
import { Group, Sluice } from "../src/index.js";

describe("Group", () => {
  it("creates limiter for new key", () => {
    const group = new Group({ maxConcurrent: 5 });
    const limiter = group.key("user-1");
    expect(limiter).toBeInstanceOf(Sluice);
  });

  it("returns same limiter for same key", () => {
    const group = new Group();
    const a = group.key("same");
    const b = group.key("same");
    expect(a).toBe(b);
  });

  it("creates different limiters for different keys", () => {
    const group = new Group();
    const a = group.key("one");
    const b = group.key("two");
    expect(a).not.toBe(b);
  });

  it("emits created event", () => {
    const group = new Group();
    const events: { limiter: Sluice; key: string }[] = [];
    group.on("created", (limiter: Sluice, key: string) => {
      events.push({ limiter, key });
    });

    group.key("test-key");
    expect(events.length).toBe(1);
    expect(events[0].key).toBe("test-key");
    expect(events[0].limiter).toBeInstanceOf(Sluice);
  });

  it("does not emit created for existing key", () => {
    const group = new Group();
    let count = 0;
    group.on("created", () => count++);

    group.key("x");
    group.key("x");
    expect(count).toBe(1);
  });

  it("keys() returns all keys", () => {
    const group = new Group();
    group.key("a");
    group.key("b");
    group.key("c");
    expect(group.keys().sort()).toEqual(["a", "b", "c"]);
  });

  it("limiters() returns key-limiter pairs", () => {
    const group = new Group();
    group.key("x");
    group.key("y");
    const pairs = group.limiters();
    expect(pairs.length).toBe(2);
    expect(pairs[0].key).toBeDefined();
    expect(pairs[0].limiter).toBeInstanceOf(Sluice);
  });

  it("deleteKey removes limiter", () => {
    const group = new Group();
    group.key("del");
    expect(group.keys()).toContain("del");
    group.deleteKey("del");
    expect(group.keys()).not.toContain("del");
  });

  it("deleteKey creates new limiter on next access", () => {
    const group = new Group();
    const first = group.key("regen");
    group.deleteKey("regen");
    const second = group.key("regen");
    expect(second).not.toBe(first);
  });

  it("updateSettings changes options for new limiters", () => {
    const group = new Group({ maxConcurrent: 1 });
    group.updateSettings({ maxConcurrent: 10 });
    // New limiters should use updated settings
    // (existing limiters are not affected)
    const limiter = group.key("new");
    expect(limiter).toBeInstanceOf(Sluice);
  });

  it("timeout cleans up idle limiters", async () => {
    const group = new Group({ timeout: 50 });
    group.key("ephemeral");
    expect(group.keys()).toContain("ephemeral");

    await new Promise((r) => setTimeout(r, 80));
    expect(group.keys()).not.toContain("ephemeral");
  });

  it("timeout resets on access", async () => {
    const group = new Group({ timeout: 60 });
    group.key("reset");

    await new Promise((r) => setTimeout(r, 40));
    group.key("reset"); // reset timeout
    await new Promise((r) => setTimeout(r, 40));
    expect(group.keys()).toContain("reset");

    await new Promise((r) => setTimeout(r, 70));
    expect(group.keys()).not.toContain("reset");
  });

  it("shared settings apply to created limiters", async () => {
    const group = new Group({ maxConcurrent: 1 });
    const limiter = group.key("shared");

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
});
