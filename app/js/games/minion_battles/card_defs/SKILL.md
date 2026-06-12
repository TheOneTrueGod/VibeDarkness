---
name: creating-an-ability
description: Guides creating new abilities and card definitions in Minion Battles. Use when adding a new ability, card, or skill to app/js/games/minion_battles, or when the user asks how to create an ability.
---

# Creating an Ability (Minion Battles)

When adding a new ability to Minion Battles, follow this layout and ID scheme so abilities stay consistent and discoverable.

Important: ability implementation files belong in `card_defs/` folders (not directly under `abilities/`).

## Literate programming: abilities as a list of behaviours

**Abilities should contain as little logic as possible.** Use utility functions from `abilities/` so that reading an ability's functions is like reading a list of behaviours, not a block of implementation details.

- **Do**: Implement `doCardEffect` by calling helpers keyed to clear behaviours (e.g. "at 0.05s draw a card", "during windup apply forced displacement toward target").
- **Don't**: Inline geometry, damage/block checks, or drawing logic in the ability file when a shared helper already exists or can be added.
- **Helpers**: See utility files in `abilities/` (`targetHelpers.ts`, `effectHelpers.ts`, `previewHelpers.ts`, `gunHelpers.ts`, `blockingHelpers.ts`) for available helpers. When adding new reusable behaviour, add or extend a helper first, then call it from the ability.
- **Hitboxes**: For hit-detection shapes, see the **working-with-hitboxes** skill.

## Reuse before you build

Before implementing, break the ability into its constituent parts (movement, hitbox, visual effect, event rule, CastBehaviour, etc.) and check whether each part already exists in another ability or helper.

- For parts that **exist elsewhere**: call the shared helper or copy the pattern from `card_defs/`.
- For parts that **do not exist**: ask the user before implementing — should this be a one-off or a reusable helper/effect? If reusable, identify which parameters are likely to vary across abilities (e.g. damage amount, radius, duration, direction) so the interface can be designed correctly from the start.

### Extending CastBehaviours vs creating new ones

When an ability needs behaviour similar to an existing `CastBehaviour` (movement, melee, etc.), prefer **extending that behaviour** with new configuration options rather than creating a sibling class that duplicates the core logic. A new `CastBehaviour` class is appropriate only when the behaviour is genuinely atomic — it does one thing with no overlap with existing behaviours.

## Separation of concerns: hitboxes vs abilityEvents

Keep two concerns separate in the `castBehaviours` system:

- **CastBehaviours / hitboxes** — detect *what* happened: which units are in range, what shape the hit area is, which units have already been hit this cast. When a hit is confirmed, emit the appropriate `AbilityEventType` (e.g. `ON_ATTACK_HIT`).
- **`abilityEvents`** — declare *what to do* when an event fires: damage multipliers, knockback tiers, buffs, secondary effects.

Hitbox geometry and per-unit dedup live on the `CastBehaviour`; damage values and effect tiers live in `abilityEvents`. A good sign the split is correct: you can change what happens on hit by editing only `abilityEvents`, without touching the hitbox shape or detection logic.

## Juicing the game

**Juice** is the presentation and feedback that makes mechanics **readable and satisfying**: telegraph → payoff → read the result. Implementing correct rules is necessary but not sufficient; consider how the cast **feels** in battle.

Ask for each ability:

- **Anticipation** — Does windup and targeting make the intent obvious? (`prefireTime`, `renderTargetingPreview`, early `abilityTimings` bands.)
- **Impact** — Is the payoff moment clear? Prefer aligning one-shot `doCardEffect` thresholds with meaningful timing intervals and phases (see **`abilityTimings`** below).
- **Aftermath** — Is recovery or lingering feedback clear enough that the cadence isn't muddy? (timeline labels/phases, short effects.)

**Hooks in this codebase**

