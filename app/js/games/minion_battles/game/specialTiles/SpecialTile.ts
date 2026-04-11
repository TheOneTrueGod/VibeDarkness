/**
 * Special tile - runtime object for defend points and other special tiles.
 *
 * Tracks position (grid), HP, and references the definition for image and maxHp.
 */

/** Runtime special tile (position, hp, etc.). */
export interface SpecialTile {
    id: string;
    defId: string;
    col: number;
    row: number;
    hp: number;
    maxHp: number;
    /** If true, AI treats this tile as a defend point (seek and siege). Set from mission placement. */
    defendPoint?: boolean;
    /** If true, AI can "corrupt" this tile (deal damage over time when at the tile). */
    destructible?: boolean;
    /** Light at full HP (amount and radius); scaled by hp/maxHp for actual emission. */
    emitsLight?: {
        lightAmount: number;
        radius: number;
        /**
         * Optional decay config.
         * `decayRate` is how much light amount is lost each `decayInterval` (expressed in rounds).
         */
        decayRate?: number;
        /**
         * How often to decay, expressed in rounds.
         * Example: decayInterval=0.25 means 4 decays per round.
         */
        decayInterval?: number;
    };
    /** Internal: next time (in rounds since start) we apply one decay step. */
    lightDecayNextAtRound?: number;
    /** For Crystal: tile distance (Chebyshev) for protection aura and terrain blocking. Set from mission placement. */
    protectRadius?: number;
    /** For DarkCrystal: purple color filter. Set from mission placement. */
    colorFilter?: { color: number; alpha: number; filterRadius: number };
}

export function specialTileToJSON(t: SpecialTile): Record<string, unknown> {
    const out: Record<string, unknown> = { id: t.id, defId: t.defId, col: t.col, row: t.row, hp: t.hp, maxHp: t.maxHp };
    if (t.defendPoint !== undefined) out.defendPoint = t.defendPoint;
    if (t.destructible !== undefined) out.destructible = t.destructible;
    if (t.emitsLight !== undefined) out.emitsLight = t.emitsLight;
    if (t.lightDecayNextAtRound !== undefined) out.lightDecayNextAtRound = t.lightDecayNextAtRound;
    if (t.protectRadius !== undefined) out.protectRadius = t.protectRadius;
    if (t.colorFilter !== undefined) out.colorFilter = t.colorFilter;
    return out;
}

/** Minimal def shape for fromJSON (def only supplies image/id; maxHp/light/protect come from data). */
export interface SpecialTileDefForJSON {
    id?: string;
    image?: string;
}

export function specialTileFromJSON(
    data: Record<string, unknown>,
    _def?: SpecialTileDefForJSON,
): SpecialTile {
    const rawEmits = data.emitsLight;
    const emitsLight =
        rawEmits && typeof rawEmits === 'object' && 'lightAmount' in rawEmits && 'radius' in rawEmits
            ? {
                  lightAmount: (rawEmits as { lightAmount: number }).lightAmount,
                  radius: (rawEmits as { radius: number }).radius,
                  decayRate: (rawEmits as { decayRate?: number }).decayRate,
                  decayInterval: (rawEmits as { decayInterval?: number }).decayInterval,
              }
            : undefined;
    const maxHp = (data.maxHp as number) ?? 1;
    const legacyDecayLightPerRound = data.decayLightPerRound as boolean | undefined;

    // Backward compat: migrate legacy `decayLightPerRound` -> emitsLight.decayRate/decayInterval.
    const migratedEmitsLight =
        legacyDecayLightPerRound && emitsLight
            ? {
                  ...emitsLight,
                  decayRate: emitsLight.decayRate ?? 1,
                  decayInterval: emitsLight.decayInterval ?? 1,
              }
            : emitsLight;
    return {
        id: data.id as string,
        defId: data.defId as string,
        col: data.col as number,
        row: data.row as number,
        hp: data.hp as number,
        maxHp,
        defendPoint: data.defendPoint as boolean | undefined,
        destructible: data.destructible as boolean | undefined,
        emitsLight: migratedEmitsLight,
        lightDecayNextAtRound: data.lightDecayNextAtRound as number | undefined,
        protectRadius: data.protectRadius as number | undefined,
        colorFilter: data.colorFilter as { color: number; alpha: number; filterRadius: number } | undefined,
    };
}

/**
 * Decide whether a special tile should be treated as a "defend point" by AI.
 * - `defendPoint` flag must be enabled
 * - `hp` must be > 0
 * - if the tile emits light, it must currently still emit > 0 light
 */
export function isTileDefendPoint(tile: SpecialTile): boolean {
    if (tile.defendPoint !== true) return false;
    if (tile.hp <= 0) return false;
    if (!tile.emitsLight) return true;

    const maxHp = tile.maxHp > 0 ? tile.maxHp : 1;
    const effectiveLight = tile.emitsLight.lightAmount * (tile.hp / maxHp);
    return effectiveLight > 0;
}
