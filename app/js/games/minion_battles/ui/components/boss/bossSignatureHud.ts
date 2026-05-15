import { getAbilityUseConfig } from '../../../abilities/abilityUses';
import { getAbility } from '../../../abilities/AbilityRegistry';
import type { Unit } from '../../../game/units/Unit';

/**
 * Maps boss `characterId` → ability id for the HUD "signature" charge bar.
 * To hook another boss later, add an entry in `SIGNATURE_ABILITY_BY_CHARACTER_ID` below.
 */
const SIGNATURE_ABILITY_BY_CHARACTER_ID: Readonly<Record<string, string>> = {
    alpha_wolf: '0005',
};

export function getBossSignatureAbilityId(characterId: string): string | undefined {
    return SIGNATURE_ABILITY_BY_CHARACTER_ID[characterId];
}

export type BossSpecialMoveCharges = {
    filled: number;
    total: number;
    abilityName: string;
};

/** HUD slice for a boss signature ability (e.g. Alpha Wolf Summon). Returns null when unconfigured or unit lacks the ability. */
export function getBossSpecialMoveCharges(unit: Unit): BossSpecialMoveCharges | null {
    const abilityId = getBossSignatureAbilityId(unit.characterId);
    if (!abilityId || !unit.abilities.includes(abilityId)) return null;

    const rt = unit.abilityRuntime[abilityId];
    const cfg = getAbilityUseConfig(abilityId);
    const total = Math.max(1, rt?.maxUses ?? cfg.maxUses);
    const filledRaw =
        rt != null ? rt.currentUses : (cfg.startingUses ?? cfg.maxUses);
    const filled = Math.min(total, Math.max(0, filledRaw));

    const ability = getAbility(abilityId);
    const abilityName = ability?.name ?? 'Signature';

    return { filled, total, abilityName };
}
