import { EventEmitter } from "./events.js";
import { PriorityQueue } from "./queue.js";
import type { QueuedJob } from "./queue.js";
import { Reservoir } from "./reservoir.js";
import { createWrapped } from "./wrap.js";
import { Strategy, DEFAULT_PRIORITY } from "./types.js";
import type { SluiceOptions, JobOptions } from "./types.js";

export class Sluice extends EventEmitter {
  // stub — full implementation in Phase 2
  private _options: Required<
    Pick<SluiceOptions, "maxConcurrent" | "minTime" | "highWater" | "strategy" | "rejectOnDrop" | "trackDoneStatus" | "id">
  >;
  private _queue = new PriorityQueue();
  private _reservoir: Reservoir;
  private _running = 0;
  private _done = 0;
  private _lastScheduled = 0;
  private _stopped = false;
  private _chain: Sluice | null = null;
  private _drainTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(options: SluiceOptions = {}) {
    super();
    this._options = {
      maxConcurrent: options.maxConcurrent ?? null,
      minTime: options.minTime ?? 0,
      highWater: options.highWater ?? null,
      strategy: options.strategy ?? Strategy.LEAK,
      rejectOnDrop: options.rejectOnDrop ?? true,
      trackDoneStatus: options.trackDoneStatus ?? false,
      id: options.id ?? "default",
    };
    this._reservoir = new Reservoir({
      reservoir: options.reservoir,
      reservoirRefreshInterval: options.reservoirRefreshInterval,
      reservoirRefreshAmount: options.reservoirRefreshAmount,
      reservoirIncreaseInterval: options.reservoirIncreaseInterval,
      reservoirIncreaseAmount: options.reservoirIncreaseAmount,
      reservoirIncreaseMaximum: options.reservoirIncreaseMaximum,
    });
    this._reservoir.setOnChange(() => this._drain());
    this._reservoir.start();
  }

