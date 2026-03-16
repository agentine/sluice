export interface ReservoirOptions {
  reservoir?: number | null;
  reservoirRefreshInterval?: number | null;
  reservoirRefreshAmount?: number | null;
  reservoirIncreaseInterval?: number | null;
  reservoirIncreaseAmount?: number | null;
  reservoirIncreaseMaximum?: number | null;
}

export class Reservoir {
  private _count: number | null;
  private refreshInterval: number | null;
  private refreshAmount: number | null;
  private increaseInterval: number | null;
  private increaseAmount: number | null;
  private increaseMaximum: number | null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private increaseTimer: ReturnType<typeof setInterval> | null = null;
  private onChange: (() => void) | null = null;

  constructor(options: ReservoirOptions = {}) {
    this._count = options.reservoir ?? null;
    this.refreshInterval = options.reservoirRefreshInterval ?? null;
    this.refreshAmount = options.reservoirRefreshAmount ?? null;
    this.increaseInterval = options.reservoirIncreaseInterval ?? null;
    this.increaseAmount = options.reservoirIncreaseAmount ?? null;
    this.increaseMaximum = options.reservoirIncreaseMaximum ?? null;
  }

  get count(): number | null {
    return this._count;
  }

  setOnChange(fn: () => void): void {
    this.onChange = fn;
  }

  start(): void {
    if (this.refreshInterval != null && this.refreshAmount != null) {
      this.refreshTimer = setInterval(() => {
        this._count = this.refreshAmount!;
        this.onChange?.();
      }, this.refreshInterval);
      if (this.refreshTimer.unref) this.refreshTimer.unref();
    }
    if (this.increaseInterval != null && this.increaseAmount != null) {
      this.increaseTimer = setInterval(() => {
        if (this._count == null) return;
        this._count += this.increaseAmount!;
        if (this.increaseMaximum != null && this._count > this.increaseMaximum) {
          this._count = this.increaseMaximum;
        }
        this.onChange?.();
      }, this.increaseInterval);
      if (this.increaseTimer.unref) this.increaseTimer.unref();
    }
  }

  stop(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
    if (this.increaseTimer) {
      clearInterval(this.increaseTimer);
      this.increaseTimer = null;
    }
  }

  tryConsume(weight: number): boolean {
    if (this._count == null) return true;
    if (this._count >= weight) {
      this._count -= weight;
      return true;
    }
    return false;
  }

  increment(amount: number): number | null {
    if (this._count == null) return null;
    this._count += amount;
    return this._count;
  }

  update(options: ReservoirOptions): void {
    this.stop();
    if (options.reservoir !== undefined) this._count = options.reservoir ?? null;
    if (options.reservoirRefreshInterval !== undefined) this.refreshInterval = options.reservoirRefreshInterval ?? null;
    if (options.reservoirRefreshAmount !== undefined) this.refreshAmount = options.reservoirRefreshAmount ?? null;
    if (options.reservoirIncreaseInterval !== undefined) this.increaseInterval = options.reservoirIncreaseInterval ?? null;
    if (options.reservoirIncreaseAmount !== undefined) this.increaseAmount = options.reservoirIncreaseAmount ?? null;
    if (options.reservoirIncreaseMaximum !== undefined) this.increaseMaximum = options.reservoirIncreaseMaximum ?? null;
    this.start();
  }
}
