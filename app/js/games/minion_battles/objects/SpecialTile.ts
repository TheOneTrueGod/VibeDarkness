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
}

export function specialTileToJSON(t: SpecialTile): Record<string, unknown> {
    return { id: t.id, defId: t.defId, col: t.col, row: t.row, hp: t.hp };
}

export function specialTileFromJSON(
    data: Record<string, unknown>,
    def: { maxHp: number },
): SpecialTile {
    return {
        id: data.id as string,
        defId: data.defId as string,
        col: data.col as number,
        row: data.row as number,
        hp: data.hp as number,
        maxHp: def.maxHp,
    };
}
