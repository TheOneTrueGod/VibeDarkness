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
    /** If true, AI can "corrupt" this tile (deal damage over time when at the tile). */
    destructible?: boolean;
    /** Light at full HP (amount and radius); scaled by hp/maxHp for actual emission. */
    emitsLight?: { lightAmount: number; radius: number };
}

export function specialTileToJSON(t: SpecialTile): Record<string, unknown> {
    const out: Record<string, unknown> = { id: t.id, defId: t.defId, col: t.col, row: t.row, hp: t.hp };
    if (t.destructible !== undefined) out.destructible = t.destructible;
    if (t.emitsLight !== undefined) out.emitsLight = t.emitsLight;
    return out;
}

export function specialTileFromJSON(
    data: Record<string, unknown>,
    def: { maxHp: number; lightEmission?: number; lightRadius?: number },
): SpecialTile {
    const rawEmits = data.emitsLight;
    const emitsLight =
        rawEmits && typeof rawEmits === 'object' && 'lightAmount' in rawEmits && 'radius' in rawEmits
            ? { lightAmount: (rawEmits as { lightAmount: number }).lightAmount, radius: (rawEmits as { radius: number }).radius }
            : def && 'lightEmission' in def && 'lightRadius' in def
              ? { lightAmount: (def as { lightEmission: number }).lightEmission, radius: (def as { lightRadius: number }).lightRadius }
              : undefined;
    return {
        id: data.id as string,
        defId: data.defId as string,
        col: data.col as number,
        row: data.row as number,
        hp: data.hp as number,
        maxHp: def.maxHp,
        destructible: data.destructible as boolean | undefined,
        emitsLight,
    };
}