- **Enemy hitbox telegraph** — For **enemy** abilities whose `renderActivePreview` shows a **non-line** projected hit area, use `previewHelpers` (`drawEnemyConeHitboxTelegraph`, `drawEnemyConvexQuadHitboxTelegraph`, or the same pattern): faint red outer stroke, a more saturated red fill that **grows from the shape's geometric center** until it matches the final footprint, outer stroke **fully red from `prefireTime` through any short linger** while the strike is still readable (e.g. melee flash). **Do not** change **line / thick-capsule** previews that already encode timing (e.g. slime `EnemyArcherShot` aim lines, `ChargeAttack` lunge capsule). If the correct centering, linger, or geometry for the telegraph is ambiguous, **ask the player**.
- **`abilityTimings`** — Defines phase colours and the battle timeline; keep intervals truthful so rings match what the sim does at each second. **Timeline colour palette** (also used in the circular ring): **red** (`active`) = dealing damage; **light leafy green** (`active` + `tags: ['iframe']`) = invincibility / swiftness; **sky blue** (`active` + `tags: ['juggernaut']`) = shields or armour active; **white** (`startup`) = windup; **gray** (`cooldown`) = recovery. `iframe` and `juggernaut` are *tags* on an `AbilityTimingInterval`, not phases — use `abilityPhase: AbilityPhase.Active, tags: ['iframe'] as const` or `tags: ['juggernaut'] as const`.
- **Damage feedback** — `GameRenderer` subscribes to `damage_taken` on the event bus and runs a brief **hit flash** on the damaged unit (`game/GameRenderer.ts`). Flows that apply damage through normal paths get this largely "for free."
- **Battle effects** — Particle bursts, glows, etc. via the effects system. Visual defs live in `game/effect_defs/` (not the old `game/effectDef.ts`). Two distinct types exist — see `game/effects/AGENTS.md` for the full architecture:
  - **`Effect`** — purely visual, render-tick-driven (`renderUpdate` every rAF frame), **not serialized**. Use `engine.addEffect(effect)` for one-off effects at a specific game-state moment (hit position, impact point).
  - **`EffectEmitter`** — game-tick-driven, **serialized**, produces `Effect` instances. Use `engine.addEffectEmitter(emitter)` for imperative emitter creation (e.g. in `beginActiveCast` for per-unit visual data like Afterimage).
  - **Time-based visual emission** within an ability should use `abilityTimings[n].emitterDef` (type `AbilityTimingEmitterDef` from `abilities/abilityTimings.ts`). The engine auto-creates and deactivates emitters when timing windows open/close — do not use manual loops or edge-checks in `doCardEffect` for this.
- **`abilityEvents`** — Primarily **gameplay rule** hooks (`abilities/events/AbilityEffect.ts`). Prefer presets and inline rules; use **`custom`** effects only when needed, with the required comment, consistent with **`abilityEvents` authoring order** below.
- **Player-facing copy** — Names, descriptions, and tooltip rhythm: **writing-style-abilities** (`.cursor/skills/narrative/writing-style-abilities/SKILL.md`).

## `abilityEvents` authoring order

When implementing `abilityEvents`, follow this policy:

1. Prefer reusable presets over defining a new inline event rule.
2. Prefer an inline event rule over a custom handler.
3. If no inline primitive exists, prompt the user whether the behavior is one-off or should be generalized into a reusable condition/effect/preset.
4. Custom handlers require a short explanatory comment.
5. Within one event rule, conditions use AND semantics; across multiple event rules, matching uses OR semantics.

## Where to put it

1. **Skill tree folder (recommended for a coherent line of cards)**  
   Group related defs under `app/js/games/minion_battles/card_defs/<tree_folder>/` (examples: `05_earth_core/`, `utility/`). Each ability still gets its own `####_ABILITY_NAME/` folder **inside** that tree folder.

