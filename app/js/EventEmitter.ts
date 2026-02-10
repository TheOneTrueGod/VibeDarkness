/**
 * Simple EventEmitter for pub/sub pattern
 * Used for decoupling components
 */
class EventEmitter {
    private events = new Map<string, Set<(...args: unknown[]) => void>>();

    /**
     * Subscribe to an event
     */
    on(event: string, callback: (...args: unknown[]) => void): () => void {
        if (!this.events.has(event)) {
            this.events.set(event, new Set());
        }
        this.events.get(event)!.add(callback);
        return () => this.off(event, callback);
    }

    /**
     * Subscribe to an event once
     */
    once(event: string, callback: (...args: unknown[]) => void): void {
        const wrapper = (...args: unknown[]) => {
            this.off(event, wrapper);
            callback(...args);
        };
        this.on(event, wrapper);
    }

    /**
     * Unsubscribe from an event
     */
    off(event: string, callback: (...args: unknown[]) => void): void {
        if (this.events.has(event)) {
            this.events.get(event)!.delete(callback);
        }
    }

    /**
     * Emit an event
     */
    emit(event: string, ...args: unknown[]): void {
        if (this.events.has(event)) {
            for (const callback of this.events.get(event)!) {
                try {
                    callback(...args);
                } catch (error) {
                    console.error(`Error in event handler for '${event}':`, error);
                }
            }
        }
    }

    /**
     * Remove all listeners for an event (or all events)
     */
    removeAllListeners(event?: string): void {
        if (event) {
            this.events.delete(event);
        } else {
            this.events.clear();
        }
    }
}
