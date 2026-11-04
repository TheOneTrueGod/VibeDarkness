import { describe, expect, it } from 'vitest';

/**
 * Layering guard: engine code (`game/`, `resources/`, `app/js/researchTrees/`) owns generic definitions
 * (conjured weapons, sentries, weapon effects) and content registers with them. Engine files must not
 * import content folders listed in `FORBIDDEN_CONTENT_FOLDERS`. Research tree definitions under
 * `researchTrees/trees/` are content and may name their abilities. Tests are exempt.
 *
 * To guard another ability group, add its folder to `FORBIDDEN_CONTENT_FOLDERS` once the engine no longer
 * imports it. Known engine imports of other groups (follow-ups, not guarded yet):
 * - `05_earth_core/earthCoreConstants`: `game/TerrainLayerManager.ts`,
 *   `game/GameRenderer/renderers/FloorTileRenderer.ts`, `resources/Resonance.ts`
 * - `09_gravity_core/gravityConstants`: `resources/Gravity.ts`
 */
const FORBIDDEN_CONTENT_FOLDERS: readonly string[] = ['card_defs/10_armory_core', 'card_defs/13_storm_core'];

/** Path prefixes (as globbed below) that are content, not engine. */
const EXEMPT_PREFIXES: readonly string[] = ['../../../researchTrees/trees/'];

const SOURCES = import.meta.glob(
    [
        './**/*.{ts,tsx}',
        '../resources/**/*.{ts,tsx}',
        '../../../researchTrees/**/*.{ts,tsx}',
        '!./**/*.test.{ts,tsx}',
        '!../resources/**/*.test.{ts,tsx}',
        '!../../../researchTrees/**/*.test.{ts,tsx}',
    ],
    { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;

/** Static (`from '…'`, `import '…'`), dynamic (`import('…')`) and `require('…')` specifiers. */
const IMPORT_PATTERN = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\s*\(\s*)['"]([^'"]+)['"]/g;

function stripComments(text: string): string {
    return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function importSpecifiers(text: string): string[] {
    return [...stripComments(text).matchAll(IMPORT_PATTERN)].map((m) => m[1]);
}

describe('content layering guard', () => {
    it('scans engine, resource and research tree sources', () => {
        const files = Object.keys(SOURCES);
        expect(files.length).toBeGreaterThan(100);
        expect(files.some((f) => f.startsWith('../resources/'))).toBe(true);
        expect(files.some((f) => f.startsWith('../../../researchTrees/trees/'))).toBe(true);
        expect(files.some((f) => f.endsWith('fieldObjects/FieldObjectManager.ts'))).toBe(true);
    });

    it('finds import specifiers but ignores comments', () => {
        const sample = [
            "import { a } from '../card_defs/10_armory_core/armoryConstants';",
            "import '../card_defs/10_armory_core/register';",
            "const m = await import('../card_defs/10_armory_core/x');",
            "// import { b } from '../card_defs/10_armory_core/commented';",
            "/* from '../card_defs/10_armory_core/block' */",
        ].join('\n');
        expect(importSpecifiers(sample)).toEqual([
            '../card_defs/10_armory_core/armoryConstants',
            '../card_defs/10_armory_core/register',
            '../card_defs/10_armory_core/x',
        ]);
    });

    it('engine code does not import guarded content folders', () => {
        const offenders: string[] = [];
        for (const [file, text] of Object.entries(SOURCES)) {
            if (EXEMPT_PREFIXES.some((p) => file.startsWith(p))) continue;
            for (const spec of importSpecifiers(text)) {
                const folder = FORBIDDEN_CONTENT_FOLDERS.find((f) => spec.includes(f));
                if (folder) offenders.push(`${file}: imports '${spec}' (${folder})`);
            }
        }
        expect(
            offenders,
            'Engine code must not import content. Move the generic piece into the engine and have the content '
                + 'register with it (see game/conjuredWeapons/AGENTS.md, game/fieldObjects/AGENTS.md):\n'
                + offenders.join('\n'),
        ).toEqual([]);
    });
});
