// Redis connection management — stub for Phase 3
export interface RedisConnectionOptions {
  clientOptions?: Record<string, unknown>;
  clusterNodes?: unknown[];
  timeout?: number;
  heartbeatInterval?: number;
}

export class RedisConnection {
  // Placeholder — will be implemented in Phase 3
  constructor(_options: RedisConnectionOptions = {}) {}
}
