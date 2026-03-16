import { EventEmitter } from "./events.js";
import { PriorityQueue } from "./queue.js";
import type { QueuedJob } from "./queue.js";
import { Reservoir } from "./reservoir.js";
import { createWrapped } from "./wrap.js";
import { Strategy, DEFAULT_PRIORITY } from "./types.js";
import type { SluiceOptions, JobOptions } from "./types.js";

export class Sluice extends EventEmitter {
  private _options: Required<
    Pick<SluiceOptions, "maxConcurrent" | "minTime" | "highWater" | "strategy" | "rejectOnDrop" | "trackDoneStatus" | "id">
  >;
  private _queue = new PriorityQueue();
  private _reservoir: Reservoir;
  private _running = 0;
  private _done = 0;
  private _nextAllowedTime = 0;
  private _stopped = false;
  private _chain: Sluice | null = null;
  private _drainTimer: ReturnType<typeof setTimeout> | null = null;
  private _minTimeTimer: ReturnType<typeof setTimeout> | null = null;

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
      this._addJob(job);
    });
  }

  submit(options: JobOptions, fn: (...args: unknown[]) => void, ...args: unknown[]): void;
  submit(fn: (...args: unknown[]) => void, ...args: unknown[]): void;
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
    if (this._minTimeTimer) {
      clearTimeout(this._minTimeTimer);
      this._minTimeTimer = null;
    }
    if (this._drainTimer) {
      clearTimeout(this._drainTimer);
      this._drainTimer = null;
    }

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
      // BLOCK: job is still queued, drain will pause until queue drops below HWM
    }

    const reachedHWM = hwm != null && this._queue.length + 1 >= hwm;
    const blocked = this._options.strategy === Strategy.BLOCK && reachedHWM;
    this._queue.push(job);
    this.emit("queued", { args: job.args, options: job.options, reachedHWM, blocked });
    if (!blocked) {
      this._drain();
    }
  }

  private _drain(): void {
    if (this._stopped) return;

    // BLOCK strategy: don't process if queue is at/above high water mark
    const hwm = this._options.highWater;
    if (hwm != null && this._options.strategy === Strategy.BLOCK && this._queue.length >= hwm) {
      return;
    }

    const now = Date.now();
    const minTime = this._options.minTime;

    // Check if we need to wait for minTime
    if (minTime > 0 && now < this._nextAllowedTime) {
      // Schedule a drain at the next allowed time
      if (!this._minTimeTimer) {
        const delay = this._nextAllowedTime - now;
        this._minTimeTimer = setTimeout(() => {
          this._minTimeTimer = null;
          this._drain();
        }, delay);
        if (this._minTimeTimer.unref) this._minTimeTimer.unref();
      }
      return;
    }

    if (!this._canRun()) {
      this._checkEmptyIdle();
      return;
    }

    const job = this._queue.shift();
    if (!job) {
      this._checkEmptyIdle();
      return;
    }

    if (!this._reservoir.tryConsume(job.options.weight)) {
      this._queue.push(job);
      this.emit("depleted");
      return;
    }

    // Update minTime scheduling
    if (minTime > 0) {
      this._nextAllowedTime = Date.now() + minTime;
    }

    this._execute(job);

    // Continue draining if more jobs can run (will re-check minTime at top)
    if (this._canRun() && this._queue.length > 0) {
      this._scheduleDrain();
    } else {
      this._checkEmptyIdle();
    }
  }

  private _canRun(): boolean {
    if (this._options.maxConcurrent != null && this._running >= this._options.maxConcurrent) {
      return false;
    }
    if (this._queue.length === 0) return false;
    return true;
  }

  private _checkEmptyIdle(): void {
    if (this._queue.length === 0) {
      this.emit("empty");
      if (this._running === 0) {
        this.emit("idle");
      }
    }
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

    if (this._chain) {
      // Chain: schedule execution through the chained limiter
      this._chain
        .schedule(() => {
          return new Promise<void>((chainResolve) => {
            runJob();
            // Resolve the chain job when this job finishes
            const checkDone = () => {
              // Listen for this job's completion via the original promise
              // We rely on the job's resolve/reject already being wired up in runJob
              chainResolve();
            };
            // Run synchronously — runJob starts the async job, chain slot freed immediately
            // This matches bottleneck behavior where chain controls scheduling, not duration
            checkDone();
          });
        })
        .catch(() => {
          // Chain limiter stopped — still let job run
        });
    } else {
      // Direct execution via microtask for consistent async behavior
      Promise.resolve().then(runJob);
    }
  }

  private _finish(): void {
    this._running--;
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
