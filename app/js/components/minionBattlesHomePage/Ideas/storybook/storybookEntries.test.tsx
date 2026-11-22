import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';
import { UserDataProvider } from '../../../../user/UserDataProvider';
import { STORYBOOK_ENTRIES } from './storybookEntries';
import {
    defaultStorybookValues,
    storybookSearchParams,
    storybookValuesFromSearchParams,
    type StorybookControlValues,
} from './storybookTypes';
import { ALL_RESOURCE_DISPLAY_DEFS } from '../../../../games/minion_battles/resources/resourceDisplayDefs';
import { RESEARCH_TREES } from '../../../../researchTrees/list';
import { TRAINING_NODE_HEALTHY, TRAINING_NODE_MIGHTY } from '../../../../researchTrees/trees/training';
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

        const water = renderEntry('resources', { resource: 'wat' });
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

    it('Research Cards: a Node search shows just the matching nodes, with tooltips pinned open on request', () => {
        const html = renderEntry('research-cards', { node: 'mighty', pin: true, level: 2 });
        expect(html).toContain('Mighty');
        expect(html).not.toContain('Healthy');
        expect(html).toContain(`research-node-pinned-${TRAINING_NODE_MIGHTY}`);
        expect(html).toContain('research-stat-reminder-attack');
        expect(html).toContain('(2/5)');

        // Description text matches too: `attack` finds the node whose pill is {stat:attack:...}.
        const byText = renderEntry('research-cards', { node: 'attack' });
        expect(byText).toContain('Mighty');
        expect(byText).not.toContain(`research-node-pinned-${TRAINING_NODE_HEALTHY}`);

        expect(renderEntry('research-cards', { node: 'zzz-no-such-node' })).toContain('No research tree matches');
    });
});

describe('storybook URL parameters', () => {
    const entry = () => STORYBOOK_ENTRIES.find((e) => e.id === 'research-cards')!;

    it('read control values from the query string, falling back to defaults for bad values', () => {
        const values = storybookValuesFromSearchParams(
            entry().controls,
            new URLSearchParams('node=mighty&pin=1&level=99&state=nonsense&tree=Training'),
        );
        expect(values).toMatchObject({ node: 'mighty', pin: true, level: 5, state: 'enabled', tree: 'Training' });
    });

    it('write only non-default values, and read back what they write', () => {
        const controls = entry().controls;
        expect(storybookSearchParams(controls, defaultStorybookValues(controls)).toString()).toBe('');
        const values = { ...defaultStorybookValues(controls), node: 'mighty', pin: true, level: 3 };
        const params = storybookSearchParams(controls, values);
        expect(params.toString()).toBe('node=mighty&pin=1&level=3');
        expect(storybookValuesFromSearchParams(controls, params)).toEqual(values);
    });
});
