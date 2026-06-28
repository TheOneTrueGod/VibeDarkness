import type { WorldModifierDef } from '../types';

/**
 * Alpha wolf death — story pause + AlphaWolfStoryRemnant effect + radial particle emitter.
 * `exclusive: true` stops all further on_unit_died rules after this fires so default VFX
 * does not double-fire for the alpha wolf.
 * Custom handler: 'alphaWolfDeath' registered via registerLateBuiltinHandlers.
 */
const BUILTIN_ALPHA_WOLF_DEATH: WorldModifierDef = {
    id: '_builtin_alpha_wolf_death',
    name: 'Alpha Wolf Death',
    description: 'Story pause and cinematic effects when the alpha wolf dies.',
    icon: '',
    priority: 800,
    visible_to_admin_only: true,
    rules: {
        on_unit_died: [
            {
                exclusive: true,
                conditions: [{ type: 'victimCharacterIdIs', characterId: 'alpha_wolf' }],
                effects: [
                    {
                        type: 'custom',
                        effectId: 'alphaWolfDeath',
                        comment: 'Start story pause, spawn AlphaWolfStoryRemnant, spawn AlphaWolfStoryEmitter.',
                    },
                ],
            },
        ],
    },
};

/** Built-in world modifiers active for every mission. */
export const BUILTIN_WORLD_MODIFIERS: WorldModifierDef[] = [
    BUILTIN_ALPHA_WOLF_DEATH,
];
