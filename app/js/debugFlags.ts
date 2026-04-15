/**
 * Persisted debug UI flags (localStorage). Dispatches `vd-debug-flags-changed` on same-tab updates.
 */

const SHOW_ALL_RESEARCH_TREES_KEY = 'vibedarkness.debug.showAllResearchTrees';

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
