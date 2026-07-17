---
name: Ability uses refactor
overview: Move per-ability use configuration (maxUses, startingUses, recoveries) out of the central ABILITY_USE_CONFIGS map and onto each AbilityStatic, exposed through a getMaxUses() function, with base values as constants at the top of each ability file.
todos:
  - id: types-interface
    content: Add maxUses/startingUses/recoveries/getMaxUses to AbilityStatic; move recovery types into Ability.ts; patch default getMaxUses in register(); AbilityBase defaults
    status: completed
  - id: lookup
    content: Rewrite getAbilityUseConfig to read from the registry; delete ABILITY_USE_CONFIGS; re-export types
    status: completed
  - id: charge-template
    content: Plumb maxUses/recoveries through ChargeAttackConfig and migrate 0003/0007/0011
    status: completed
  - id: migrate-files
    content: Migrate remaining 26 config entries into their ability files with top-of-file constants
    status: completed
  - id: tests
    content: Extend use-config tests for migrated values + default fallback; run lint and both vitest passes
    status: completed
isProject: false
---

# Refactor Ability Uses onto AbilityStatic

## Goal

Kill the central `ABILITY_USE_CONFIGS` registry in [app/js/games/minion_battles/abilities/abilityUses.ts](app/js/games/minion_battles/abilities/abilityUses.ts). Each ability defines its own `maxUses` / `startingUses` / `recoveries` on the `AbilityStatic`, with base values as constants at the top of its file. Max uses is read through a `getMaxUses()` function on the ability that returns `this.maxUses`, so individual abilities can override the lookup later.

## 1. Types and interface — `abilities/Ability.ts`

- Move `RecoveryChargeType` and `AbilityRecoveryRule` from `abilityUses.ts` into [Ability.ts](app/js/games/minion_battles/abilities/Ability.ts) (safe direction: `abilityUses.ts` already imports from `Ability.ts`). Re-export both from `abilityUses.ts` so existing imports (`AbilityBar.tsx`, etc.) keep working.
- Add to `AbilityStatic`:

```typescript
/** Base max uses for this ability (default 1 when omitted). */
readonly maxUses?: number;
/** Uses available at battle start when different from maxUses (e.g. Energy Blast starts at 0). */
readonly startingUses?: number;
/** Recovery rules restoring uses. Default: 1 staminaCharge -> 1 use. */
readonly recoveries?: readonly AbilityRecoveryRule[];
/** Max-uses lookup. Default implementation returns this.maxUses; override for dynamic values. */
getMaxUses?(): number;
```

- In [AbilityRegistry.ts](app/js/games/minion_battles/abilities/AbilityRegistry.ts) `register()`, patch the default exactly like the existing `getTargets` patch:

```typescript
if (!ability.getMaxUses) {
    ability.getMaxUses = () => ability.maxUses ?? 1;
}
```

- In [AbilityBase.ts](app/js/games/minion_battles/abilities/AbilityBase.ts), add `readonly maxUses: number = 1`, optional `startingUses` / `recoveries` fields, and `getMaxUses(): number { return this.maxUses; }` so class-based abilities get the default too.

## 2. Lookup — `abilityUses.ts`

- Delete `ABILITY_USE_CONFIGS`. Keep `AbilityUseConfig` and `DEFAULT_USE_CONFIG` (fallback for `wait`, enemy basics, and any unconfigured ability — unchanged behaviour).
- Reimplement the single existing entry point so no callers change:

```typescript
export function getAbilityUseConfig(abilityId: string): AbilityUseConfig {
    const ability = getAbility(abilityId);
    if (!ability) return DEFAULT_USE_CONFIG;
    return {
        maxUses: ability.getMaxUses?.() ?? ability.maxUses ?? DEFAULT_USE_CONFIG.maxUses,
        startingUses: ability.startingUses,
        recoveries: [...(ability.recoveries ?? DEFAULT_USE_CONFIG.recoveries)],
    };
}
```

- Research runtime mutations (`applyStickSwordResearchToAbilityRuntime`, `applyCrystalRocksResearchToAbilityRuntime`, `applyAbilityResearchModifiersToRuntime`) and the serialized `unit.abilityRuntime` snapshot stay exactly as they are — they mutate per-unit runtime after `ensureAbilityRuntimeState` seeds it from the (now ability-defined) base config.

## 3. Template plumbing — `ChargeAttack`

`0003` (Dark Wolf Bite), `0007` (Alpha Charge), `0011` (Frenzied Charge) are `ChargeAttack` instances. In [abilities/templates/ChargeAttack.ts](app/js/games/minion_battles/abilities/templates/ChargeAttack.ts):

- Add optional `maxUses?` and `recoveries?` to `ChargeAttackConfig`; assign them to readonly fields in the constructor (inheriting `AbilityBase.getMaxUses`).
- Set the values in the three card files (constants at the top of each file, e.g. `const MAX_USES = 2;`).

## 4. Migrate the 29 config entries into their ability files

For each entry, add constants at the top of the file (alongside existing ones like `DAMAGE`, `PREFIRE_TIME`) and set the fields on the ability object:

```typescript
const MAX_USES = 2;
const RECOVERIES: AbilityRecoveryRule[] = [
    { chargeType: 'staminaCharge', chargesPerRecovery: 2, usesRecovered: 1 },
];
// on the ability object:
maxUses: MAX_USES,
recoveries: RECOVERIES,
```

Files (id → folder under `card_defs/`):
- ChargeAttack instances: `0003`, `0007`, `0011` (dark_animals)
- Punch line: `0120`, `0116`, `0117`, `0118`, `0119`
- Melee/swing: `0103`, `0115`, `0105`, `0112`, `0111`, `05_earth_core/0534`
- Shields: `0104`, `0106`, `0110`, `0113`
- Throws/guns: `0107_ThrowRock` (`throw_rock`), `0108_ThrowChargedRock` (`throw_charged_rock`, lightCharge), `0109_ThrowKnife` (`throw_knife`), `utility/0601` (roundCharge), `0203`, `0204`, `0205`
- Special: `0101` Dodge (roundCharge), `0114` Energy Blast (`startingUses: 0`, energyCharge ×3)
- Enemies: `0008`, `0009`

## 5. Tests / verification

- Existing [abilityUses.shields.test.ts](app/js/games/minion_battles/abilities/abilityUses.shields.test.ts) already asserts shield maxUses through `getAbilityUseConfig` — acts as a regression check.
- Extend it (or add a small sibling test) asserting a few migrated values resolve correctly via the registry path: `0114` (`startingUses: 0`, energyCharge recovery), `0101` (roundCharge), `throw_charged_rock` (lightCharge), and that an unconfigured ability (`wait`) still gets the default config.
- Run `npm run lint`, then `npx vitest run --changed`, then `npm run test` per the post-change hook.

## Out of scope (intentionally unchanged)

- Research-driven max-uses adjustments still mutate `unit.abilityRuntime` at battle init (no `getMaxUses(unit)` parameter).
- `unit.abilityRuntime` serialization shape and all recovery-charge distribution logic.
- UI components keep calling `getAbilityUseConfig(abilityId)` unchanged.