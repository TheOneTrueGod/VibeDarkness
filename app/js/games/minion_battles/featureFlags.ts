/**
 * Minion Battles client feature flags.
 *
 * **ITS playahead (sequential targeting)** is a per-player setting kept in this browser's
 * localStorage and toggled from the Debug Console's Debug Toggles tab. On (the default): clicking
 * an ability with select steps starts an Interactive Targeting Session that plays ahead and asks
 * for each pick when the cast reaches it. Off: clicking the ability asks for every target up
 * front (`AbilityTargetingTool`) and submits one full order. It only changes how this player
 * builds orders; the engine and other players see ordinary orders either way.
 */

const SEQUENTIAL_TARGETING_DISABLED_KEY = 'vibedarkness.debug.disableSequentialTargeting';
const FLAGS_CHANGED_EVENT = 'vd-debug-flags-changed';

function readStoredSequentialTargeting(): boolean {
    try {
        return globalThis.localStorage?.getItem(SEQUENTIAL_TARGETING_DISABLED_KEY) !== '1';
    } catch {
        return true;
    }
}

/** In-memory value (also works where there is no localStorage, e.g. node tests). */
let sequentialTargetingEnabled = readStoredSequentialTargeting();
const listeners = new Set<() => void>();

/** True when this player uses ITS playahead (default). False: all targets are picked up front. */
export function isSequentialTargetingEnabled(): boolean {
    return sequentialTargetingEnabled;
}

export function setSequentialTargetingEnabled(enabled: boolean): void {
    sequentialTargetingEnabled = enabled;
    try {
        if (enabled) globalThis.localStorage?.removeItem(SEQUENTIAL_TARGETING_DISABLED_KEY);
        else globalThis.localStorage?.setItem(SEQUENTIAL_TARGETING_DISABLED_KEY, '1');
    } catch {
        /* ignore */
    }
    listeners.forEach((listener) => listener());
    if (typeof window !== 'undefined') window.dispatchEvent(new Event(FLAGS_CHANGED_EVENT));
}

export function subscribeSequentialTargetingEnabled(onStoreChange: () => void): () => void {
    listeners.add(onStoreChange);
    // Another tab changed the stored value.
    const onStorage = (e: StorageEvent) => {
        if (e.key !== SEQUENTIAL_TARGETING_DISABLED_KEY) return;
        sequentialTargetingEnabled = readStoredSequentialTargeting();
        onStoreChange();
    };
    if (typeof window !== 'undefined') window.addEventListener('storage', onStorage);
    return () => {
        listeners.delete(onStoreChange);
        if (typeof window !== 'undefined') window.removeEventListener('storage', onStorage);
    };
}