  schedule<T>(options: JobOptions, fn: (...args: unknown[]) => Promise<T>, ...args: unknown[]): Promise<T>;
  schedule<T>(fn: (...args: unknown[]) => Promise<T>, ...args: unknown[]): Promise<T>;
  schedule<T>(...fnArgs: unknown[]): Promise<T> {
    let options: JobOptions;
    let fn: (...args: unknown[]) => Promise<T>;
    let args: unknown[];

    if (typeof fnArgs[0] === "function") {
      options = {};
      fn = fnArgs[0] as (...args: unknown[]) => Promise<T>;
      args = fnArgs.slice(1);
    } else {
      options = (fnArgs[0] as JobOptions) ?? {};
      fn = fnArgs[1] as (...args: unknown[]) => Promise<T>;
      args = fnArgs.slice(2);
    }

    const resolvedOptions: Required<JobOptions> = {
      id: options.id ?? `${this._options.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      weight: options.weight ?? 1,
      expiration: options.expiration ?? null,
      priority: options.priority ?? DEFAULT_PRIORITY,
    };

    if (this._stopped) {
      return Promise.reject(new Error("This limiter has been stopped."));
    }

    return new Promise<T>((resolve, reject) => {
      const job = { resolve, reject, fn, args, options: resolvedOptions } as unknown as QueuedJob;
      this.emit("received", { args, options: resolvedOptions });
      this._addJob(job as QueuedJob);
    });
  }

  submit<T>(options: JobOptions, fn: (...args: unknown[]) => void, ...args: unknown[]): void;
  submit<T>(fn: (...args: unknown[]) => void, ...args: unknown[]): void;
  submit(...fnArgs: unknown[]): void {
    let options: JobOptions;
    let fn: (...args: unknown[]) => void;
    let args: unknown[];

    if (typeof fnArgs[0] === "function") {
      options = {};
      fn = fnArgs[0] as (...a: unknown[]) => void;
      args = fnArgs.slice(1);
    } else {
      options = (fnArgs[0] as JobOptions) ?? {};
      fn = fnArgs[1] as (...a: unknown[]) => void;
      args = fnArgs.slice(2);
    }

    const wrappedFn = (...a: unknown[]) => {
      return new Promise<unknown>((resolve, reject) => {
        const cb = (err: unknown, ...results: unknown[]) => {
          if (err) reject(err);
          else resolve(results.length <= 1 ? results[0] : results);
        };
        fn(...a, cb);
      });
    };

    this.schedule(options, wrappedFn, ...args).catch(() => {});
  }

  wrap<T extends (...args: unknown[]) => Promise<unknown>>(fn: T, options?: JobOptions): T & { withOptions: (opts: JobOptions) => T } {
    return createWrapped(this, fn, options);
  }

  chain(other: Sluice | null): this {
    this._chain = other;
    return this;
  }

  stop(options?: { dropWaitingJobs?: boolean; dropErrorMessage?: string; enqueueErrorMessage?: string }): this {
    this._stopped = true;
    this._reservoir.stop();

    if (options?.dropWaitingJobs) {
      const msg = options.dropErrorMessage ?? "This limiter has been stopped.";
      const jobs = this._queue.clear();
      for (const job of jobs) {
        if (this._options.rejectOnDrop) {
          job.reject(new Error(msg));
        }
        this.emit("dropped", { args: job.args, options: job.options });
      }
    }
    return this;
  }

  disconnect(flush?: boolean): this {
    return this.stop({ dropWaitingJobs: !flush });
  }

  updateSettings(options: Partial<SluiceOptions>): void {
    if (options.maxConcurrent !== undefined) this._options.maxConcurrent = options.maxConcurrent ?? null;
    if (options.minTime !== undefined) this._options.minTime = options.minTime ?? 0;
    if (options.highWater !== undefined) this._options.highWater = options.highWater ?? null;
    if (options.strategy !== undefined) this._options.strategy = options.strategy ?? Strategy.LEAK;
    if (options.rejectOnDrop !== undefined) this._options.rejectOnDrop = options.rejectOnDrop ?? true;

    this._reservoir.update({
      reservoir: options.reservoir,
      reservoirRefreshInterval: options.reservoirRefreshInterval,
      reservoirRefreshAmount: options.reservoirRefreshAmount,
      reservoirIncreaseInterval: options.reservoirIncreaseInterval,
      reservoirIncreaseAmount: options.reservoirIncreaseAmount,
      reservoirIncreaseMaximum: options.reservoirIncreaseMaximum,
    });

    this._drain();
  }

  currentReservoir(): Promise<number | null> {
    return Promise.resolve(this._reservoir.count);
  }

  incrementReservoir(amount: number): Promise<number | null> {
    const result = this._reservoir.increment(amount);
    this._drain();
    return Promise.resolve(result);
  }

  running(): Promise<number> {
    return Promise.resolve(this._running);
  }

  queued(priority?: number): Promise<number> {
    if (priority != null) {
      const all = this._queue.getAll();
      return Promise.resolve(all.filter((j) => j.options.priority === priority).length);
    }
    return Promise.resolve(this._queue.length);
  }

  done(): Promise<number> {
    return Promise.resolve(this._done);
  }

  empty(): Promise<boolean> {
    return Promise.resolve(this._queue.length === 0 && this._running === 0);
  }

  private _addJob(job: QueuedJob): void {
    const hwm = this._options.highWater;
    if (hwm != null && this._queue.length >= hwm) {
      if (this._options.strategy === Strategy.LEAK) {
        const dropped = this._queue.drop(1);
        for (const d of dropped) {
          if (this._options.rejectOnDrop) {
            d.reject(new Error("This job has been dropped by Sluice"));
          }
          this.emit("dropped", { args: d.args, options: d.options });
        }
      } else if (this._options.strategy === Strategy.OVERFLOW) {
        if (this._options.rejectOnDrop) {
          job.reject(new Error("This job has been dropped by Sluice"));
        }
        this.emit("dropped", { args: job.args, options: job.options });
        return;
      }
      // BLOCK: job still queued, will wait
    }

    const reachedHWM = hwm != null && this._queue.length + 1 >= hwm;
    const blocked = this._options.strategy === Strategy.BLOCK && reachedHWM;
    this._queue.push(job);
    this.emit("queued", { args: job.args, options: job.options, reachedHWM, blocked });
    this._drain();
  }

  private _drain(): void {
    if (this._stopped) return;

    while (this._canRun()) {
      const job = this._queue.shift();
      if (!job) break;
      if (!this._reservoir.tryConsume(job.options.weight)) {
        // Put it back
        this._queue.push(job);
        this.emit("depleted");
        break;
      }
      this._execute(job);
    }

    if (this._queue.length === 0) {
      this.emit("empty");
      if (this._running === 0) {
        this.emit("idle");
      }
    }
  }

  private _canRun(): boolean {
    if (this._options.maxConcurrent != null && this._running >= this._options.maxConcurrent) {
      return false;
    }
    if (this._queue.length === 0) return false;
    return true;
  }

  private _execute(job: QueuedJob): void {
    this._running++;
    const info = { args: job.args, options: job.options, retryCount: 0 };
    this.emit("scheduled", { args: job.args, options: job.options });

    const runJob = () => {
      this.emit("executing", info);

      let expirationTimer: ReturnType<typeof setTimeout> | null = null;
      let expired = false;

      const jobPromise = Promise.resolve().then(() => job.fn(...job.args));

      if (job.options.expiration != null) {
        expirationTimer = setTimeout(() => {
          expired = true;
          const err = new Error(`This job timed out after ${job.options.expiration} ms.`);
          job.reject(err);
          this.emit("failed", err, info);
          this._finish();
        }, job.options.expiration);
      }

      jobPromise.then(
        (result) => {
          if (expired) return;
          if (expirationTimer) clearTimeout(expirationTimer);
          job.resolve(result);
          this.emit("done", info);
          if (this._options.trackDoneStatus) this._done++;
          this._finish();
        },
        (error) => {
          if (expired) return;
          if (expirationTimer) clearTimeout(expirationTimer);
          job.reject(error);
          this.emit("failed", error, info);
          this._finish();
        }
      );
    };

    const now = Date.now();
    const timeSinceLast = now - this._lastScheduled;
    const minTime = this._options.minTime;

    if (minTime > 0 && timeSinceLast < minTime && this._lastScheduled > 0) {
      const delay = minTime - timeSinceLast;
      this._lastScheduled = now + delay;
      setTimeout(runJob, delay);
    } else {
      this._lastScheduled = now;
      // Use microtask to ensure consistent async behavior
      Promise.resolve().then(runJob);
    }
  }

  private _finish(): void {
    this._running--;
    if (this._chain) {
      // Notify chained limiter
    }
    this._scheduleDrain();
  }

  private _scheduleDrain(): void {
    if (this._drainTimer) return;
    this._drainTimer = setTimeout(() => {
      this._drainTimer = null;
      this._drain();
    }, 0);
    if (this._drainTimer.unref) this._drainTimer.unref();
  }
}
