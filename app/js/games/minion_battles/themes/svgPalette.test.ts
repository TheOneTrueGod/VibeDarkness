/**
 * SVG palette guard: every SVG under a two-tone group's `card_defs/NN_*` folder is painted only with that
 * group's theme colours (primary, secondary, shade, font) plus black, white, `none`, `currentColor` and
 * `url(#…)` references. An 8-digit hex whose first six digits are allowed (an opacity-only variation)
 * also passes. SVGs are painted by hand; see `themes/AGENTS.md`.
 */
import { describe, expect, it } from 'vitest';
import { ABILITY_GROUP_THEMES } from './abilityThemes';
import { resolveAbilityTheme } from './abilityTheme';

const SVG_SOURCES = import.meta.glob('../card_defs/**/*.svg', {
    query: '?raw',
    import: 'default',
    eager: true,
}) as Record<string, string>;

/**
 * Per-file extra colours, keyed by path relative to `card_defs/` (e.g. `10_armory_core/foo.svg`).
 * Every entry needs a comment saying why it is not a theme colour.
 */
const PER_FILE_ALLOW: Readonly<Record<string, readonly string[]>> = {
    // Ice Shards: a bead of frozen blood in the back shard and a blood drop below it (Blood Mage reds),
    // because the card still feeds on bleeding enemies (Blood Splinters). Artbook `IceShardsIcon`.
    '15_water/1502_IceShards/iceShards.svg': ['#b91c1c', '#7f1d1d'],
};

/**
 * Two-tone groups whose card art is raster (PNG) only, so there is no SVG to guard yet. Each entry says why.
 */
const RASTER_ART_GROUPS: ReadonlySet<string> = new Set([
    // Command: Pet and Sic 'em art are PNGs; the core icon lives under character_defs/items.
    'command',
]);

const ALWAYS_ALLOWED = new Set(['#000000', '#ffffff', 'none', 'currentcolor', 'transparent']);

/** `fill`, `stroke` and `stop-color`, as attributes or inside `style` / `<style>` declarations. */
const PAINT_PATTERN = /(?:^|[\s;"'{])(fill|stroke|stop-color)\s*[=:]\s*["']?([^"';}>\s]+)/gi;

function normalize(value: string): string {
    const v = value.trim().toLowerCase();
    const short = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/.exec(v);
    if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
    return v;
}

function isAllowed(value: string, allowed: ReadonlySet<string>): boolean {
    const v = normalize(value);
    if (allowed.has(v)) return true;
    if (/^url\(#[^)]+\)$/.test(v)) return true;
    const withAlpha = /^(#[0-9a-f]{6})[0-9a-f]{2}$/.exec(v);
    return withAlpha !== null && allowed.has(withAlpha[1]);
}

function groupFolderPrefix(group: number): string {
    return `../card_defs/${String(group).padStart(2, '0')}_`;
}

const twoToneGroups = Object.entries(ABILITY_GROUP_THEMES)
    .filter(([, theme]) => theme?.secondary !== undefined)
    .map(([group, theme]) => ({ group: Number(group), theme: resolveAbilityTheme(theme!) }));

describe('SVG palette guard', () => {
    it('covers at least the Armory', () => {
        expect(twoToneGroups.map((g) => g.theme.id)).toContain('armory');
    });

    it('accepts theme colours, short black/white, alpha variants and url refs, and rejects strays', () => {
        const allowed = new Set([...ALWAYS_ALLOWED, '#4f6d8c']);
        expect(isAllowed('#4F6D8C', allowed)).toBe(true);
        expect(isAllowed('#4f6d8c80', allowed)).toBe(true);
        expect(isAllowed('#fff', allowed)).toBe(true);
        expect(isAllowed('url(#grad)', allowed)).toBe(true);
        expect(isAllowed('currentColor', allowed)).toBe(true);
        expect(isAllowed('#123456', allowed)).toBe(false);
        const found = [...'<g style="fill:#123456;stroke: #000"/>'.matchAll(PAINT_PATTERN)].map((m) => m[2]);
        expect(found).toEqual(['#123456', '#000']);
    });

    for (const { group, theme } of twoToneGroups) {
        const prefix = groupFolderPrefix(group);
        const files = Object.keys(SVG_SOURCES).filter((path) => path.startsWith(prefix));

        describe(`${theme.id} (group ${group})`, () => {
            it('has SVGs to check', () => {
                if (RASTER_ART_GROUPS.has(theme.id)) return;
                expect(files.length).toBeGreaterThan(0);
            });

            for (const path of files) {
                const relative = path.slice('../card_defs/'.length);
                it(`${relative} uses only theme colours`, () => {
                    const allowed = new Set<string>(ALWAYS_ALLOWED);
                    for (const c of [theme.primary, theme.secondary, theme.shade, theme.font]) {
                        if (c !== undefined) allowed.add(normalize(c));
                    }
                    for (const c of PER_FILE_ALLOW[relative] ?? []) allowed.add(normalize(c));

                    const offending = new Set<string>();
                    let paints = 0;
                    for (const match of SVG_SOURCES[path].matchAll(PAINT_PATTERN)) {
                        paints++;
                        if (!isAllowed(match[2], allowed)) offending.add(`${match[1]}=${match[2]}`);
                    }
                    expect(paints).toBeGreaterThan(0);
                    expect([...offending]).toEqual([]);
                });
            }
        });
    }
});
