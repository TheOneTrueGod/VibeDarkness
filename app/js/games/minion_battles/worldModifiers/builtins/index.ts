import type { WorldModifierDef } from '../types';

/**
 * Lanternite death — removes torch light source and queues respawn (Spore Rebirth).
 * Skips nest-owned lanternites (they don't self-respawn).
 * Custom handler: 'lanterniteDeath' registered via registerLateBuiltinHandlers.
 */
const BUILTIN_LANTERNITE_DEATH: WorldModifierDef = {
    id: '_builtin_lanternite_death',
    name: 'Lanternite Death',
    description: 'Removes lanternite torch and queues Spore Rebirth respawn.',
    icon: '',
    priority: 900,
    visible_to_admin_only: true,
    rules: {
        on_unit_died: [
            {
                conditions: [{ type: 'victimCharacterIdIs', characterId: 'lanternite' }],
                effects: [
                    {
                        type: 'custom',
                        effectId: 'lanterniteDeath',
                        comment: 'Remove torch light source and enqueue respawn via LanterniteRespawnManager.',
                    },
                ],
            },
        ],
    },
};

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

/**
 * Stack ghost VFX — ghost particles when a swarm/stack group dies simultaneously.
 * Listens to the separate `stack_members_died` event via a custom handler.
 * Custom handler: 'stackGhostVfx' registered via registerLateBuiltinHandlers.
 *
 * NOTE: stack_members_died is not a WorldEventType (no on_round_start/on_unit_died mapping).
 * The handler is registered directly on the EventBus inside registerLateBuiltinHandlers.
 */
const BUILTIN_STACK_GHOST_VFX: WorldModifierDef = {
    id: '_builtin_stack_ghost_vfx',
    name: 'Stack Ghost VFX',
    description: 'Ghost particle burst when a unit group dies simultaneously.',
    icon: '',
    priority: 0,
    visible_to_admin_only: true,
    rules: {},
};

/** Built-in world modifiers active for every mission. */
export const BUILTIN_WORLD_MODIFIERS: WorldModifierDef[] = [
    BUILTIN_LANTERNITE_DEATH,
    BUILTIN_ALPHA_WOLF_DEATH,
    BUILTIN_STACK_GHOST_VFX,
];
