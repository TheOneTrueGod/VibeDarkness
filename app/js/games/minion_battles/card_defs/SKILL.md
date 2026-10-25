---
name: card-defs
description: Guide to Minion Battles card_defs - folder layout and id convention (ability groups), creating abilities and card defs, abilityTimings, registration, passives and the implementation checklist. Use when adding or changing an ability or card def, or when deciding which card_defs folder or id a new ability gets.
---

# card_defs: layout, ids and creating an ability

Ability implementation files live in `card_defs/` folders, never directly under `abilities/` (that holds shared helpers and the engine side). Abilities can have typed `tags` (separate from `keywords`); see `abilities/Ability.ts` and `abilities/abilityTagCatalog.ts` rather than copying tag lists here.

> **Full details:** this skill is the short version. The complete earlier guidance (knockback, movement, blocking, serialization, `abilityEvents` order, command cards, targeting previews, deployables, checklists) is preserved in [`ABILITY_GUIDE.md`](ABILITY_GUIDE.md). Read it before implementing anything non-trivial.

## Folder and id convention

A 4-digit ability id is `<group><index>`: the first two digits are the **group**, the last two the **index** within it (01 to 99). The group enum is `AbilityGroupId.ts` (this folder, source of truth; use `formatGroupId()` in code). Do not paste id tables into skills or docs.

**One group folder per thematic line.** A line is a weapon line, a core (skill tree), or an enemy family. Name it `NN_slug/` where `NN` is the group's two digits (examples: `05_earth_core/`, `08_light_core/`). Each ability gets `NN_slug/####_AbilityName/####Ability.ts` (file name matches its folder).

| What | Where |
|------|-------|
| New weapon line | Its own group and folder, e.g. `NN_<weapon>_weapon/`. Every ability that weapon grants lives there |
| New core (skill tree) | Its own group and folder, `NN_<name>_core/`, plus a `<Name>Core.md` (see below) |
| Core-crossover ability | The **home core**: the core whose research node unlocks it. Import the other core's helpers from that core's shared files. The home core's `<Name>Core.md` lists its crossovers and what they depend on. Never a second copy |
| Enemy ability | The enemy family's own group and folder, `NN_enemy_<family>/` (like `dark_animals/`, the legacy home of most group `00` abilities). Do not add to flat `00xx` |
| Super move | The owning weapon's or core's folder, index **90 and up** (`NN90`, `NN91`, ...) so supers read as a set. Enemy supers go in that enemy family's folder, same range. Revisit once the super-move design (plan item P1.4) lands |
| Shared helper for one group | A file in that group's folder (see `05_earth_core/earthCoreConstants.ts`, `09_gravity_core/gravityConstants.ts`). Cross-group helpers go in `abilities/` |

**Choosing ids.** Next free group = the largest `AbilityGroupId` member plus one (check the enum; groups are two digits, so `99` is the ceiling). Add the enum member **first**, with a doc-comment line pointing at the folder and any `<Name>Core.md`. Next free index = the highest `####` in that group's folders plus one. **Never reuse a removed id**: saves, decks and research nodes can still reference it (a gap such as `0303` is intentional). Order indexes by when they were added, except the supers range.

**Legacy folders (leave in place, do not move).** Flat folders directly under `card_defs/` (`00xx` enemies, `01xx` Warrior, `0203` to `0205` Ranger guns) have no group folder. They are legacy: do not rename or move them (ids are referenced from saves and registries, and moves churn imports), and do not add new flat folders. A new weapon line or enemy family never goes in a legacy flat folder: it gets a new group (see the table). Extend a legacy group only with a card that genuinely belongs to that exact line, and put it in a new `NN_slug/` folder rather than another flat one. Also predating this naming: `03_blood_mage/` (enum member `Mage`), `utility/` (group `06`, no number prefix), `dark_animals/` (group `00`, no prefix), `special/` (no group). New folders always use `NN_slug`.

