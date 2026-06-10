/**
 * Session-only render-layer visibility for battle debugging.
 * Defaults to all visible; not persisted across page refreshes.
 */

export const RENDER_LAYER_IDS = [
    'terrain',
    'overlay',
    'floorTiles',
    'terrainEffects',
    'units',
    'specialTiles',
    'lightSources',
    'projectiles',
    'effects',
    'previews',
    'hudEffects',
] as const;

export type RenderLayerId = (typeof RENDER_LAYER_IDS)[number];

export type RenderVisibilitySnapshot = Record<RenderLayerId, boolean>;

export const RENDER_LAYER_LABELS: Record<RenderLayerId, string> = {
    terrain: 'Terrain',
    overlay: 'Overlay (darkness, fog, crystal auras)',
    floorTiles: 'Floor tiles',
    terrainEffects: 'Terrain effects',
    units: 'Units',
    specialTiles: 'Special tiles',
    lightSources: 'Light sources',
    projectiles: 'Projectiles',
    effects: 'Effects',
    previews: 'Targeting & move previews',
    hudEffects: 'HUD effects (screen-space canvas)',
};

function createDefaultSnapshot(): RenderVisibilitySnapshot {
    return {
        terrain: true,
        overlay: true,
        floorTiles: true,
        terrainEffects: true,
        units: true,
        specialTiles: true,
        lightSources: true,
        projectiles: true,
        effects: true,
        previews: true,
        hudEffects: true,
    };
}

/** Stable reference until a layer toggles; required for useSyncExternalStore getSnapshot. */
let snapshot: RenderVisibilitySnapshot = createDefaultSnapshot();

const listeners = new Set<() => void>();

export function subscribeRenderVisibility(onStoreChange: () => void): () => void {
    listeners.add(onStoreChange);
    return () => listeners.delete(onStoreChange);
}

function notify(): void {
    for (const listener of listeners) {
        listener();
    }
}

export function isRenderLayerVisible(layer: RenderLayerId): boolean {
    return snapshot[layer];
}

export function setRenderLayerVisible(layer: RenderLayerId, visible: boolean): void {
    if (snapshot[layer] === visible) return;
    snapshot = { ...snapshot, [layer]: visible };
    notify();
}

export function getRenderVisibilitySnapshot(): RenderVisibilitySnapshot {
    return snapshot;
}
