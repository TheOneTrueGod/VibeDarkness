import type { WorldModifierDef } from '../types';

/**
 * Default death VFX modifier — replaces the legacy GameEngine getDeathEffectDef
 * block. Runs last (priority -100) so mission modifiers (e.g. Dark Swarm) fire first.
 *
 * Custom handler: 'defaultDeathVfx' registered in builtinHandlers.ts.
 * Alpha wolf is excluded inside the handler (story death sequence owns its VFX).
 */
const BUILTIN_DEFAULT_DEATH_VFX: WorldModifierDef = {
    id: '_builtin_default_death_vfx',
    name: 'Death VFX',
    description: 'Default particle/icon effects when enemies die.',
    icon: '',
    priority: -100,
    rules: {
        on_unit_died: [
            {
                conditions: [{ type: 'always' }],
                effects: [
                    {
                        type: 'custom',
                        effectId: 'defaultDeathVfx',
                        comment: 'Replicate legacy GameEngine getDeathEffectDef particle/icon VFX.',
                    },
                ],
            },
        ],
    },
};

/** Built-in world modifiers active for every mission. */
export const BUILTIN_WORLD_MODIFIERS: WorldModifierDef[] = [BUILTIN_DEFAULT_DEATH_VFX];