2. **Per-ability folder**: `app/js/games/minion_battles/card_defs/[<tree_folder>/]####_ABILITY_NAME`
   - `####` = 4-digit ability/card ID (see below).
   - `ABILITY_NAME` = short name in SCREAMING_SNAKE or PascalCase.

3. **Single file inside that folder**: `####_ABILITY_NAME.ts`
   - The **file name must match the folder name** exactly.
   - This file holds **both** the `CardDef` and the ability (`AbilityStatic` implementation).
   - Legacy/non-numbered abilities may use `card_defs/<ability_name>/<ability_name>.ts`.

## Ability ID (####)

The 4-digit ID is `<group><index>`:

- **First two digits = group ID** (character/class). See `AbilityGroupId.ts` in this folder for valid group IDs and `formatGroupId()` for zero-padding.
- **Last two digits = index** of the card within that group (01, 02, 03, …).

## Skill trees and `AbilityGroupId`

- **Do not invent a new leading digit** without adding a matching **`AbilityGroupId`** enum member and using `formatGroupId(thatGroup)` when constructing ids in code.
- **`05` = Earth / "earth skills"** (`AbilityGroupId.Earth`). **Folder:** `card_defs/05_earth_core/`. **Tree overview & Earth-specific authoring rules:** `card_defs/05_earth_core/EarthCore.md` — read it **before** adding or changing any **`05xx`** card, Resonance/stone/Stonephase/tremorsense behaviour, or shared Earth helpers. It is the canonical place for how Earth diverges from generic ability patterns.
- **`06` = Utility** (`AbilityGroupId.Utility`) for cross-cutting utility cards that are not Earth-specific; keep them under `card_defs/utility/`.
- **Adding a new thematic tree**: (1) append a new `AbilityGroupId` value, (2) assign ids as `formatGroupId(newGroup) + two-digit index`, (3) place all related ability folders under `card_defs/<NN>_<short_name>/` (match the two-digit group in the folder prefix), and (4) add a **`<Name>Core.md`** inside that folder (same role as `EarthCore.md`) and **link it from this section** with "when to read" guidance.

## What goes in the ability file

- **Design comment**: A short block comment at the very top of the file (before imports) describing the ability's intent. Write it as a prose paragraph — not a bulleted list. Keep it to 4 lines or fewer. Cover: what the ability looks like to use, the role it plays in the unit's kit, and how it's meant to play out in battle. This is the canonical place to capture design intent so it's visible while editing the implementation.
- **Ability**: An object implementing `AbilityStatic` (from `abilities/Ability.ts`). Use the same 4-digit id so cards and abilities match.
- **CardDef**: An object implementing `CardDef` (from `card_defs/types.ts`) with the same `id` and `abilityId` pointing at the ability.
- Static values used in multiple places should be defined as constants at the top of the file.

Both are exported from the same file. Export the ability for `AbilityRegistry` and the card def for `card_defs/index.ts`.

## Required ability behavior

1. **`doCardEffect(engine, caster, targets, prevTime, currentTime)`**
   - Runs every tick while the ability is active.
   - Use `prevTime` and `currentTime` (seconds since start) for one-shot effects. See existing abilities under `card_defs/` for threshold examples.

2. **`renderTargetingPreview(gr, caster, currentTargets, mouseWorld, units)`**
   - Draws a hint in the targeting overlay for where the skill will affect.

Implement the rest of `AbilityStatic` (`getDescription`, `getAbilityStates`, `targets`, `prefireTime`, **`abilityTimings`**, `resourceCost`, `rechargeTurns`, `image`, `aiSettings`) as needed. See existing abilities under `card_defs/` for reference.

### `abilityTimings` (half-open intervals)

**Required** on every ability. Use **`AbilityTimingInterval`** rows (see `abilities/abilityTimings.ts`):

