type EventHandler = (...args: unknown[]) => void;

export class EventEmitter {
  private handlers: Map<string, EventHandler[]> = new Map();

  on(event: string, handler: EventHandler): this {
    let list = this.handlers.get(event);
    if (!list) {
      list = [];
      this.handlers.set(event, list);
    }
    list.push(handler);
    return this;
  }

  once(event: string, handler: EventHandler): this {
    const wrapped = (...args: unknown[]) => {
      this.off(event, wrapped);
      handler(...args);
    };
    (wrapped as { _original?: EventHandler })._original = handler;
    return this.on(event, wrapped);
  }

  off(event: string, handler: EventHandler): this {
    const list = this.handlers.get(event);
    if (!list) return this;
    const idx = list.findIndex(
      (h) => h === handler || (h as { _original?: EventHandler })._original === handler
    );
    if (idx !== -1) list.splice(idx, 1);
    return this;
  }

  removeAllListeners(event?: string): this {
    if (event) {
      this.handlers.delete(event);
    } else {
      this.handlers.clear();
    }
    return this;
  }

  emit(event: string, ...args: unknown[]): boolean {
    const list = this.handlers.get(event);
    if (!list || list.length === 0) return false;
    for (const handler of [...list]) {
      try {
        handler(...args);
      } catch {
        // swallow listener errors
      }
    }
    return true;
  }

  listenerCount(event: string): number {
    return this.handlers.get(event)?.length ?? 0;
  }
}
