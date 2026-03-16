import { describe, it, expect } from "vitest";
import { EventEmitter } from "../src/events.js";

describe("EventEmitter", () => {
  it("on and emit", () => {
    const ee = new EventEmitter();
    let value = 0;
    ee.on("test", (v: unknown) => { value = v as number; });
    ee.emit("test", 42);
    expect(value).toBe(42);
  });

  it("multiple handlers", () => {
    const ee = new EventEmitter();
    const results: number[] = [];
    ee.on("x", () => results.push(1));
    ee.on("x", () => results.push(2));
    ee.emit("x");
    expect(results).toEqual([1, 2]);
  });

  it("emit returns false when no listeners", () => {
    const ee = new EventEmitter();
    expect(ee.emit("nope")).toBe(false);
  });

  it("emit returns true when listeners exist", () => {
    const ee = new EventEmitter();
    ee.on("yes", () => {});
    expect(ee.emit("yes")).toBe(true);
  });

  it("off removes handler", () => {
    const ee = new EventEmitter();
    let count = 0;
    const handler = () => count++;
    ee.on("test", handler);
    ee.emit("test");
    ee.off("test", handler);
    ee.emit("test");
    expect(count).toBe(1);
  });

  it("once fires only once", () => {
    const ee = new EventEmitter();
    let count = 0;
    ee.once("test", () => count++);
    ee.emit("test");
    ee.emit("test");
    expect(count).toBe(1);
  });

  it("once can be removed before firing", () => {
    const ee = new EventEmitter();
    let count = 0;
    const handler = () => count++;
    ee.once("test", handler);
    ee.off("test", handler);
    ee.emit("test");
    expect(count).toBe(0);
  });

  it("removeAllListeners for specific event", () => {
    const ee = new EventEmitter();
    ee.on("a", () => {});
    ee.on("b", () => {});
    ee.removeAllListeners("a");
    expect(ee.listenerCount("a")).toBe(0);
    expect(ee.listenerCount("b")).toBe(1);
  });

  it("removeAllListeners for all events", () => {
    const ee = new EventEmitter();
    ee.on("a", () => {});
    ee.on("b", () => {});
    ee.removeAllListeners();
    expect(ee.listenerCount("a")).toBe(0);
    expect(ee.listenerCount("b")).toBe(0);
  });

  it("listenerCount", () => {
    const ee = new EventEmitter();
    expect(ee.listenerCount("x")).toBe(0);
    ee.on("x", () => {});
    ee.on("x", () => {});
    expect(ee.listenerCount("x")).toBe(2);
  });

  it("handler error does not break other handlers", () => {
    const ee = new EventEmitter();
    const results: string[] = [];
    ee.on("test", () => { throw new Error("boom"); });
    ee.on("test", () => results.push("ok"));
    ee.emit("test");
    expect(results).toEqual(["ok"]);
  });

  it("multiple arguments", () => {
    const ee = new EventEmitter();
    let args: unknown[] = [];
    ee.on("multi", (...a: unknown[]) => { args = a; });
    ee.emit("multi", 1, "two", true);
    expect(args).toEqual([1, "two", true]);
  });

  it("chaining on/once/off", () => {
    const ee = new EventEmitter();
    const handler = () => {};
    const result = ee.on("a", handler).once("b", handler).off("a", handler);
    expect(result).toBe(ee);
  });
});