| Field | Role |
|--------|------|
| `id` | Stable string for simulation (`windup`, `lunge`, `hit`, …) — use `activeTimingIds` / `enteredTimingIds` in `doCardEffect` when migrating. |
| `start`, `end` | Seconds from cast start; **half-open** `[start, end)` (`end` exclusive). |
| `abilityPhase` | `AbilityPhase` for ring UI and timeline colour. |
| `timelineLabel` / `timelineDescription` | Optional; battle timeline tooltips default from phase if omitted. |
| `conditionalCancel` | Optional mid-cast decision point (evaluated on **interval exit**). When the condition is true, the engine pauses and the player may pick an eligible ability or `wait` to resume the current cast. See `ConditionalCancelDef` in `abilities/abilityTimings.ts`. |

**Order matters** when intervals overlap: the battle timeline's single merged band uses **first-listed wins** for overlapping time. Total active duration for the engine is **`max(end)`** across intervals (see `getTotalAbilityDuration`).

Legacy `{ duration, abilityPhase }` remains in the type union for adapters/tests; new card defs should use interval rows only.

#### Entombed / inside-wall conditional cancel (rock tree)

When a unit casts while **inside impassable terrain** (rock/wall), some abilities should pause near the end of the cast so the player can chain another **`Entombed`** ability or **`wait`** to resume (e.g. slingshot out of the wall).

**Condition pattern** (same as Digging Claws):

```typescript
condition: ({ caster, engine }) => {
    const tm = engine.terrainManager;
    return tm != null && !tm.isPassable(caster.x, caster.y);
},
abilityTagFilter: ['Entombed'],
```

**Linger interval requirement:** If the last **`Active`** band ends exactly when **`Cooldown`** starts, the conditional-cancel pause would fire after the cast is already in `Cooldown`. Generic wall eject (`Unit.tickWallUnstick`) is only suppressed while an `Entombed` ability is in a **non-`Cooldown`** phase. Fix: insert a tiny **`Active`** “linger” interval (one tick, `1/60` s) immediately **before** `cooldown`, and shift `cooldown.start` forward by the same amount. The pause then fires on exit of the last real active band while the cast is still considered active.

**Reuse helper:** `abilities/entombed/entombedWallCancel.ts` exports `ENTOMB_WALL_CONDITIONAL_CANCEL` and `withEntombedWallConditionalCancelAndLinger(timings, { cancelIntervalId, cooldownIntervalId, … })`. Apply to the **final throw** interval (`active` or `active_2` on more-rock timelines). Examples: `0107_ThrowRock/0107Ability.ts`, `0108_ThrowChargedRock/0108Ability.ts`. Digging Claws (`0534`) inlines `conditionalCancel` on its dash interval instead.

### Blocking and `onAttackBlocked`

- **`onAttackBlocked(engine, defender, attackInfo)`** — **Optional**. Called when this ability's attack is blocked. Omit it for melee abilities (no-op is the default). Behaviour varies by ability type:
  - **Projectile abilities**: Deactivate the projectile; no damage dealt.
  - **Melee abilities**: Omit entirely — `onAttackBlocked` is optional and defaults to nothing.
  - **Charging abilities**: Apply knockback to the attacker and clear the ability note.
- **Blocking abilities**: Implement `getBlockingArc(caster, activeAbility, currentTime)` to return the blocking arc in radians. Projectiles must be created with `sourceAbilityId` so the engine knows which ability's `onAttackBlocked` to call.

See existing blocking and attacking abilities for reference implementations.

### Serialization

Whenever an ability needs to store data for future use, it must be serializable. Store unit IDs rather than unit references, and look up units by ID when needed.

## Registration

- **Ability**: In `abilities/AbilityRegistry.ts`, import and call `register(YourAbility)`.
- **Card def**: In `card_defs/index.ts`, import and add to the `cardDefs` array.

To avoid name collisions when importing multiple abilities, suffix the exported ability constant with its 4-digit ID: e.g. `SwingBatAbility_0103`, `SwingBatAbility_0115`. Apply this convention to all new abilities.

## Passive abilities

