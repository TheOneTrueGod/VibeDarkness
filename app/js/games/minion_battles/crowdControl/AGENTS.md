# crowdControl/

Hard CC application, duration resists, knockback keywords, and boss CC armour. Stun/launch/knockback entry points share the hard-CC armour gate so bosses absorb hits before a stun lands.

## Folder map

| File | Owns |
|------|------|
| `tryApplyHardCcStun.ts` | Canonical hard-stun apply path (potency check → absorb vs land). |
| `tryApplyLift.ts` | Lift/slam hard CC; same armour gate as stun. |
| `knockbackKeywords.ts` | Tiered knockback apply helpers (also armour-gated). |
| `ccArmourState.ts` | Runtime `unit.ccArmour` shape, JSON bridge, and armour helpers. |
| `resolveCcDuration.ts` | Duration resist percent/flat before armour gating. |
| `ccDefinitions.ts` / `ccTypes.ts` / `ccConstants.ts` | Shared CC typing and constants. |

## Runtime vs wire naming

Gameplay code reads **`unit.ccArmour.*`** (`hardFloor`, `bonusHard`, `hardConsumed`, `breakStunDuration`, …). Unit defs and checkpoint JSON still use the older wire names (`hardCcArmourFloor`, `hardCcArmourConsumed`, …) via the bridge in `ccArmourState.ts`. Do not set flat fields on `Unit` for armour.

Boss baselines (e.g. alpha wolf) live on `combatCc` in `game/units/unit_defs/unitDef.ts`. Ability-test coverage: `enemy_boss_stun_mechanics` in `testing/scenarios/general/enemies.ts` (see the **ability-tests** skill for the multi-order pre-queue pattern).
