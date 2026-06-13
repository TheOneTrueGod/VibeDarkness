import type { AbilityTag } from './Ability';

/**
 * Typed optional settings for each ability tag's catalog entry.
 * Add a property when a tag gains configurable defaults; keep keys in sync with `AbilityTag`.
 */
export type AbilityTagSettingsByTag = {
    /** No catalog defaults yet; replace with a richer type when this tag gains options. */
    priority: PriorityTagSettings;
    meleeTracking: PriorityTagSettings;
    evade: PriorityTagSettings;
    Entombed: PriorityTagSettings;
    RockThrow: PriorityTagSettings;
    free: PriorityTagSettings;
};

/** Empty settings object type for tags with no catalog options yet. */
export type PriorityTagSettings = Record<never, never>;

export type AbilityTagCatalogEntry<K extends AbilityTag> = {
    hint: string;
    /** Display name for tooltip auto-description lines. Defaults to the tag key. */
    displayName?: string;
    /** CSS hex colour for the auto-description line (e.g. '#CD853F'). Defaults to yellow (#FFD700). */
    colour?: string;
    /** If true, a trailing number is shown next to the name when a magnitude is provided. */
    hasMagnitude?: boolean;
    /** If true, the tag line is automatically appended to tooltip lines via buildTagDescriptionLines(). */
    autoAddToDescription?: boolean;
    defaultSettings?: AbilityTagSettingsByTag[K];
};

/** Full catalog: one entry per `AbilityTag`, strongly keyed by tag name. */
export type AbilityTagCatalog = {
    [K in AbilityTag]: AbilityTagCatalogEntry<K>;
};

const DEFAULT_TAG_COLOUR = '#FFD700';

export const ABILITY_TAG_CATALOG: AbilityTagCatalog = {
    priority: { hint: 'Recovers First' },
    meleeTracking: { hint: 'Tracks Target' },
    evade: { hint: 'Evades' },
    Entombed: {
        hint: 'Usable in Walls',
        colour: '#CD853F',
        hasMagnitude: true,
        autoAddToDescription: true,
    },
    RockThrow: { hint: 'Rock Throw' },
    free: { hint: 'Free Action' },
};

export function getAbilityTagCatalogEntry<K extends AbilityTag>(tag: K): AbilityTagCatalogEntry<K> {
    return ABILITY_TAG_CATALOG[tag];
}

export function getAbilityTagHint(tag: AbilityTag): string {
    return getAbilityTagCatalogEntry(tag).hint;
}

/**
 * Builds tooltip description lines for tags that have `autoAddToDescription: true`.
 * Each line uses the `{text:#colour}` syntax understood by AbilityTooltip's parseTooltipLine.
 * Pass `magnitudes` to show a trailing number for tags with `hasMagnitude: true`.
 *
 * `tags` accepts plain strings (matching AbilityTag values) so it works with both the static
 * `ability.tags` array and the `mod.addTags` string array from research modifiers.
 */
export function buildTagDescriptionLines(
    tags: readonly string[],
    magnitudes?: Partial<Record<string, number>>,
): string[] {
    const lines: string[] = [];
    for (const tag of tags) {
        const entry = ABILITY_TAG_CATALOG[tag as AbilityTag];
        if (!entry?.autoAddToDescription) continue;
        const colour = entry.colour ?? DEFAULT_TAG_COLOUR;
        const name = entry.displayName ?? tag;
        const magnitude = magnitudes?.[tag];
        if (entry.hasMagnitude && magnitude !== undefined) {
            lines.push(`{${name}:${colour}} {${magnitude}}`);
        } else {
            lines.push(`{${name}:${colour}}`);
        }
    }
    return lines;
}