A **passive ability** is an `AbilityStatic` with a `passive?: PassiveDef` field (see `abilities/passiveDef.ts`). No cast order is ever issued; the engine's `processUnitPassives` (wired into `UnitManager.gameTick`) fires the passive automatically every tick for every alive unit that has the ability ID in its `abilities` list.

**Anatomy of a PassiveDef:**

```typescript
const myPassive: PassiveDef = {
    trigger: { type: 'onTick', intervalSec: 1.0 },   // once per second (1/8 of 8 s round)
    effects: [
        {
            type: 'aoe_damage',
            damage: 4,
            // range?: number   — omit for unlimited (global)
            targetFilter: { creatureType: 'dark_creature' },
        },
    ],
};
```

**Available triggers:**
| `type`    | Key field | Behaviour |
|-----------|-----------|-----------|
| `onTick`  | `intervalSec: number` | Fires whenever `gameTime` crosses an integer multiple of `intervalSec` (floor-crossing detection, no state stored on the unit). |

**Available effects:**
| `type`       | Fields | Behaviour |
|--------------|--------|-----------|
| `aoe_damage` | `damage`, `range?`, `targetFilter` | Deals flat damage to every alive unit that passes the filter. `range` omitted = unlimited (global aura). |

**`targetFilter` options:**
- `creatureType?: 'dark_creature' | 'beast'` — restricts to units whose character def has that creature type.
- `teamRelation?: 'enemy' | 'ally' | 'any'` — restricts by team relation to the caster.

**Passive-specific checklist:**
- [ ] Ability file exports the ability with a non-empty `passive` def.
- [ ] `abilityTimings: []` and `targets: []` (passive abilities have no cast lifecycle).
- [ ] Ability registered in `AbilityRegistry.ts`.
- [ ] Every spawn config that should have the passive includes the ability ID in its `abilities` array (check both static spawn defs and any dynamic `createUnitFromSpawnConfig` calls for that character).
- [ ] No `CardDef` needed unless the passive also appears as a player card.

## Ability concepts

- **Range**: Always calculate based on the range value plus the size of the source object plus the size of the target object.

## Knockback

Use `tryApplyKnockbackByTier(target, tier, source, casterX, casterY, engine)` from `crowdControl/knockbackKeywords.ts`. Tier 1 = light, 2 = medium, 3 = heavy. The function handles CC-armour gating, ExposedBuff, and hard-CC threshold logic internally.

While knockback is active, the unit cannot move or act. If it hits a wall, it bounces. All knockback state is serialized for save/restore.

## Checklist

- [ ] Design comment at the top of the file: a short prose paragraph (≤ 4 lines) covering what the ability looks like, its role in the kit, and how it plays out in battle.
- [ ] Folder `card_defs/####_ABILITY_NAME` and file `####_ABILITY_NAME.ts` created.
- [ ] Ability ID uses group (2 digits) + index (2 digits); group from `AbilityGroupId`.
- [ ] Same file exports both the ability and the `CardDef` with matching `id` / `abilityId`.
- [ ] Non-empty `abilityTimings` (interval form); `doCardEffect` implements per-tick behavior; `renderTargetingPreview` draws targeting hint.
- [ ] Ability registered in `AbilityRegistry.ts`; card def registered in `card_defs/index.ts`.
- [ ] Character's card list includes the new card id if the character should have the card.
- [ ] If the ability inflicts knockback: use `targetUnit.applyKnockback` with serializable params.

### Juice / feel

- [ ] Windup / impact / recovery line up with **`abilityTimings`** so the timeline matches the sim.
- [ ] **`renderTargetingPreview`** matches what the ability actually hits where it affects fairness or clarity.
- [ ] Damage path: if damage goes through usual `takeDamage` / event flow, hit flash applies; otherwise intentional extra feedback (effects / other presentation) was considered.
- [ ] Tooltip and timeline wording don't contradict timings (coordinate with narrative skill if needed).
