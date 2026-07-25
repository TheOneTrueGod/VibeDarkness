# abilities/

Declarative cast timing, targeting, hitboxes, and reusable cast behaviours for Minion Battles. Card-specific definitions live under `card_defs/`; this folder owns the shared runtime contracts those defs call into.

## Folder map

| Path | Owns |
|------|------|
| `CastBehaviours/` | Reusable timed behaviours (`CastBehaviours.MeleeAttack()`, Dash, ProjectileLaunch, Instant, …). Prefer these over new `doCardEffect` melee boilerplate. |
| `Ability.ts` / `AbilityRegistry.ts` | Ability static contract and id → ability lookup. New abilities must `register(...)` here or they are silently missing at runtime. |
| `abilityTimings.ts` | Timing intervals, `emitterDef`, and `getEffectiveCastBehaviours` (normalises `castBehaviours` vs `behaviour` shorthand). Interval enter detection must treat `start: 0` correctly (`enteredTimingIds` special-cases the first tick — needed for emitters and Instant behaviours). |
| `timingTargetDef.ts` / `targeting.ts` | `SelectTargetDef` lock-on / filters (`allowMiss`, `filter`, `filterSelectTargetCandidates`). Legacy `TargetDef` is label-only — do not look for `lockOn` there. |
| `hitboxDef.ts` | Pure hitbox data + `resolveHitbox`. When a `priorityUnitId` is set and that unit is out of the shape, the result is empty (miss), not a redirect to another unit. |
| `castBehaviourTypes.ts` / `resolveCastBehaviourTarget.ts` | Behaviour context, `targetIndex`, interrupt typing. |
| `targetDowngrade.ts` | Freezes unit targets to pixels when they die (pair with evade/tether handling in the ability tick). |

## CastBehaviours — load-bearing rules

- **Coexistence:** `doCardEffect` remains an escape hatch. New declarative abilities omit it. Ability-level `getCasterRenderOffset` and behaviour offsets are summed. `beginActiveCast` is still for cast-start setup; behaviour `onSetup` runs when that behaviour’s timing window opens.
- **Lock-on is independent of behaviours:** use `SelectTargetDef` + hitbox specs for pick/lock; pair with whatever `castBehaviours` fit the strike (e.g. teleport then melee).
- **Multi-target entries:** one behaviour instance can be reused with different `targetIndex` values; `onSetup`/`onTick` run per entry when its window opens.
- **Interrupt:** active sustained behaviours get `onInterrupt` when the cast is forcibly removed; already-finished windows do not.
- **Aim source of truth:** `active.targets` / `targetsByLabel` must be downgraded to pixel when a locked unit evades, breaks tether, or dies — otherwise later ticks chase the live unit. See `targetDowngrade.ts` and the evade/tether blocks in the unit ability tick.
- **Render offsets:** any code that walks timing intervals for caster slide/offset must use `getEffectiveCastBehaviours`, or the `behaviour:` shorthand is skipped.
- **Melee line preview/hits:** `MeleeLineHitboxSpec` projects aim to full `maxRange` (not click distance). Team filtering for select-target is caller-side via `filterSelectTargetCandidates`.

Authoring workflow and registration checklist: `card_defs/SKILL.md` and the **creating-an-ability** skill.
