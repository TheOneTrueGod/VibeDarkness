import { describe, expect, it } from 'vitest';
import { buildWorldModifiersFromSources } from './buildWorldModifiers';
import type { WorldModifierDef } from './types';

function mod(id: string, name: string): WorldModifierDef {
    return { id, name, description: name, icon: '' };
}

describe('buildWorldModifiersFromSources', () => {
    it('merges builtins < campaign < mission < story with later id winning', () => {
        const builtins = [mod('shared', 'builtin'), mod('only_builtin', 'b')];
        const campaign = [mod('shared', 'campaign'), mod('only_campaign', 'c')];
        const mission = [mod('shared', 'mission'), mod('only_mission', 'm')];
        const story = [mod('shared', 'story')];

        const merged = buildWorldModifiersFromSources({ builtins, campaign, mission, story });
        const byId = Object.fromEntries(merged.map((d) => [d.id, d.name]));

        expect(byId.shared).toBe('story');
        expect(byId.only_builtin).toBe('b');
        expect(byId.only_campaign).toBe('c');
        expect(byId.only_mission).toBe('m');
    });

    it('mission wins over campaign for the same id', () => {
        const campaign = [mod('ds_swarm_reinforcements', 'campaign swarm')];
        const mission = [mod('ds_swarm_reinforcements', 'mission override')];

        const merged = buildWorldModifiersFromSources({ campaign, mission });
        expect(merged).toHaveLength(1);
        expect(merged[0]!.name).toBe('mission override');
    });
});
