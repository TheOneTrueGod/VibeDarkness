/**
 * The one table of character values shown as pills in research and reward text (Health, Attack, ...).
 * Distinct from campaign resources (`campaignResources.ts`): these live on the battle unit.
 * Adding one is an edit here (plus its icon in `components/StatPill.tsx`).
 */

import { ATTACK_DAMAGE_MULT_PER_POINT } from './researchTrees/types';

/**
 * `resource`: a pool the unit spends or loses (Health). `stat`: a number that scales what the unit does
 * (Attack). Both draw as a pill today; the kind lets later UI treat them differently.
 */
export type CharacterValueKind = 'resource' | 'stat';

export const CHARACTER_STAT_DEFS = [
    { key: 'health', label: 'Max Health', color: '#22c55e', kind: 'resource', reminder: null },
    {
        key: 'attack',
        label: 'Attack',
        color: '#3b82f6',
        kind: 'stat',
        // Spelled with tokens so the reminder card draws the pill: "[sword +1] = +10% damage".
        reminder: `{stat:attack:+1} = {+${Math.round(ATTACK_DAMAGE_MULT_PER_POINT * 100)}%} damage`,
    },
] as const satisfies readonly {
    key: string;
    label: string;
    color: string;
    kind: CharacterValueKind;
    /**
     * What one point does, shown on a reminder card beside any tooltip whose text has this stat's pill
     * (like keyword cards beside ability tooltips). Description-token syntax; null when the pill says it all.
     */
    reminder: string | null;
}[];

export type CharacterStatKey = (typeof CHARACTER_STAT_DEFS)[number]['key'];

export type CharacterStatDef = (typeof CHARACTER_STAT_DEFS)[number];

export function characterStatDef(key: CharacterStatKey): CharacterStatDef {
    return CHARACTER_STAT_DEFS.find((def) => def.key === key)!;
}

export function isCharacterStatKey(key: string): key is CharacterStatKey {
    return CHARACTER_STAT_DEFS.some((def) => def.key === key);
}

/** Description token that research text renders as a stat pill: `{stat:<key>:<amount>}`. */
const STAT_TOKEN_PREFIX = 'stat:';

/** `{stat:health:+20}` for a node `description`; the card draws it as a pill (plain text: "+20 Max Health"). */
export function statPillToken(key: CharacterStatKey, amount: string | number): string {
    return `{${STAT_TOKEN_PREFIX}${key}:${amount}}`;
}

/** Parses the inside of a `{...}` description token as a stat pill, or null when it is a plain highlight. */
export function parseStatPillToken(inner: string): { key: CharacterStatKey; amount: string } | null {
    if (!inner.startsWith(STAT_TOKEN_PREFIX)) return null;
    const rest = inner.slice(STAT_TOKEN_PREFIX.length);
    const sep = rest.indexOf(':');
    if (sep < 0) return null;
    const key = rest.slice(0, sep);
    if (!isCharacterStatKey(key)) return null;
    return { key, amount: rest.slice(sep + 1) };
}

/** Reminder cards for the stats whose pills appear in `text`, in first-use order (stats without a reminder are skipped). */
export function statRemindersInText(text: string): { key: CharacterStatKey; title: string; reminder: string }[] {
    const seen = new Set<CharacterStatKey>();
    const out: { key: CharacterStatKey; title: string; reminder: string }[] = [];
    for (const match of text.matchAll(/\{([^}]*)\}/g)) {
        const pill = parseStatPillToken(match[1]);
        if (!pill || seen.has(pill.key)) continue;
        seen.add(pill.key);
        const def = characterStatDef(pill.key);
        if (def.reminder) out.push({ key: pill.key, title: def.label, reminder: def.reminder });
    }
    return out;
}

/** Plain-text form of a stat pill (titles, tooltips, logs). */
export function formatStatPillText(key: CharacterStatKey, amount: string): string {
    return `${amount} ${characterStatDef(key).label}`;
}
