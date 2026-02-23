/**
 * Static NPC definitions for level events and chat messages.
 * Each NPC has an id, name, and color used when displaying their messages.
 */

export interface NpcDef {
    id: string;
    name: string;
    color: string;
}

/** NPC 1: Narrator - used for level event messages. */
export const NPCS: Record<string, NpcDef> = {
    '1': {
        id: '1',
        name: 'Narrator',
        color: '#2563eb', // blue-600
    },
} as const;

export type NpcId = keyof typeof NPCS;

export function getNpc(id: string): NpcDef | undefined {
    return NPCS[id];
}
