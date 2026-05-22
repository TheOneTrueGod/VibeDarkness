/**
 * GameObject - Base class for all game objects in the battle engine.
 *
 * Provides common properties (id, position, active flag) and the
 * contract for update and serialization.
 */

let nextId = 1;

export function generateGameObjectId(prefix: string = 'obj'): string {
    return `${prefix}_${nextId++}`;
}

/** Reset the ID counter (used when deserializing a full game state). */
export function resetGameObjectIdCounter(value: number = 1): void {
    nextId = value;
}

export abstract class GameObject {
    id: string;
    x: number;
    y: number;
    active: boolean;

    constructor(id: string, x: number, y: number) {
        this.id = id;
        this.x = x;
        this.y = y;
        this.active = true;
    }

    /** Called every fixed-step tick. dt is in seconds. Override in subclasses that need engine context. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    update(_dt: number, _engine: unknown): void { /* no-op by default */ }

    /** Serialize to a plain object for server sync. Override in subclasses that support serialization. */
    toJSON(): Record<string, unknown> { return {}; }

    /** Deactivate this object (will be cleaned up by the engine). */
    destroy(): void {
        this.active = false;
    }
}
