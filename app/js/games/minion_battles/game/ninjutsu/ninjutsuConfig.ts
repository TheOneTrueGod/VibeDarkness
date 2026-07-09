export interface NinjutsuPoolConfig {
    enabled: boolean;
    /** Max attacks granted per recharge cycle. */
    maxPool: number;
    /** Rounds between full recharges. 1 = every round. Values > 1 are supported but unused by current tiers. */
    rechargeInterval: number;
    /** Gap between grants as a fraction of ROUND_DURATION (0.1 = 10% of a round). */
    pauseBetweenUses: number;
    /** Extra pool capacity per live enemy unit (added to maxPool on init and each recharge). */
    ninjutsuPerUnit?: number;
}

export const NINJUTSU_DISABLED: NinjutsuPoolConfig =
    { enabled: false, maxPool: 0, rechargeInterval: 1, pauseBetweenUses: 0 };

// Tier 1 — Very easy: 4 attacks/round, 0.2-round gap → 0.2 rounds of rest
export const NINJUTSU_TIER_1: NinjutsuPoolConfig =
    { enabled: true, maxPool: 4, rechargeInterval: 1, pauseBetweenUses: 0.2 };

// Tier 2 — Easy: 3 attacks/round, 0.25-round gap → 0.5 rounds of rest
export const NINJUTSU_TIER_2: NinjutsuPoolConfig =
    { enabled: true, maxPool: 3, rechargeInterval: 1, pauseBetweenUses: 0.25 };

// Tier 3 — Medium: 3 attacks/round, 0.15-round gap → 0.7 rounds of rest
export const NINJUTSU_TIER_3: NinjutsuPoolConfig =
    { enabled: true, maxPool: 3, rechargeInterval: 1, pauseBetweenUses: 0.15 };

// Tier 4 — Hard: 5 attacks/round, 0.1-round gap → 0.6 rounds of rest
export const NINJUTSU_TIER_4: NinjutsuPoolConfig =
    { enabled: true, maxPool: 5, rechargeInterval: 1, pauseBetweenUses: 0.1 };

// 3 bursts of 4 attacks per round; pool refills every 1/3 round with no pause between grants
export const NINJUTSU_3_FLURRY_PER_ROUND: NinjutsuPoolConfig =
    { enabled: true, maxPool: 4, rechargeInterval: 1 / 3, pauseBetweenUses: 0 };

// Missions that don't configure ninjutsuPools get this — no throttling of enemy attacks.
export const NINJUTSU_DEFAULT = NINJUTSU_DISABLED;
