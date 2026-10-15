/** A tiny typed event emitter. A throwing listener never stops the others. */
export class Emitter<Events extends object> {
  private readonly listeners = new Map<keyof Events, Set<(event: never) => void>>();

  on<K extends keyof Events>(name: K, listener: (event: Events[K]) => void): () => void {
    let set = this.listeners.get(name);
    if (!set) {
      set = new Set();
      this.listeners.set(name, set);
    }
    set.add(listener as (event: never) => void);
    return () => this.off(name, listener);
  }

  off<K extends keyof Events>(name: K, listener: (event: Events[K]) => void): void {
    this.listeners.get(name)?.delete(listener as (event: never) => void);
  }

  emit<K extends keyof Events>(name: K, event: Events[K]): void {
    const set = this.listeners.get(name);
    if (!set) return;
    for (const listener of [...set]) {
      try {
        (listener as (event: Events[K]) => void)(event);
      } catch (error) {
        // Report, never rethrow: one integrator bug must not break the chat.
        if (typeof console !== "undefined") console.error("[busymate-ai-web] listener for", String(name), "threw", error);
      }
    }
  }

  clear(): void {
    this.listeners.clear();
  }
}
