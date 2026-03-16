import { describe, it, expect } from "vitest";
import { PriorityQueue } from "../src/queue.js";
import type { QueuedJob } from "../src/queue.js";

function makeJob(priority: number, id = ""): QueuedJob {
  return {
    resolve: () => {},
    reject: () => {},
    fn: () => Promise.resolve(),
    args: [id],
    options: { id: id || `job-${priority}`, weight: 1, expiration: null, priority },
  };
}

describe("PriorityQueue", () => {
  it("starts empty", () => {
    const q = new PriorityQueue();
    expect(q.length).toBe(0);
    expect(q.shift()).toBeUndefined();
  });

  it("push and shift", () => {
    const q = new PriorityQueue();
    const job = makeJob(5);
    q.push(job);
    expect(q.length).toBe(1);
    expect(q.shift()).toBe(job);
    expect(q.length).toBe(0);
  });

  it("priority ordering (lower number = higher priority)", () => {
    const q = new PriorityQueue();
    q.push(makeJob(5, "low"));
    q.push(makeJob(1, "high"));
    q.push(makeJob(3, "mid"));

    expect(q.shift()!.args[0]).toBe("high");
    expect(q.shift()!.args[0]).toBe("mid");
    expect(q.shift()!.args[0]).toBe("low");
  });

  it("FIFO within same priority", () => {
    const q = new PriorityQueue();
    q.push(makeJob(5, "a"));
    q.push(makeJob(5, "b"));
    q.push(makeJob(5, "c"));

    expect(q.shift()!.args[0]).toBe("a");
    expect(q.shift()!.args[0]).toBe("b");
    expect(q.shift()!.args[0]).toBe("c");
  });

  it("drop removes lowest priority first", () => {
    const q = new PriorityQueue();
    q.push(makeJob(1, "high"));
    q.push(makeJob(5, "low1"));
    q.push(makeJob(5, "low2"));
    q.push(makeJob(3, "mid"));

    const dropped = q.drop(1);
    expect(dropped.length).toBe(1);
    expect(dropped[0].args[0]).toBe("low2");
    expect(q.length).toBe(3);
  });

  it("drop multiple", () => {
    const q = new PriorityQueue();
    q.push(makeJob(1, "a"));
    q.push(makeJob(5, "b"));
    q.push(makeJob(9, "c"));
    q.push(makeJob(3, "d"));

    const dropped = q.drop(2);
    expect(dropped.length).toBe(2);
    expect(q.length).toBe(2);
  });

  it("getAll returns all in priority order", () => {
    const q = new PriorityQueue();
    q.push(makeJob(5, "low"));
    q.push(makeJob(1, "high"));
    q.push(makeJob(3, "mid"));

    const all = q.getAll();
    expect(all.length).toBe(3);
    expect(all[0].args[0]).toBe("high");
    expect(all[1].args[0]).toBe("mid");
    expect(all[2].args[0]).toBe("low");
  });

  it("clear removes all and returns them", () => {
    const q = new PriorityQueue();
    q.push(makeJob(1));
    q.push(makeJob(5));
    q.push(makeJob(3));

    const cleared = q.clear();
    expect(cleared.length).toBe(3);
    expect(q.length).toBe(0);
  });

  it("handles all 10 priority levels", () => {
    const q = new PriorityQueue();
    for (let p = 9; p >= 0; p--) {
      q.push(makeJob(p, `p${p}`));
    }

    for (let p = 0; p <= 9; p++) {
      expect(q.shift()!.args[0]).toBe(`p${p}`);
    }
  });
});
