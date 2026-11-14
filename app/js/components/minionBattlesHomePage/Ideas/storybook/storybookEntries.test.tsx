import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { UserDataProvider } from '../../../../user/UserDataProvider';
import { STORYBOOK_ENTRIES } from './storybookEntries';
import { defaultStorybookValues, type StorybookControlValues } from './storybookTypes';
import { ALL_RESOURCE_DISPLAY_DEFS } from '../../../../games/minion_battles/resources/resourceDisplayDefs';
import { RESEARCH_TREES } from '../../../../researchTrees/list';
import { GARDEN_HEART_PALETTES, GARDEN_HEART_STYLES } from '../fxArt/gardenHeartArt';

function renderEntry(id: string, overrides: StorybookControlValues = {}): string {
    const entry = STORYBOOK_ENTRIES.find((e) => e.id === id)!;
    const values = { ...defaultStorybookValues(entry.controls), ...overrides };
    return renderToStaticMarkup(
        <MemoryRouter>
            <UserDataProvider user={null} loading={false} refetch={async () => {}}>
                {entry.render(values)}
            </UserDataProvider>
        </MemoryRouter>,
    );
}

describe('storybook entries', () => {
    it('have unique ids and defaults for every control', () => {
        const ids = STORYBOOK_ENTRIES.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
        for (const entry of STORYBOOK_ENTRIES) {
            const values = defaultStorybookValues(entry.controls);
            for (const c of entry.controls) expect(values[c.id]).toBeDefined();
        }
    });

    it('Resources renders one row per resource, filtered by the Resource control', () => {
        const all = renderEntry('resources');
        for (const def of ALL_RESOURCE_DISPLAY_DEFS) expect(all).toContain(`>${def.name}<`);
        expect(all).toContain('3x');

        const water = renderEntry('resources', { search: 'wat' });
        expect(water).toContain('>Water<');
        expect(water).not.toContain('>Health<');
    });

    it('Research Cards renders every tree with its colours and both nameplates', () => {
        const html = renderEntry('research-cards');
        for (const tree of RESEARCH_TREES) expect(html).toContain(tree.title);
        expect(html).toContain('Primary');
        expect(html).toContain('Purchased');
        expect(html).toContain('Unpurchased');

        const storm = RESEARCH_TREES.find((t) => t.theme === 'storm')!;
        const one = renderEntry('research-cards', { tree: 'STORM' });
        expect(one).toContain(storm.title);
        expect(one).toContain('#3b5bdb');
        expect(one).toContain('Unpurchased');
        expect(one).not.toContain('#9ca3af'); // Weapons primary: filtered out
    });

    it('Garden Heart shows every palette and Heart style, with exactly one of each selected', () => {
        expect(GARDEN_HEART_PALETTES.filter((p) => p.chosen)).toHaveLength(1);
        expect(GARDEN_HEART_STYLES.filter((s) => s.chosen)).toHaveLength(1);

        const all = renderEntry('garden-heart');
        for (const p of GARDEN_HEART_PALETTES) expect(all).toContain(p.name.replace("'", '&#x27;'));
        for (const s of GARDEN_HEART_STYLES) expect(all).toContain(s.name);
        expect(all.match(/data-chosen="true"/g)).toHaveLength(1);
        expect(all).not.toContain('Unknown art');

        const chosen = renderEntry('garden-heart', { chosenOnly: true });
        expect(chosen).toContain('Nightbloom');
        expect(chosen).not.toContain("Queen&#x27;s Garden");
    });
});
