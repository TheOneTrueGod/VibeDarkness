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
    emitsLight?: { lightAmount: number; radius: number };
    /** If true, each round light amount and radius are reduced (campfire dying down). */
    decayLightPerRound?: boolean;
    /** For Crystal: tile distance (Chebyshev) for protection aura and terrain blocking. Set from mission placement. */
    protectRadius?: number;
}

export function specialTileToJSON(t: SpecialTile): Record<string, unknown> {
    const out: Record<string, unknown> = { id: t.id, defId: t.defId, col: t.col, row: t.row, hp: t.hp, maxHp: t.maxHp };
    if (t.defendPoint !== undefined) out.defendPoint = t.defendPoint;
    if (t.destructible !== undefined) out.destructible = t.destructible;
    if (t.emitsLight !== undefined) out.emitsLight = t.emitsLight;
    if (t.decayLightPerRound !== undefined) out.decayLightPerRound = t.decayLightPerRound;
    if (t.protectRadius !== undefined) out.protectRadius = t.protectRadius;
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
            ? { lightAmount: (rawEmits as { lightAmount: number }).lightAmount, radius: (rawEmits as { radius: number }).radius }
            : undefined;
    const maxHp = (data.maxHp as number) ?? 1;
    return {
        id: data.id as string,
        defId: data.defId as string,
        col: data.col as number,
        row: data.row as number,
        hp: data.hp as number,
        maxHp,
        defendPoint: data.defendPoint as boolean | undefined,
        destructible: data.destructible as boolean | undefined,
        emitsLight,
        decayLightPerRound: data.decayLightPerRound as boolean | undefined,
        protectRadius: data.protectRadius as number | undefined,
    };
}
