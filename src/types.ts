export const DEFAULT_PRIORITY = 5;

export enum Strategy {
  LEAK = 1,
  OVERFLOW = 2,
  BLOCK = 3,
}

export interface SluiceOptions {
  maxConcurrent?: number | null;
  minTime?: number;
  highWater?: number | null;
  strategy?: Strategy;
  rejectOnDrop?: boolean;
  trackDoneStatus?: boolean;
  id?: string;
  reservoir?: number | null;
  reservoirRefreshInterval?: number | null;
  reservoirRefreshAmount?: number | null;
  reservoirIncreaseInterval?: number | null;
  reservoirIncreaseAmount?: number | null;
  reservoirIncreaseMaximum?: number | null;
  Promise?: PromiseConstructor;
  datastore?: "local" | "ioredis";
  clientOptions?: Record<string, unknown>;
  clusterNodes?: unknown[];
  timeout?: number | null;
  heartbeatInterval?: number;
}

export interface JobOptions {
  id?: string;
  weight?: number;
  expiration?: number | null;
  priority?: number;
}

export interface GroupOptions extends SluiceOptions {
  maxConcurrent?: number | null;
  minTime?: number;
  timeout?: number | null;
}

export interface SluiceEvents {
  received: (info: { args: unknown[]; options: JobOptions }) => void;
  queued: (info: { args: unknown[]; options: JobOptions; reachedHWM: boolean; blocked: boolean }) => void;
  scheduled: (info: { args: unknown[]; options: JobOptions }) => void;
  executing: (info: { args: unknown[]; options: JobOptions; retryCount: number }) => void;
  done: (info: { args: unknown[]; options: JobOptions; retryCount: number }) => void;
  failed: (error: Error, info: { args: unknown[]; options: JobOptions; retryCount: number }) => void;
  dropped: (dropped: { args: unknown[]; options: JobOptions }) => void;
  depleted: () => void;
  empty: () => void;
  idle: () => void;
  error: (error: Error) => void;
}
