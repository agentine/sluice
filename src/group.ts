import { EventEmitter } from "./events.js";
import { Sluice } from "./sluice.js";
import type { GroupOptions } from "./types.js";

export class Group extends EventEmitter {
  private _options: GroupOptions;
  private _limiters: Map<string, Sluice> = new Map();
  private _timeout: number | null;
  private _timeouts: Map<string, ReturnType<typeof setTimeout>> = new Map();

  constructor(options: GroupOptions = {}) {
    super();
    this._options = { ...options };
    this._timeout = options.timeout != null ? options.timeout : null;
  }

  key(id: string): Sluice {
    let limiter = this._limiters.get(id);
    if (!limiter) {
      limiter = new Sluice(this._options);
      this._limiters.set(id, limiter);
      this.emit("created", limiter, id);
      this._resetTimeout(id);
    } else {
      this._resetTimeout(id);
    }
    return limiter;
  }

  deleteKey(id: string): this {
    const timer = this._timeouts.get(id);
    if (timer) {
      clearTimeout(timer);
      this._timeouts.delete(id);
    }
    this._limiters.delete(id);
    return this;
  }

  keys(): string[] {
    return [...this._limiters.keys()];
  }

  limiters(): { key: string; limiter: Sluice }[] {
    return [...this._limiters.entries()].map(([key, limiter]) => ({ key, limiter }));
  }

  updateSettings(options: GroupOptions): void {
    this._options = { ...this._options, ...options };
    if (options.timeout !== undefined) {
      this._timeout = options.timeout != null ? options.timeout : null;
    }
  }

  private _resetTimeout(id: string): void {
    const existing = this._timeouts.get(id);
    if (existing) clearTimeout(existing);

    if (this._timeout != null) {
      const timer = setTimeout(() => {
        this._timeouts.delete(id);
        this._limiters.delete(id);
      }, this._timeout);
      if (timer.unref) timer.unref();
      this._timeouts.set(id, timer);
    }
  }
}
