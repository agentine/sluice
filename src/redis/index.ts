import { EventEmitter } from "../events.js";
import { LUA_SCRIPTS } from "./scripts.js";
import type { ScriptName } from "./scripts.js";

export interface RedisConnectionOptions {
  client?: RedisClient;
  clientOptions?: Record<string, unknown>;
  clusterNodes?: unknown[];
  timeout?: number;
  heartbeatInterval?: number;
  id?: string;
}

// Minimal ioredis-compatible interface — avoids direct ioredis dependency
export interface RedisClient {
  defineCommand(name: string, opts: { numberOfKeys: number; lua: string }): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
  disconnect(): void;
  quit(): Promise<string>;
}

export class RedisConnection extends EventEmitter {
  private client: RedisClient | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private instanceId: string;
  private keyPrefix: string;
  private heartbeatInterval: number;
  private heartbeatTimeout: number;
  private scriptsLoaded = false;

  constructor(private options: RedisConnectionOptions = {}) {
    super();
    this.instanceId = options.id ?? `sluice-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    this.keyPrefix = "sluice:";
    this.heartbeatInterval = options.heartbeatInterval ?? 5000;
    this.heartbeatTimeout = this.heartbeatInterval * 3;
  }

  async connect(limiterId: string): Promise<void> {
    if (this.options.client) {
      this.client = this.options.client;
    } else {
      // Dynamically import ioredis
      let Redis: { new (options?: Record<string, unknown>): RedisClient };
      try {
        // Dynamic import — ioredis is an optional peer dependency
        // @ts-expect-error ioredis may not be installed
        const mod = await import("ioredis");
        Redis = (mod.default ?? mod) as typeof Redis;
      } catch {
        throw new Error(
          "ioredis is required for Redis clustering. Install it: npm install ioredis"
        );
      }
      this.client = new Redis(this.options.clientOptions ?? {});
    }

    this.keyPrefix = `sluice:${limiterId}:`;
    this._loadScripts();
    this._startHeartbeat();
  }

  private _loadScripts(): void {
    if (!this.client || this.scriptsLoaded) return;
    for (const [name, def] of Object.entries(LUA_SCRIPTS)) {
      this.client.defineCommand(name, {
        numberOfKeys: def.keys,
        lua: def.script,
      });
    }
    this.scriptsLoaded = true;
  }

  private _startHeartbeat(): void {
    if (this.heartbeatTimer) return;
    this.heartbeatTimer = setInterval(async () => {
      try {
        const dead = await this._runScript("heartbeat", [this._key("heartbeat")], [
          this.instanceId,
          String(Math.floor(Date.now() / 1000)),
          String(Math.floor(this.heartbeatTimeout / 1000)),
        ]);
        if (Array.isArray(dead) && dead.length > 0) {
          this.emit("deadInstances", dead);
        }
      } catch {
        // heartbeat failure — non-fatal
      }
    }, this.heartbeatInterval);
    if (this.heartbeatTimer.unref) this.heartbeatTimer.unref();
  }

  async check(
    weight: number,
    maxConcurrent: number | null,
    minTime: number
  ): Promise<{ allowed: boolean; waitMs: number }> {
    const result = (await this._runScript(
      "check",
      [this._key("running"), this._key("reservoir"), this._key("last")],
      [
        String(weight),
        String(maxConcurrent ?? -1),
        String(Date.now()),
        String(minTime),
      ]
    )) as [number, number];
    return { allowed: result[0] === 1, waitMs: result[1] };
  }

  async done(count = 1): Promise<number> {
    return (await this._runScript("done", [this._key("running")], [
      String(count),
    ])) as number;
  }

  async getReservoir(): Promise<number | null> {
    const result = (await this._runScript(
      "reservoir",
      [this._key("reservoir")],
      ["get"]
    )) as number;
    return result === -1 ? null : result;
  }

  async setReservoir(amount: number): Promise<number> {
    return (await this._runScript("reservoir", [this._key("reservoir")], [
      "set",
      String(amount),
    ])) as number;
  }

  async incrementReservoir(amount: number, maximum?: number): Promise<number> {
    const args = ["incr", String(amount)];
    if (maximum != null) args.push(String(maximum));
    return (await this._runScript(
      "reservoir",
      [this._key("reservoir")],
      args
    )) as number;
  }

  async init(settings: Record<string, unknown>, ttl?: number): Promise<void> {
    await this._runScript(
      "init",
      [this._key("settings")],
      [JSON.stringify(settings), this.instanceId, String(ttl ?? 0)]
    );
  }

  async disconnect(): Promise<void> {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.client && !this.options.client) {
      // Only disconnect if we created the client
      await this.client.quit().catch(() => {});
    }
    this.client = null;
  }

  get connected(): boolean {
    return this.client != null;
  }

  private _key(suffix: string): string {
    return `${this.keyPrefix}${suffix}`;
  }

  private async _runScript(
    name: ScriptName,
    keys: string[],
    args: string[]
  ): Promise<unknown> {
    if (!this.client) {
      throw new Error("Redis not connected");
    }
    // Scripts are defined as custom commands on the client
    const fn = this.client[name];
    if (typeof fn !== "function") {
      throw new Error(`Script "${name}" not loaded`);
    }
    return fn.call(this.client, ...keys, ...args);
  }
}
