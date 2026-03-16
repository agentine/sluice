import type { Sluice } from "./sluice.js";
import type { JobOptions } from "./types.js";

export function createWrapped<T extends (...args: unknown[]) => Promise<unknown>>(
  limiter: Sluice,
  fn: T,
  defaultOptions?: JobOptions
): T & { withOptions: (options: JobOptions) => T } {
  const wrapped = ((...args: unknown[]) => {
    return limiter.schedule(defaultOptions ?? {}, fn, ...args);
  }) as T & { withOptions: (options: JobOptions) => T };

  wrapped.withOptions = (options: JobOptions) => {
    return ((...args: unknown[]) => {
      return limiter.schedule({ ...defaultOptions, ...options }, fn, ...args);
    }) as T;
  };

  return wrapped;
}
