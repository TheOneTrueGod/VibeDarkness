import type { AbilityTag } from './Ability';

/**
 * Typed optional settings for each ability tag’s catalog entry.
 * Add a property when a tag gains configurable defaults; keep keys in sync with `AbilityTag`.
 */
export type AbilityTagSettingsByTag = {
    /** No catalog defaults yet; replace with a richer type when this tag gains options. */
    priority: PriorityTagSettings;
};

/** Empty settings object type for tags with no catalog options yet. */
export type PriorityTagSettings = Record<never, never>;

export type AbilityTagCatalogEntry<K extends AbilityTag> = {
    hint: string;
    defaultSettings?: AbilityTagSettingsByTag[K];
};

/** Full catalog: one entry per `AbilityTag`, strongly keyed by tag name. */
export type AbilityTagCatalog = {
    [K in AbilityTag]: AbilityTagCatalogEntry<K>;
};

export const ABILITY_TAG_CATALOG: AbilityTagCatalog = {
    priority: { hint: 'Recovers First' },
};

export function getAbilityTagCatalogEntry<K extends AbilityTag>(tag: K): AbilityTagCatalogEntry<K> {
    return ABILITY_TAG_CATALOG[tag];
}

export function getAbilityTagHint(tag: AbilityTag): string {
    return getAbilityTagCatalogEntry(tag).hint;
}
