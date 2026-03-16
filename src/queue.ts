import { DEFAULT_PRIORITY } from "./types.js";
import type { JobOptions } from "./types.js";

export interface QueuedJob<T = unknown> {
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
  fn: (...args: unknown[]) => Promise<T>;
  args: unknown[];
  options: Required<JobOptions>;
}

export class PriorityQueue {
  private queues: Map<number, QueuedJob[]> = new Map();
  private _length = 0;

  get length(): number {
    return this._length;
  }

  push(job: QueuedJob): void {
    const priority = job.options.priority ?? DEFAULT_PRIORITY;
    let queue = this.queues.get(priority);
    if (!queue) {
      queue = [];
      this.queues.set(priority, queue);
    }
    queue.push(job);
    this._length++;
  }

  shift(): QueuedJob | undefined {
    for (let p = 0; p <= 9; p++) {
      const queue = this.queues.get(p);
      if (queue && queue.length > 0) {
        this._length--;
        return queue.shift();
      }
    }
    return undefined;
  }

  drop(count: number): QueuedJob[] {
    const dropped: QueuedJob[] = [];
    for (let i = 0; i < count; i++) {
      // Drop lowest priority first (highest number)
      for (let p = 9; p >= 0; p--) {
        const queue = this.queues.get(p);
        if (queue && queue.length > 0) {
          dropped.push(queue.pop()!);
          this._length--;
          break;
        }
      }
    }
    return dropped;
  }

  getAll(): QueuedJob[] {
    const all: QueuedJob[] = [];
    for (let p = 0; p <= 9; p++) {
      const queue = this.queues.get(p);
      if (queue) {
        all.push(...queue);
      }
    }
    return all;
  }

  clear(): QueuedJob[] {
    const all = this.getAll();
    this.queues.clear();
    this._length = 0;
    return all;
  }
}
