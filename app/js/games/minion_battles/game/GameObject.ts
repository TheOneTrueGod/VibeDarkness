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

    /** Called every fixed-step tick. dt is in seconds. */
    abstract update(dt: number, engine: unknown): void;

    /** Serialize to a plain object for server sync. */
    abstract toJSON(): Record<string, unknown>;

    /** Deactivate this object (will be cleaned up by the engine). */
    destroy(): void {
        this.active = false;
    }
}
