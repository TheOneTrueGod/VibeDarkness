/**
 * Boss casts that must play out once started: every interval before cooldown carries the
 * `juggernaut` tag (no CC interrupt, no terrain hazards), and the cooldown does not.
 */
import { describe, expect, it } from 'vitest';
// Load the registry first so card modules initialise in their normal order.
import '../abilities/AbilityRegistry';
import { AbilityPhase, normalizeAbilityTimingsToIntervals } from '../abilities/abilityTimings';
import type { AbilityStatic } from '../abilities/Ability';
import { AlphaWolfSummonAbility } from './dark_animals/0005_AlphaWolfSummon/0005Ability';
import { AlphaWolfTripleChargeAbility } from './dark_animals/0011_AlphaWolfTripleCharge/0011Ability';
import { LightEaterAbility } from './dark_animals/0018_LightEater/0018Ability';
import { PhantomDecoyAbility } from './dark_animals/0019_PhantomDecoy/0019Ability';
import { CrystalLaserAbility_1490 } from './14_enemy_court_magician/1490_CrystalLaser/1490Ability';

const CASES: [string, AbilityStatic][] = [
    ['Alpha Wolf howl (summon)', AlphaWolfSummonAbility],
    ['Alpha Wolf frenzied triple charge', AlphaWolfTripleChargeAbility],
    ['Displacer light eater (devour light)', LightEaterAbility],
    ['Displacer phantom decoy (clone)', PhantomDecoyAbility],
    ['Court magician crystal laser', CrystalLaserAbility_1490],
];

describe('boss casts with juggernaut before cooldown', () => {
    it.each(CASES)('%s is juggernaut through windup and active, not cooldown', (_name, ability) => {
        const intervals = normalizeAbilityTimingsToIntervals(ability.abilityTimings);
        const beforeCooldown = intervals.filter(
            (it) => it.abilityPhase !== AbilityPhase.Cooldown && it.abilityPhase !== AbilityPhase.CoopCooldown,
        );
        expect(beforeCooldown.length).toBeGreaterThan(0);
        for (const it of beforeCooldown) expect(it.tags, it.id).toContain('juggernaut');
        for (const it of intervals.filter((i) => i.abilityPhase === AbilityPhase.Cooldown)) {
            expect(it.tags ?? []).not.toContain('juggernaut');
        }
    });
});