**Adding a new group.**
1. Append the `AbilityGroupId` member (and a doc-comment line).
2. Create `card_defs/NN_slug/` and put every related ability under it; never scatter one line across unrelated folders.
3. For a core, add `<Name>Core.md` in the folder (same role as `EarthCore.md` / `GravityCore.md`: the tree's identity and where it diverges from generic patterns) and link it from the enum comment. Read it before changing that group's cards: `05_earth_core/EarthCore.md` for Earth, `09_gravity_core/GravityCore.md` for Gravity, `03_blood_mage/AGENTS.md` for Blood Mage.
4. Register abilities and card defs (see **Registration**).

## Literate programming: abilities as a list of behaviours

**Abilities should contain as little logic as possible.** Use helpers from `abilities/` so an ability reads as a list of behaviours.

- Compose `castBehaviours` (see `abilities/CastBehaviours/index.ts`) by calling helpers keyed to clear behaviours; do not inline geometry, damage/block checks or drawing when a helper exists or can be added. Helper files: `targetHelpers.ts`, `effectHelpers.ts`, `previewHelpers.ts`, `gunHelpers.ts`, `blockingHelpers.ts`, `petCommands.ts`.
- **Hitboxes (combat):** collect targets via a hitbox (`CircleHitbox` / `ThickLineHitbox` / `resolveHitbox`) or a wrapping helper such as `damageEnemiesInCircle`; never hand-roll radius or capsule loops. Environment damage stays on direct `takeDamage` / tile paths. See **working-with-hitboxes**.

## Reuse before you build

Break the ability into parts (movement, hitbox, effect, event rule, CastBehaviour) and check whether each exists. Reuse what does; for parts that do not exist, ask the user whether it is a one-off or a reusable helper, and which parameters vary. Prefer extending an existing `CastBehaviour` with config over a sibling class; a new one is only for genuinely atomic behaviour. Dash and lunge claim exclusive movement while sliding (see **Self-displacement owns walking** in `abilities/AGENTS.md`, which also covers declarative cast behaviours and select-target lock-on).

**Separation of concerns:** CastBehaviours and hitboxes detect *what* happened (who is in range, per-unit dedup) and emit an `AbilityEventType` (e.g. `ON_ATTACK_HIT`); `abilityEvents` declare *what to do* (damage, knockback tiers, buffs). You should be able to change the payoff by editing only `abilityEvents`.

**`abilityEvents` authoring order:** prefer presets, then inline rules, then `custom` handlers (with a short comment). If no inline primitive exists, ask the user whether to generalize. Conditions inside one rule are AND; multiple rules are OR. Rule types: `abilities/events/AbilityEffect.ts`.

## Special cases

- **Command cards and delegated abilities** (Sic 'em `0704` delegating to Pounce `0702`): with `abilitySource: { type: 'pet' }`, the preview draws from `resolveAbilitySourceUnits` (use `createPetSourcedMovementPreview`), follows the delegate's terrain-aware movement, and imports range constants from the delegate file. Checklist in `abilities/petCommands.ts`; reference `07_command_core/0704_SicEm/0704Ability.ts`.
- **Special actions:** zero-frame abilities with `actionChannel: 'special'` fill `BattleOrder.specialAction`, never enter `activeAbilities`, and never auto-end the turn. During sequential targeting, carry `specialAction` on the order. Reference: `0708`, `0709`.
- **Preview helper choice:** see the decision table at the top of `abilities/previewHelpers.ts`; if runtime movement uses `DashBehaviour` / `computeForcedDisplacement`, use the matching terrain-aware preview.
- **Deployables:** use `findDeployables` / `consumeDeployable` (see `game/deployables/AGENTS.md`), pass the caster's team, and use identical args in preview and cast. Reference: `08_light_core/0806_LayHands/0806Ability.ts`.

## Juicing the game

Correct rules are not enough: make the cast readable (telegraph, payoff, result). Ask for each ability about anticipation (`prefireTime`, `renderTargetingPreview`, early timing bands), impact (align one-shot behaviours (`Instant`) with timing intervals), and aftermath (recovery and labels).

- **Enemy hitbox telegraph:** for enemy abilities whose `renderActivePreview` shows a non-line projected area, use `previewHelpers` (`drawEnemyConeHitboxTelegraph`, `drawEnemyConvexQuadHitboxTelegraph`): faint red stroke, red fill growing from the shape centre, full red stroke from `prefireTime` through any linger. Leave line / thick-capsule previews alone. Ask the player if centring or geometry is ambiguous.
- **`abilityTimings` palette:** red = `active` (damage); light green = `active` + `tags: ['iframe']`; sky blue = `active` + `tags: ['juggernaut']`; white = `startup`; gray = `cooldown`. `iframe` / `juggernaut` are tags on an `AbilityTimingInterval`, not phases.
- **Damage feedback:** `GameRenderer` flashes units on `damage_taken`, so normal damage paths get it free.
- **Effects:** `Effect` (visual, render-driven, not serialized) vs `EffectEmitter` (game-tick, serialized); see `game/effects/AGENTS.md`. Defs live in `game/effect_defs/`. Time-based emission uses `abilityTimings[n].emitterDef` (`AbilityTimingEmitterDef`), not manual edge checks.
- **Player-facing copy:** **writing-style-abilities** (`.cursor/skills/narrative/writing-style-abilities/SKILL.md`). Mechanical keywords are standalone lines (see **Keyword lines [Canon]** in its `STYLE.md`). Do not restate `resourceCost` in tooltips; the card UI shows it.

## What goes in the ability file

- A **design comment** before imports: one prose paragraph (4 lines max) on what it looks like to use, its role in the kit, and how it plays out.
- The **ability** (`AbilityStatic`, `abilities/Ability.ts`) and the **CardDef** (`card_defs/types.ts`) with the same 4-digit id; `abilityId` points at the ability. Both exported from the one file. Shared values go in top-level constants.
- Abilities act only through `castBehaviours` on `abilityTimings` intervals (no per-tick hook); use `Instant` for one-shots. `renderTargetingPreview(gr, caster, currentTargets, mouseWorld, units)` draws the targeting hint. Implement the rest of `AbilityStatic` as needed; card `image` files stay in the card's folder (see **minion-battles-assets**).
- **Range** = range value + source object size + target object size.
- **Serialization:** store unit ids, not references.
- **Blocking:** `onAttackBlocked` is optional (projectiles deactivate, charges knock back the attacker, melee omits it). Blocking abilities implement `getBlockingArc`; projectiles need `sourceAbilityId`.
- **Knockback:** `tryApplyKnockbackByTier` (`crowdControl/knockbackKeywords.ts`); tiers 1 to 3.
- **Movement:** abilities that reposition the caster cost `resourceCost: { resourceId: 'movement_points', amount: 1 }` (2 for longer repositions); others use `null`.

### `abilityTimings`

Required on every ability, as `AbilityTimingInterval` rows (`abilities/abilityTimings.ts`): `id`, half-open `[start, end)` seconds, `abilityPhase`, optional `timelineLabel` / `timelineDescription`, `targetDef`, `conditionalCancel` (see `ConditionalCancelDef`). Overlaps: first listed wins on the merged band; total duration is `max(end)`. Legacy `{ duration, abilityPhase }` is for adapters and tests only.

- **Sequential targeting playahead:** a `targetDef: { kind: 'select', ... }` opts into interactive sequential targeting (`docs/interactive-sequential-targeting.md`). Select defs must be on **raw** timing entries (`getSelectTargetDefsFromTimings` in `abilities/targeting.ts`), not post-split ones. t=0 selects and windup-lunge abilities rely on `findPreviewDeferredSelectLabel`.
- **Entombed (rock tree):** abilities usable while inside terrain pause near the end for an `Entombed` chain or `wait`. Use `withEntombedWallConditionalCancelAndLinger` from `abilities/entombed/entombedWallCancel.ts` (adds the one-tick linger before `cooldown` so the pause fires before Cooldown). Examples: `0107_ThrowRock`, `0108_ThrowChargedRock`; `0534` inlines it.

## Registration

- **Ability:** `abilities/AbilityRegistry.ts`, import and `register(YourAbility)`. This is the step most often forgotten: a card can exist in `CARD_DEF_MAP` while `getAbility(id)` is `undefined` (bit `0116` once).
- **Card def:** `card_defs/index.ts`, import and add to the `cardDefs` array.
- Suffix the exported ability constant with its id to avoid collisions (`SwingBatAbility_0115`). Use this for all new abilities.

## Passive abilities

An `AbilityStatic` with `passive?: PassiveDef` (`abilities/passiveDef.ts`, which lists the triggers, effects and `targetFilter` options). No cast order is issued; `processUnitPassives` (via `UnitManager.gameTick`) fires it every tick for alive units carrying the id. Checklist: non-empty `passive`; `abilityTimings: []` and `targets: []`; registered; every spawn config (static defs and dynamic `createUnitFromSpawnConfig` calls) lists the id; no `CardDef` unless it is also a player card.

## Checklist

- [ ] Design comment at the top of the file.
- [ ] Group folder `NN_slug/` chosen per **Folder and id convention** (new group: enum member first); folder `####_AbilityName/` and file `####Ability.ts` created.
- [ ] Id = group (2 digits) + index (2 digits), not reused; supers in the 90+ range.
- [ ] One file exports ability and `CardDef` with matching `id` / `abilityId`.
- [ ] Non-empty interval `abilityTimings`; `castBehaviours` and `renderTargetingPreview` implemented.
- [ ] Registered in `AbilityRegistry.ts` and `card_defs/index.ts`.
- [ ] Character card list or research node grants the card where applicable (research costs: see **research-trees** and `app/js/researchTrees/researchCostPolicy.ts`).
- [ ] New enemy character: add to `BESTIARY_ENTRIES` in `app/js/components/minionBattlesHomePage/BestiaryPanel.tsx`; the entry list is built from the bestiary unit ids there.
- [ ] Shape damage or CC uses a hitbox; knockback uses `tryApplyKnockbackByTier`; select `targetDef` checked under sequential targeting.
- [ ] Juice: timings match the sim, preview matches what is hit (dashes: terrain-aware and correct origin), tooltips do not contradict timings.
