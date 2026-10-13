# crowdControl/

Hard CC application, duration resists, knockback keywords, and boss CC armour. Stun/launch/knockback entry points share the hard-CC armour gate so bosses absorb hits before a stun lands. Units tagged `UnitTag.Structure` fully resist knockback, pull, nudge, and lift (no armour consumed).

## Folder map

| File | Owns |
|------|------|
| `tryApplyHardCcStun.ts` | Canonical hard-stun apply path (potency check → absorb vs land). |
| `hardCcGate.ts` | `applyCcThroughArmourGate`: shared juggernaut / iFrames / Exposed / resist / armour gate used by stun and Stagger. |
| `tryApplyStagger.ts` | Stagger (weak stun) apply path; same gate with a weak armour charge of 0. |
| `tryApplyLift.ts` | Lift/slam hard CC; same armour gate as stun. |
| `knockbackKeywords.ts` | Tiered knockback apply helpers (also armour-gated). |
| `ccArmourState.ts` | Runtime `unit.ccArmour` shape, JSON bridge, and armour helpers. |
| `resolveCcDuration.ts` | Duration resist percent/flat before armour gating. |
| `ccDefinitions.ts` / `ccTypes.ts` / `ccConstants.ts` | Shared CC typing and constants. |

## Runtime vs wire naming

Gameplay code reads **`unit.ccArmour.*`** (`hardFloor`, `bonusHard`, `hardConsumed`, `breakStunDuration`, …). Unit defs and checkpoint JSON still use the older wire names (`hardCcArmourFloor`, `hardCcArmourConsumed`, …) via the bridge in `ccArmourState.ts`. Do not set flat fields on `Unit` for armour.

Boss baselines (e.g. alpha wolf) live on `combatCc` in `game/units/unit_defs/unitDef.ts`. Ability-test coverage: `enemy_boss_stun_mechanics` in `testing/scenarios/general/enemies.ts` (see the **ability-tests** skill for the multi-order pre-queue pattern).

## Weak CC: Stagger

`StaggeredBuff` (`'staggered'`) is a brief stun that blocks acting and movement via the generic `Buff.blocksActing` flag (read by `Unit.canAct()` / `hasActingBlockingBuff()` and the `unitMovementTick` guard). New blocking buffs should set `blocksActing` rather than add type-string checks. Apply it with `tryApplyStagger(target, seconds, knockbackCtx)`; durations resolve under the `'STAGGER'` CC type.

Weak means armour charge **0** through `applyCcThroughArmourGate`:

- Armoured target (`getEffectiveHardCcThreshold > 0`): absorbed, `hardConsumed` untouched, no Exposed, no chain stacking.
- Exposed target: duration is added to Exposed via `extendDuration` and `boss_exposed_cc_suppressed` is emitted; no Staggered buff.
- iFrames / juggernaut window, already stunned or lifted, and `UnitTag.Structure`: no effect.
- An existing Stagger is replaced only by a longer one (refresh, never extend or stack).
- A landing interrupts active abilities through `engine.interruptUnitAndRefundAbilities`.
