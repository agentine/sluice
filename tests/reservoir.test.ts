import { describe, it, expect, afterEach } from "vitest";
import { Reservoir } from "../src/reservoir.js";

describe("Reservoir", () => {
  let reservoir: Reservoir;

  afterEach(() => {
    reservoir?.stop();
  });

  it("null count allows all", () => {
    reservoir = new Reservoir();
    expect(reservoir.count).toBeNull();
    expect(reservoir.tryConsume(1)).toBe(true);
    expect(reservoir.tryConsume(100)).toBe(true);
  });

  it("tracks count", () => {
    reservoir = new Reservoir({ reservoir: 5 });
    expect(reservoir.count).toBe(5);
    expect(reservoir.tryConsume(2)).toBe(true);
    expect(reservoir.count).toBe(3);
  });

  it("tryConsume fails when insufficient", () => {
    reservoir = new Reservoir({ reservoir: 2 });
    expect(reservoir.tryConsume(3)).toBe(false);
    expect(reservoir.count).toBe(2);
  });

  it("tryConsume exact amount", () => {
    reservoir = new Reservoir({ reservoir: 3 });
    expect(reservoir.tryConsume(3)).toBe(true);
    expect(reservoir.count).toBe(0);
  });

  it("increment adds to reservoir", () => {
    reservoir = new Reservoir({ reservoir: 2 });
    expect(reservoir.increment(5)).toBe(7);
    expect(reservoir.count).toBe(7);
  });

  it("increment returns null when no reservoir", () => {
    reservoir = new Reservoir();
    expect(reservoir.increment(5)).toBeNull();
  });

  it("refresh interval resets reservoir", async () => {
    reservoir = new Reservoir({
      reservoir: 1,
      reservoirRefreshInterval: 40,
      reservoirRefreshAmount: 3,
    });
    reservoir.start();

    reservoir.tryConsume(1);
    expect(reservoir.count).toBe(0);

    await new Promise((r) => setTimeout(r, 60));
    expect(reservoir.count).toBe(3);
  });

  it("increase interval grows reservoir", async () => {
    reservoir = new Reservoir({
      reservoir: 1,
      reservoirIncreaseInterval: 40,
      reservoirIncreaseAmount: 2,
    });
    reservoir.start();

    await new Promise((r) => setTimeout(r, 60));
    expect(reservoir.count).toBeGreaterThanOrEqual(3);
  });

  it("increase respects maximum", async () => {
    reservoir = new Reservoir({
      reservoir: 4,
      reservoirIncreaseInterval: 30,
      reservoirIncreaseAmount: 5,
      reservoirIncreaseMaximum: 6,
    });
    reservoir.start();

    await new Promise((r) => setTimeout(r, 50));
    expect(reservoir.count).toBeLessThanOrEqual(6);
  });

  it("stop clears timers", async () => {
    reservoir = new Reservoir({
      reservoir: 0,
      reservoirRefreshInterval: 30,
      reservoirRefreshAmount: 10,
    });
    reservoir.start();
    reservoir.stop();

    await new Promise((r) => setTimeout(r, 50));
    expect(reservoir.count).toBe(0);
  });

  it("update changes settings", () => {
    reservoir = new Reservoir({ reservoir: 5 });
    reservoir.update({ reservoir: 10 });
    expect(reservoir.count).toBe(10);
  });

  it("onChange callback fires on refresh", async () => {
    reservoir = new Reservoir({
      reservoir: 0,
      reservoirRefreshInterval: 30,
      reservoirRefreshAmount: 1,
    });
    let called = false;
    reservoir.setOnChange(() => { called = true; });
    reservoir.start();

    await new Promise((r) => setTimeout(r, 50));
    expect(called).toBe(true);
  });
});
