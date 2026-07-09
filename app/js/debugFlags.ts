/**
 * Persisted debug UI flags (localStorage). Dispatches `vd-debug-flags-changed` on same-tab updates.
 */

const SHOW_ALL_RESEARCH_TREES_KEY = 'vibedarkness.debug.showAllResearchTrees';
const ALWAYS_SHOW_SYNC_STATUS_KEY = 'vibedarkness.debug.alwaysShowSyncStatus';
const SHOW_GAME_TICK_KEY = 'vibedarkness.debug.showGameTick';

export function getShowAllResearchTrees(): boolean {
    try {
        return localStorage.getItem(SHOW_ALL_RESEARCH_TREES_KEY) === '1';
    } catch {
        return false;
    }
}

export function setShowAllResearchTrees(value: boolean): void {
    try {
        localStorage.setItem(SHOW_ALL_RESEARCH_TREES_KEY, value ? '1' : '0');
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new Event('vd-debug-flags-changed'));
}

export function subscribeShowAllResearchTrees(onStoreChange: () => void): () => void {
    const handler = () => onStoreChange();
    window.addEventListener('vd-debug-flags-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
        window.removeEventListener('vd-debug-flags-changed', handler);
        window.removeEventListener('storage', handler);
    };
}

export function getAlwaysShowSyncStatus(): boolean {
    try {
        return localStorage.getItem(ALWAYS_SHOW_SYNC_STATUS_KEY) === '1';
    } catch {
        return false;
    }
}

export function setAlwaysShowSyncStatus(value: boolean): void {
    try {
        localStorage.setItem(ALWAYS_SHOW_SYNC_STATUS_KEY, value ? '1' : '0');
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new Event('vd-debug-flags-changed'));
}

export function subscribeAlwaysShowSyncStatus(onStoreChange: () => void): () => void {
    const handler = () => onStoreChange();
    window.addEventListener('vd-debug-flags-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
        window.removeEventListener('vd-debug-flags-changed', handler);
        window.removeEventListener('storage', handler);
    };
}

export function getShowGameTick(): boolean {
    try {
        return localStorage.getItem(SHOW_GAME_TICK_KEY) === '1';
    } catch {
        return false;
    }
}

export function setShowGameTick(value: boolean): void {
    try {
        localStorage.setItem(SHOW_GAME_TICK_KEY, value ? '1' : '0');
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new Event('vd-debug-flags-changed'));
}

export function subscribeShowGameTick(onStoreChange: () => void): () => void {
    const handler = () => onStoreChange();
    window.addEventListener('vd-debug-flags-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
        window.removeEventListener('vd-debug-flags-changed', handler);
        window.removeEventListener('storage', handler);
    };
}

const RESOURCE_BAR_DEBUG_KEY = 'vibedarkness.debug.resourceBarDebug';
const RESOURCE_BAR_DEBUG_FILL_KEY = 'vibedarkness.debug.resourceBarDebugFill';

export function getResourceBarDebugEnabled(): boolean {
    try {
        return localStorage.getItem(RESOURCE_BAR_DEBUG_KEY) === '1';
    } catch {
        return false;
    }
}

export function setResourceBarDebugEnabled(value: boolean): void {
    try {
        localStorage.setItem(RESOURCE_BAR_DEBUG_KEY, value ? '1' : '0');
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new Event('vd-debug-flags-changed'));
}

/** Returns the current debug fill percentage (0–100). Defaults to 50. */
export function getResourceBarDebugFill(): number {
    try {
        const raw = localStorage.getItem(RESOURCE_BAR_DEBUG_FILL_KEY);
        const n = raw !== null ? parseInt(raw, 10) : NaN;
        return isNaN(n) ? 50 : Math.max(0, Math.min(100, n));
    } catch {
        return 50;
    }
}

export function setResourceBarDebugFill(value: number): void {
    try {
        localStorage.setItem(RESOURCE_BAR_DEBUG_FILL_KEY, String(Math.round(value)));
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new Event('vd-debug-flags-changed'));
}

export function subscribeResourceBarDebug(onStoreChange: () => void): () => void {
    const handler = () => onStoreChange();
    window.addEventListener('vd-debug-flags-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
        window.removeEventListener('vd-debug-flags-changed', handler);
        window.removeEventListener('storage', handler);
    };
}

const USER_STATE_LOGGING_KEY = 'vibedarkness.debug.userStateLogging';

export function getUserStateLogging(): boolean {
    try {
        return localStorage.getItem(USER_STATE_LOGGING_KEY) === '1';
    } catch {
        return false;
    }
}

export function setUserStateLogging(value: boolean): void {
    try {
        localStorage.setItem(USER_STATE_LOGGING_KEY, value ? '1' : '0');
    } catch {
        /* ignore */
    }
    window.dispatchEvent(new Event('vd-debug-flags-changed'));
}

export function subscribeUserStateLogging(onStoreChange: () => void): () => void {
    const handler = () => onStoreChange();
    window.addEventListener('vd-debug-flags-changed', handler);
    window.addEventListener('storage', handler);
    return () => {
        window.removeEventListener('vd-debug-flags-changed', handler);
        window.removeEventListener('storage', handler);
    };
}
