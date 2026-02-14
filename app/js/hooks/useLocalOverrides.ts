/**
 * useLocalOverrides - Generic optimistic UI hook for multiplayer game state.
 *
 * When a client performs an interaction (e.g. vote, select character), the UI
 * normally waits for the server round-trip before reflecting the change. This
 * hook lets you set "local overrides" that are merged into the server state
 * immediately, giving instant visual feedback.
 *
 * Overrides are keyed by dot-separated paths (e.g. "missionVotes.player123")
 * and are automatically cleared once the server state catches up (i.e. the
 * server value matches the override value).
 *
 * Usage:
 *   const overrides = useLocalOverrides();
 *
 *   // On user interaction - set override for instant feedback
 *   overrides.set('missionVotes.player1', 'dark_awakening');
 *
 *   // Build effective state for rendering
 *   const effective = useMemo(
 *     () => overrides.applyTo({ missionVotes, characterSelections }),
 *     [missionVotes, characterSelections, overrides.applyTo]
 *   );
 *
 *   // When server data arrives, reconcile to prune stale overrides
 *   overrides.reconcile(serverData);
 *
 *   // On error, revert a specific override
 *   overrides.remove('missionVotes.player1');
 *
 *   // On phase change or reset, clear everything
 *   overrides.clear();
 */
import { useState, useCallback } from 'react';

// ---------------------------------------------------------------------------
// Path utilities
// ---------------------------------------------------------------------------

/** Read a value from a nested object using a dot-separated path. */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
    const parts = path.split('.');
    let current: unknown = obj;
    for (const part of parts) {
        if (current == null || typeof current !== 'object') return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

/** Set a value in a nested object by dot-separated path (mutates in place). */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split('.');
    let current: Record<string, unknown> = obj;
    for (let i = 0; i < parts.length - 1; i++) {
        const part = parts[i];
        if (current[part] == null || typeof current[part] !== 'object') {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }
    current[parts[parts.length - 1]] = value;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseLocalOverridesReturn {
    /**
     * Set a local override. The `path` is a dot-separated key into the game
     * state object (e.g. "missionVotes.player123"). Call this immediately when
     * the user performs an action, *before* awaiting the server request.
     */
    set: (path: string, value: unknown) => void;

    /**
     * Remove a single override by path. Use this to revert an optimistic
     * update when the server request fails.
     */
    remove: (path: string) => void;

    /**
     * Return a shallow-then-deep-patched copy of `data` with all current
     * overrides applied. The original object is not mutated.
     *
     * NOTE: This function's reference changes whenever the overrides change,
     * making it safe to use as a `useMemo` dependency.
     */
    applyTo: <T extends Record<string, unknown>>(data: T) => T;

    /**
     * Reconcile overrides against fresh server data. Any override whose value
     * now matches what the server reports is automatically removed (the server
     * "caught up"). Overrides where the server still has an older value are
     * kept.
     */
    reconcile: (serverData: Record<string, unknown>) => void;

    /** Clear all overrides (e.g. on phase change or game reset). */
    clear: () => void;
}

export function useLocalOverrides(): UseLocalOverridesReturn {
    const [overrides, setOverrides] = useState<Record<string, unknown>>({});

    // -- Stable callbacks (don't depend on `overrides` closure) -------------

    const set = useCallback((path: string, value: unknown) => {
        setOverrides((prev) => ({ ...prev, [path]: value }));
    }, []);

    const remove = useCallback((path: string) => {
        setOverrides((prev) => {
            if (!(path in prev)) return prev;
            const next = { ...prev };
            delete next[path];
            return next;
        });
    }, []);

    const clear = useCallback(() => setOverrides({}), []);

    const reconcile = useCallback((serverData: Record<string, unknown>) => {
        setOverrides((prev) => {
            const keys = Object.keys(prev);
            if (keys.length === 0) return prev;

            const next: Record<string, unknown> = {};
            let changed = false;

            for (const key of keys) {
                const serverVal = getByPath(serverData, key);
                if (serverVal === prev[key]) {
                    // Server has caught up - drop this override
                    changed = true;
                } else {
                    next[key] = prev[key];
                }
            }

            return changed ? next : prev;
        });
    }, []);

    // -- applyTo changes when overrides change (intentional) ----------------

    const applyTo = useCallback(
        <T extends Record<string, unknown>>(data: T): T => {
            const keys = Object.keys(overrides);
            if (keys.length === 0) return data;

            // Deep clone so we never mutate the caller's data
            const result = JSON.parse(JSON.stringify(data)) as T;
            for (const key of keys) {
                setByPath(result as Record<string, unknown>, key, overrides[key]);
            }
            return result;
        },
        [overrides],
    );

    return { set, remove, applyTo, reconcile, clear };
}
