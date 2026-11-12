# Water tree: the Blood Mage overlap

Water will be its own skill tree. This plan builds its first slice as an **overlap with the Blood Mage**: a Water resource drawn from water tiles, and three ice cards that take over a Blood Mage card's slot while the caster can pay for them, falling back to the blood card when it can't.

The look is decided in the artbook, plan `docs/ideas/plans/0005_2026-11-11_water-tree.md` (Ideas → Plans). Its studio art pieces (`app/js/components/minionBattlesHomePage/Ideas/fxArt/waterArt.tsx`) are the visual spec: the Water bar, the icons, the tile drain and the three ability effects. Port shapes and timings from there rather than redesigning them.

Build the engine, not the feature (`app/js/games/minion_battles/AGENTS.md`): the terrain siphon, the liquid bar, the "while castable" swap, the particle shapes, the oriented rectangle hitbox and the stunning ground hazard are all reusable building blocks. None of them may name Water or a card id in engine code.

## Decisions

From the artbook (2026-11-11):

- **Palette: Tidewater.** Primary `#1e3a8a` deep navy (mass), secondary `#5eead4` seafoam (event, and the resource colour).
- **Particles:** the Water spell circle throws **ice shards and droplets**. Ice Claws' streaks and the Ice Shards projectile use the **frost** trail (six-armed crystals).
- **Water resource:** max 16. While below max and standing in or next to water, the caster draws on up to 4 water tiles in the 3x3 around it. Each drawn tile loses 1/8 of its health per second, and the caster gains 0.5 Water per second. A tile that runs out drops a level: deep → water → shallow → dirt. Tooltip: "+0.5/s in or beside water. Drains up to 4 nearby tiles · max 16."
- **Swaps:** each ice card holds its blood card's bar slot while the caster has the Water and the uses to cast it. When either runs out, the blood card is back in the slot.
- **Frozen Field** is a classic "high damage, long windup" spell:
  - a 1 s windup;
  - the target point (a little way in front of the caster) is picked 0.2 s before the first hit, and those 0.2 s play the intro, ice shards rising out of the ground across the field;
  - a rectangle of ice lands centred on that point, aimed along caster → target;
  - it deals damage over time and re-stuns every enemy inside on each pulse;
  - a mode strip switches the card to Blood Burst.

Defaults this plan uses for questions the artbook left open. Change the constants if the user decides otherwise:

| Question | Default |
|---|---|
| Frozen Field cost (the brief said 20, but max Water is 16) | **16** (all of it). If 20 is wanted, raise `WATER_MAX` to 20 instead. |
| Which 4 tiles are drawn on when more are in range | Deepest first. Ties go to the caster's own tile, then orthogonal neighbours, then diagonals, then row/column order. |
| A fully drained shallow tile becomes | **Dirt** (rock dropped into water still makes gravel) |
| How the cards are granted for now | Three new **Blood Mage research nodes**. Each requires the matching blood card's node (the Core node for Ice Shards). Each adds the ice card and attaches the Water resource. A Water core comes with the standalone tree later. |
| Ice Claws uses | 3, refilled each round like Bloody Claws. The swap also needs a use left. |
| Ice Claws bleed | Keeps Bloody Claws' bleed, so the overlap feeds Ice Shards' splinters |
| Ice Shards splinters | Same rule as Blood Shard: only with Blood Splinters researched, checked on each throw |

### Numbers

| | Blood card | Ice card |
|---|---|---|
| Claws | 5 per claw, 3 HP, 3 uses, claw (12, -48) → (62, 18), half-thickness 8 | **6** per claw, **3 Water**, 3 uses, claw **(16, -60) → (92, 26)**, half-thickness **12** (aim frame: forward, side) |
| Shards | 10, 2 HP, one throw, stops on first hit | **12** per shard, **4 Water**, **two throws** (More Rock pattern), each **pierces 1** (stops on the second enemy) |
| Burst / Field | Cone 160 range, 60°, 10 dmg, knockback | Target within **140 px**. Rectangle **160 long × 120 wide** centred on the target. **10** impact damage, then **4** every **0.5 s** for **3 s** (6 pulses). Each hit and pulse stuns **0.6 s** (through the CC armour gate). |

Frozen Field timeline (seconds): `0 – 0.8` windup with the Water spell circle; `0.8 – 1.0` the target pick, then the intro (shards rise across the field); `1.0` impact, and the field is placed; `1.0 – 4.0` the field pulses (the caster is free once the cast's cooldown ends; the field is a ground effect); cooldown to `1.8`.

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`). The invoking agent is the **sole orchestrator**. It spawns one worker per step **synchronously** (never in the background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks its items off with a one-line summary each, and **stops without spawning the next agent**.

Relevant project skills:

- **working-on-minion-battles**, **creating-an-ability** (+ `card_defs/SKILL.md`, `card_defs/ABILITY_GUIDE.md`) and **editing-card-behaviour**
- **game-object-def-pattern** (new def properties), **working-with-hitboxes**, **time-dilation** (which clock pulses read)
- **research-trees**, **editing-and-creating-components** (the bar), **ability-tests**, **scoped-testing**, **writing-nested-agents-files**
- Read `themes/AGENTS.md`, `abilities/AGENTS.md`, `terrain/AGENTS.md`, `crowdControl/AGENTS.md`, `game/effects/AGENTS.md` and `card_defs/03_blood_mage/AGENTS.md` before touching those areas.

Tests use **Vitest** (`npx vitest run <file>`), never Jest. The working tree has unrelated uncommitted work; build on it and never revert or reformat files outside the step.

**Per-step verification:** `npx vitest run` on only the test files the step touches or creates, plus `npx tsc --noEmit` when the step crosses an interface or class boundary. No full-suite, whole-directory or AbilityTest runs inside Steps 1-13. Step 14 runs those once.

## Steps

### Step 1: Water group, theme and resource id

Files: `card_defs/AbilityGroupId.ts`, `themes/abilityThemes.ts`, `themes/abilityTheme.test.ts`, `themes/AGENTS.md`, `resources/resourceIds.ts`, new `card_defs/15_water/AGENTS.md`.

- [x] Add `Water = 15` to `AbilityGroupId`, with a doc line pointing at `card_defs/15_water/`.
  - Done: `Water = 15` added; doc line points at `card_defs/15_water/AGENTS.md`.
- [x] Add `WATER_THEME` (`id: 'water'`, primary `#1e3a8a`, secondary `#5eead4`, a dark navy `font` such as `#0b1a3a`, `shadeFactor: 0.5`), register it in `ABILITY_THEMES` and map group 15 to it in `ABILITY_GROUP_THEMES`.
  - Extend the group/enum check in `abilityTheme.test.ts`. Add Water to the two-tone list in `themes/AGENTS.md`.
  - Done: `WATER_THEME` registered and mapped to group 15; test checks Storm/Court Magic/Water group keys plus a new "resolves a Water ability to Tidewater" case; Water added to the two-tone list. Surprise: a two-tone group with no SVGs fails `svgPalette.test.ts` ("has SVGs to check"), so `'water'` is in its `RASTER_ART_GROUPS` with a comment. **Step 7 must remove that entry** once the first ice card SVG lands.
- [x] Add `Water: 'water'` to `resourceIds.ts`.
  - Done: added to `ResourceId` and `ALL_SERIALIZABLE_RESOURCE_IDS`. Surprise: `createResourceFromId.ts`'s mapped factory type made the bare id a tsc error, so a **minimal `resources/Water.ts` stub** now exists (id, name, `WATER_RESOURCE_COLOR` from the theme secondary, icon `Droplet`, `WATER_MAX = 16`, no-op subscribe) and is registered in the factory. **Step 4 extends this file** (siphon `onTick`, `perSecondGain`, display entry) rather than creating it.
- [x] Create `card_defs/15_water/AGENTS.md` (per **writing-nested-agents-files**): the tree's identity (Tidewater; ice cards; long, committed casts for big effects), the overlap rule (each ice card swaps into its blood card's slot while castable), and a path table to fill in as cards land.
  - Run `themes/abilityTheme.test.ts` and `npx tsc --noEmit`.
  - Done: identity, Tidewater look, long-cast feel, the `whileCastable` overlap rule and a (planned) path table for 1501-1503; referenced from the `card_defs/` row in `minion_battles/AGENTS.md`. Verified: lint (only the known warning), `abilityTheme.test.ts`, `svgPalette.test.ts`, `createResourceFromId.test.ts` green; `npx tsc --noEmit` clean.

### Step 2: Particle shapes as data (frost, shard, droplet)

Files: `game/effects/motes.ts`, `game/effects/motes.test.ts` (create if missing), `game/effects/projectileParticleTrails.ts`, `game/effects/AGENTS.md`.

- [x] Give `MoteSpec` an optional `shape` (`'spark'` default, `'frost'`, `'shard'`, `'droplet'`) and an optional `gravityPx`. With `gravityPx`, the particle climbs, arcs over and falls back that far below its start, like the studio's Droplets. Store both on `MoteEffectData` so the painter needs nothing else.
  - Done: `MoteShape` type; `createMote` copies `shape` (+ random `angle`/`spin` for frost/shard) and `gravityPx` (+ derived `arcPx`, so the peak is `risePx` above the start) onto `MoteEffectData`; the effect's end point is `gravityPx` below the start and `moteDrawOffsetY(data, p)` adds the arc. Plain sparks consume the same RNG draws as before. The `Mote` painter (`effect_defs/moteEffects.ts`, not in the Touches list) now passes shape/angle and the arc offset.
- [x] Teach `drawMote` the three new shapes, following the studio's `frost` / `shards` / `droplets` styles in `ParticleFxPreview.tsx`:
  - Done: `drawMote` takes an optional last `{ shape, angle }` (`MoteDrawOptions`), so inline painters (Step 11's spell circle) can draw any shape; frost = three crossing bars with studio-style V barbs, shard = kite with a lit facet, droplet = ellipse bead with highlight. All keep the `glowColor` halo + `color` body + white highlight roles. `moteAngle(data, p)` gives the turning/tumbling rotation.
  - frost: a six-armed crystal that turns as it rises;
  - shard: a faceted sliver that tumbles;
  - droplet: a bead with a highlight.
  - Every mote keeps the existing colour roles (core colour plus glow).
- [x] Add presets: `MOTE_PRESETS.frost(themeId)` (ambient frost) and `frostTrail(themeId)` (short-lived, for trails), and `PROJECTILE_PARTICLE_TRAIL_PRESETS.frost(themeId)`.
  - Tests: each shape round-trips through `createMote` into effect data; `gravityPx` makes the drawn y return below the start by the end of life; omitting `shape` keeps today's spark.
  - Run `motes.test.ts`.
  - Done: added `frost`, `frostTrail`, plus `iceShards` and `droplets` (gravityPx 5) presets for Step 11's spell circle, and `PROJECTILE_PARTICLE_TRAIL_PRESETS.frost(themeId)` (50/s of `frostTrail`). Documented in `game/effects/AGENTS.md`. 6 new tests in `motes.test.ts` (shape round-trip, spark unchanged incl. draw calls, per-shape primitives, gravity arc, theme colours). Verified: lint (only the known warning), `motes.test.ts` 19/19, `npx tsc --noEmit` clean.

### Step 3: Drainable water tiles

Files: `terrain/TerrainType.ts`, `terrain/TerrainManager.ts`, `terrain/FloorTile.ts` (only if the destructible `kind` union lives there), new `terrain/TerrainManager.water.test.ts`.

- [x] Add `lowerWaterLevel(type)` beside `raiseGround`. It returns the next shallower terrain (deep → water → shallow → **dirt**), or null for non-water.
  - Level 0 here is dirt, not gravel: a drained puddle, not filled-in water. Document the difference next to `TERRAIN_FOR_WATER_LEVEL`.
  - Done: `lowerWaterLevel` in `TerrainType.ts` (level 1 → `DRAINED_DRY_TERRAIN` = Dirt, else the level below); the gravel-vs-dirt difference is documented on `TERRAIN_FOR_WATER_LEVEL`.
- [x] Add `TerrainManager.drainWater(col, row, fraction, sourceUnitId?)`, modelled on `damageRock`.
  - Water tiles get a lazily created `destructible` of `kind: 'water'` (health 1).
  - `fraction` is health removed. At 0 the tile drops one level through `lowerWaterLevel` and its health resets (dirt has none).
  - It returns a transition object like the rock one, for renderers and events. Emit a `terrain_water_drained` event (or reuse the stone-damaged shape) when a tile changes level.
  - Pathfinding and the floor layer must see the new terrain exactly as for rock changes.
  - Done: `drainWater` in `TerrainManager.ts`; `FloorTile.ts` gains `WATER_DESTRUCTIBLE_KIND` (`'water'`), `WATER_TILE_HEALTH` (1) and `TerrainWaterDrainedTransition` (rock fields + `levelDropped`). It returns a transition on every successful drain (partial ones too, for Step 4/renderers) but only a level drop bumps `navEpoch` and fires the new `setWaterDrainedEmitter` → **new `terrain_water_drained` event** (not the stone one: that would grant Earth Core Resonance). A drain drops at most one level (excess discarded); a 1e-9 epsilon absorbs float error from per-tick fractions. Outside Touches: `EventBus.ts` (event type), emitter wired in `GameEngine.prepareForNewGame` / `destroy` and `engineSerialization.deserializeEngine`, and `InterruptSystem` now flags `terrain_changed_near_path` for water drops too (shared handler). `kind` is a plain string, so no union edit; `FloorTileRenderer` already filters crack overlays to `kind === 'rock'`. Documented in `terrain/AGENTS.md`.
- [x] Tests: 8 drains of 1/8 lower deep to water; shallow drains to dirt; non-water returns null; health resets after a level drop; the floor tile serializes and restores (checkpoint round-trip).
  - Run `TerrainManager.water.test.ts` and `terrain/TerrainManager.rock.test.ts`.
  - Done: `TerrainManager.water.test.ts` (20 tests: all the listed cases plus partial-drain transition, one level per call, deep→dirt in 24, 480 per-tick drains, navEpoch/passability only on a drop, water floor over other bedrock, stone on a part-drained tile). Verified: lint (only the known warning), water 20/20 + rock 26/26, `npx tsc --noEmit` clean. Step 4 note: `drainWater(col, row, drainPerTilePerSec * dt, unit.id)` is ready to call; deepest-first picking can read `TERRAIN_PROPERTIES[type].waterLevel`.

### Step 4: Terrain siphon and the Water resource

Files: new `resources/terrainSiphon.ts`, new `resources/terrainSiphon.test.ts`, new `resources/Water.ts`, `resources/createResourceFromId.ts`, `resources/resourceDisplayDefs.ts`, `resources/Resource.ts`.

- [x] `terrainSiphon.ts`: a reusable, data-driven siphon.
  - `TerrainSiphonConfig`: `terrains` it draws from, `radiusCells` (1 = the 3x3), `maxTiles`, `drainPerTilePerSec`, `gainPerSec`.
  - `pickSiphonTiles(unit, terrain, config)`: deterministic selection — deepest first, then the unit's own cell, then orthogonal, diagonal, and row/column order.
  - `tickTerrainSiphon(resource, unit, engine, dt, config)`: does nothing at max. Otherwise it drains each picked tile by `drainPerTilePerSec * dt` through `drainWater` and adds `gainPerSec * dt`, clamped to max.
  - No engine RNG; the result must be identical on every client.
  - Done: `resources/terrainSiphon.ts` exports `TerrainSiphonConfig`, `pickSiphonTiles` (sort: `waterLevel` desc, then squared cell distance, then row, then col; reads effective terrain so drained tiles drop out), `tickTerrainSiphon` (returns the drawn tiles; no-op at max, without `terrainManager`, or `dt <= 0`; gain is a flat `gainPerSec * dt` however many tiles) and `terrainSiphonGainPerSec` for tooltips. No RNG, no Water names.
- [x] `Water.ts`: `Resource` subclass (`id: 'water'`, colour from `WATER_THEME.secondary`, icon `Droplet`, max `WATER_MAX = 16`), `onTick` → `tickTerrainSiphon` with `WATER_SIPHON` (`radiusCells 1`, `maxTiles 4`, drain `1/8`, gain `0.5`), and `perSecondGain` showing the live gain.
  - Register it in `createResourceFromId.ts`.
  - Done: extended the Step 1 stub: `WATER_SIPHON` (all `WATER_TERRAIN_TYPES`, radius 1, 4 tiles, 1/8, 0.5), `onTick` → `tickTerrainSiphon`, `perSecondGain` via `terrainSiphonGainPerSec` (primed by `primeDisplayContext`, like Gravity), plus `barStyle = 'liquid'` and `tooltipLines`. Already registered in `createResourceFromId.ts` since Step 1 (no change needed).
- [x] Add an optional `tooltipLines?: string[]` to `ResourceDisplay` (`Resource.ts`). Add the Water entry to `resourceDisplayDefs.ts` with `barStyle: 'liquid'` and the tooltip lines from the Decisions section.
  - Tests: no gain away from water; 0.5/s next to water; at most 4 tiles drained, picked deepest-first; stops at max; a tile drops a level after 8 s of draining.
  - Run `terrainSiphon.test.ts` and `npx tsc --noEmit`.
  - Done: `ResourceDisplay.tooltipLines?: readonly string[]` + matching `readonly` on `Resource`; **`'liquid'` added to the `ResourceBarStyle` union now** (needed for tsc; Step 5 only has to render it — until then `ResourceBarRow` falls back to `GenericResourceBar`). Water display entry added. Tooltip lines follow the studio mock (no trailing periods): `+0.5/s in or beside water`, `Drains up to 4 nearby tiles · max 16` (`WATER_TOOLTIP_LINES`). Step 5 note: the existing live `perSecondGain` "+ 0.5/s" line will also show beside the first tooltip line; decide whether to hide it when `tooltipLines` is present. Verified: lint (only the known warning), `terrainSiphon.test.ts` 14/14 + `createResourceFromId.test.ts` 3/3, `npx tsc --noEmit` clean.

### Step 5: Liquid resource bar

Files: new `ui/components/resources/LiquidResourceBar.tsx`, `ui/components/resources/ResourceBarRow.tsx`, `ui/components/resources/ResourceIcon.tsx`, `resources/Resource.ts` (the `barStyle` union), `.claude/skills/components-for-the-ui/SKILL.md`.

- [x] Port `WaterBar` from `Ideas/fxArt/waterArt.tsx` into `LiquidResourceBar` (160 × 16, matching the other bars).
  - The fill's leading edge is a moving surface: two sine layers inside a mask, so the gradient stays still.
  - Also: a caustic glint, rising bubbles, and faint ticks every 4.
  - Colours come from `resource.color` (secondary) and the matching theme primary, passed in, not hard-coded.
  - Honour `prefers-reduced-motion`. Keep SVG ids unique with `useId`.
  - Done: `ui/components/resources/LiquidResourceBar.tsx` ports `WaterBar` (same wave paths, mask, caustic, 3 bubbles; fill layers hidden at 0; ticks every `LIQUID_BAR_TICK_EVERY = 4` below max, scaled to `max`). Colours: new generic **`ResourceDisplay.barDeepColor`** (+ `Resource.barDeepColor`; Water sets `WATER_BAR_DEEP_COLOR` = theme primary in `Water.ts` and `resourceDisplayDefs.ts`), surface = `resource.color`, highlight = new `mixCssHex(color, '#fff', 0.55)` in `themes/colorUtils.ts` (+ test). Own keyframes in a `<style>`; `prefers-reduced-motion: reduce` turns the animations off via a media query. Ids from `useId`, sanitised for `url(#...)`.
- [x] `barStyle: 'liquid'` → `LiquidResourceBar` in `ResourceBarRow`. Render `tooltipLines` under the name in the tooltip for any resource that has them. Map `Droplet` in `ResourceIcon`.
  - Done: `ResourceBarRow` switches on `barStyle` (`pips` / `liquid` / default). `tooltipLines` render under the name (first line normal, later lines `text-gray-400`; a leading `+N` is drawn in the resource colour) and, per the orchestrator's decision, **replace** the live "+ x/s" line; resources without `tooltipLines` are unchanged. `Droplet` added to `ResourceIcon`'s `ICON_MAP`. Checked with a throwaway `renderToStaticMarkup` render (deleted): the tooltip shows exactly the three lines and the bar markup matches the studio.
- [x] Add `LiquidResourceBar` to the components skill list.
  - No new test file (visual); run `npx tsc --noEmit`.
  - Done: row added to `.claude/skills/components-for-the-ui/SKILL.md` (the `.cursor/` copy already differed from it, so it was left alone). Verified: lint (only the known warning), `colorUtils.test.ts` + `createResourceFromId.test.ts` 7/7, `npx tsc --noEmit` clean. Not yet seen in a live battle (Step 14's browser check).

### Step 6: "While castable" swap trigger

Files: `abilities/Ability.ts` (swap types), `abilities/abilitySwap.ts`, `abilities/abilitySwapNetwork.test.ts`, `game/units/Unit.ts` (call site), `abilities/AGENTS.md`.

- [x] Add `SwapTrigger { type: 'whileCastable' }` and `DeactivateTrigger { type: 'whileCastable' }`.
  - The swap ability takes its target's slot while the unit can pay its resource cost **and** it has uses left. It gives the slot back as soon as either fails.
  - Reuse the existing cost / uses checks (`abilityUses.ts`, the resource-cost helpers in `Ability.ts`); do not re-implement them.
  - Done: both union members added in `Ability.ts` (doc comments). `abilitySwap.ts` gains `isCastableNow` = `canUseAbilityNow` && `canAffordAbility` and `settleWhileCastableSwaps`. Surprise: activation used to reset uses to `usesOnActivation ?? maxUses`, which would make a `whileCastable` card castable forever, so a `whileCastable` activation now **keeps the ability's own uses** (`usesOnActivation` ignored; noted on the field). Hidden swap cards are still in `unit.abilities`, so `refillUsesAtRoundStart` refills them as usual.
- [x] Evaluate `whileCastable` swaps once per unit tick and when an ability's uses change.
  - Never swap a slot whose ability is mid-cast; it settles when the cast ends.
  - Emit `ability_bar_changed` only when something changed, so the hand UI does not re-render every tick.
  - Done: new `SwapEvent` `{ type: 'refresh' }` and `Unit.refreshSwapNetwork(eventBus)`. Called per unit tick from `UnitManager.gameTick` Phase 1c right after resource `onTick` (outside Touches; `Unit.ts` holds the method), and at the end of `Unit.onRoundStart` (so round-start refills show before the order pause). The `abilityExhausted` path deliberately does **not** settle `whileCastable`: the use is spent as the cast starts (before it is in `activeAbilities`), so it settles on the first refresh after the cast ends. Mid-cast guard = either card or any of their `abilityModes.modeAbilityIds` in `unit.activeAbilities` (covers Step 12's Blood Burst mode). The existing `changed` flag means one event per real swap.
- [x] Make sure the slot's state survives a checkpoint round-trip: `runtime.active` / `replacedAbilityId` are already serialized, so a restore must not flip the slot.
  - Done: no serialization change needed; the evaluator is a pure function of serialized state (uses, resource, `activeAbilities`), so restored engines settle identically. Covered by a `GameEngine.toJSON` → `fromJSON` test (Water restored, bar order equal, 5 ticks with no flip and no event).
- [x] Document the trigger in `abilities/AGENTS.md`.
  - Tests (`abilitySwapNetwork.test.ts`): swaps in when affordable, back when the resource drops below cost, back when uses hit 0, not mid-cast, no event spam on steady state.
  - Run that file and `npx tsc --noEmit`.
  - Done: new "Swap network (`swapConfig`)" section (trigger table + `whileCastable` rules). New Scenario E (8 tests) with two `registerAbilityForTest` cards (cost 3 Water, 2 uses, 0.5 s cast) on a real tiny engine: hidden when unaffordable, in when affordable (uses kept), out below cost, out after the last use's cast ends and back at round start, not out mid-cast after spending the last Water, not in while the replaced card is mid-cast, exactly one `ability_bar_changed` per swap, checkpoint round trip. Removing the mid-cast guard fails 3 of them. Verified: lint (only the known warning), `abilitySwapNetwork.test.ts` 20/20, `npx tsc --noEmit` clean. Step 7 note: Ice Claws needs no extra wiring beyond `swapConfig`; its uses refill each round while hidden.

### Step 7: Ice Claws (1501)

Files: new `card_defs/15_water/1501_IceClaws/1501Ability.ts`, `1501Ability.test.ts`; `card_defs/index.ts` / registry per `card_defs/SKILL.md`; `game/effect_defs/clawSlashEffects.ts` (colour inputs only, if not already data).

- [x] Build Ice Claws from the same building blocks as Bloody Claws (`0306Ability.ts`): three strikes (left, right, X), `aimFrameSegmentHitbox` claws, `turnLimit`, step lunges and the same timing table.
  - Share code rather than copy where a helper falls out naturally, e.g. a `clawComboTimings(...)` builder used by both.
  - Numbers from the table: claw (16, -60) → (92, 26), half-thickness 12, 6 damage, bleed 1 per hit, 3 uses refilled per round, `resourceCost: { resourceId: 'water', amount: 3 }` paid on the first strike (no HP cost).
  - Done: new **`abilities/clawCombo.ts`** (`buildClawCombo(config)` → `{ leftClaw, rightClaw, abilityTimings, aiMaxRange }`, `ClawComboTimings`, `CLAW_COMBO_LABELS`); Bloody Claws now builds from it (HP payment via `firstStrikeStart`; same intervals, labels and behaviour; exports kept, plus `BLOODY_CLAWS_RECOVERIES`). `card_defs/15_water/1501_IceClaws/1501Ability.ts` reuses Bloody Claws' timings, lunges, turn limit, uses/recoveries and bleed, with its own claw, 6 damage and `resourceCost` 3 Water. The engine spends `resourceCost` at cast start and refunds it if interrupted before `swipe_left` (`doNotRefund`), so "paid on the first strike" holds without a custom behaviour. Registered in `AbilityRegistry.ts` and `card_defs/index.ts`.
- [x] `swapConfig`: `activateTrigger` / `deactivateTrigger` `whileCastable`, `replacesAbilityId: '0306'`.
  - Done: as specified (`replacesAbilityId: BloodyClawsAbility_0306.id`); no extra wiring needed.
- [x] VFX: the claw slash in Tidewater colours (pass them as effect data), plus a frost trail along each claw (`MOTE_PRESETS.frostTrail('water')`, spawned along the segment) and frost chips on hit.
  - Card icon: port `IceClawsIcon` from the studio art, painted with the Tidewater hexes.
  - Done: `clawSlashEffects.ts` already took colours as data (doc comment only). `ClawSlashStyle` on the combo config (glow/core colours, spacing, duration, `trail`, `hitBurst`); Ice Claws: glow = secondary, core = secondary mixed 55% to white (the studio's `light`), spacing 7, 6 `frostTrail` motes along each claw, 5 `iceShards` motes per hit unit. New generic spawners `motesAlongSegment` / `moteBurst` in `game/effects/motes.ts` (seeded `moteRng`, never engine RNG; documented in `game/effects/AGENTS.md`). Icon `1501_IceClaws/iceClaws.svg` (`?raw` import) ports `IceClawsIcon` using only theme hexes: `font` background, primary mist gradient, set A = navy under-stroke + 50% seafoam + 75% white, set B = seafoam + white, white tips. **`'water'` removed from `RASTER_ART_GROUPS`** in `svgPalette.test.ts`; the guard now checks this SVG (green).
- [x] Tooltip in the house style (`.claude/skills/narrative/writing-style-abilities/STYLE.md`).
  - Tests: claws hit a unit at forward 90 that Bloody Claws misses; 6 damage; 3 Water spent once per cast; swap falls back to Bloody Claws at 2 Water (multi-order pattern from **ability-tests**).
  - Run `1501Ability.test.ts`.
  - Done: Bloody Claws' two lines with `{{DAMAGE}}` = 6, plus "Takes Bloody Claws' slot while you can pay for it." (no Water restatement; the card shows `resourceCost`), and `flavorText`. `1501Ability.test.ts` (8 tests): forward-90 hit vs Bloody miss, 6 damage + bleed, 3 Water once per cast and no HP, Tidewater slash + frost/shard motes, registration + swapConfig; on a real tiny engine: slot held at 3 Water / not at 2, cast at 5 → Bloody Claws back at 2 after the cast (not mid-cast), two casts spend 3 each and keep own uses. Docs: `abilities/AGENTS.md` (clawCombo row), `15_water/AGENTS.md` and `03_blood_mage/AGENTS.md` rows. Verified: lint (only the known warning); `1501Ability.test.ts` 8/8, `0306Ability.test.ts` 14/14, `svgPalette.test.ts` 28/28, `motes.test.ts` 19/19, `selectCompanionPreview.test.ts` 2/2; `npx tsc --noEmit` clean. Not yet seen in a live battle (Step 14).

### Step 8: Ice Shards (1502)

Files: new `card_defs/15_water/1502_IceShards/1502Ability.ts`, `1502Ability.test.ts`; `card_defs/03_blood_mage/0304_BloodShard/0304Ability.ts` (export or extract the splinter launch only); registry.

- [x] Two throws, each with its own target, from the More Rock dual-throw pattern in `card_defs/throwSharedTimings.ts`. Use `QUICK_THROW_PROFILE` pacing.
  - Each throw: `ProjectileLaunch` with `withPierce(1)`, 12 damage, Blood Shard's range and speed. The projectile uses Tidewater colours and `PROJECTILE_PARTICLE_TRAIL_PRESETS.frost('water')`.
  - `resourceCost` 4 Water, paid once per cast; 3 uses, as Blood Shard.
  - Done: `buildMoreRockTimings` gained optional `pacing` (new `DualThrowPacing`; default `MORE_ROCK_PACING`, so Throw Rock / Charged Rock / Knife are unchanged), `windupBehaviours`, per-throw `releaseBehaviours` (aimed at that throw's target index), `onProjectileHit` and `secondTargetLabel`; new `dualThrowPacing(profile)` (second windup = the first; quick profile gives releases at 0.2 s / 0.5 s, 1.5 s cast) and `dualThrowMovementPenaltyStates`. `card_defs/15_water/1502_IceShards/1502Ability.ts`: 12 damage, pierce 1, Blood Shard range/speed/recoveries, 3 uses, `resourceCost` 4 Water (spent at cast start, refunded before the first throw's `doNotRefund`), new Tidewater sprite `assets/projectiles/ice_shard.svg` + frost trail, seafoam `CollisionClash` on expiry, own two-pixel `targets` ("Target location", "Second target"), two-line preview. Registered in `AbilityRegistry.ts` and `card_defs/index.ts`.
- [x] Blood Splinters: when `blood_mage_shard_splinters` is researched, each throw's release also runs the same splinter launch as Blood Shard, via `findBloodSplinterHosts` and `withEmergeFrom`.
  - Extract that launch into a shared helper in `0304Ability.ts`; do not copy it.
  - Done: `0304Ability.ts` now exports `bloodSplinterLaunch` (host damage credited to `ctx.abilityId`, identical for Blood Shard), `hasBloodSplinters`, `drawBloodSplinterPreview`, `BLOOD_SPLINTER_TOOLTIP_LINE` / `_BINDINGS`; Blood Shard uses them unchanged in behaviour. Ice Shards checks the research per cast in `getAbilityTimings` (as Blood Shard) and puts the launch in both release frames, so a bleeding host bursts on each throw (4 stacks each time).
- [x] `swapConfig` `whileCastable`, `replacesAbilityId: '0304'`. Card icon from `IceShardsIcon` (Tidewater hexes; the frozen blood bead is a deliberate exception in `svgPalette.test.ts`'s allow list).
  - Tests: one cast fires two shards at two targets; a shard passes through the first enemy and stops on the second; splinters fire only with the research.
  - Run `1502Ability.test.ts` and `0304Ability.test.ts`.
  - Done: swap as specified. Icon `1502_IceShards/iceShards.svg` ports `IceShardsIcon` (font background, primary mist, white -> secondary -> primary body gradient, shade outline; the studio's `light` became white at reduced opacity); `PER_FILE_ALLOW` entry with comment for `#b91c1c` / `#7f1d1d`. Tooltip: one mechanic line + the swap line (+ Blood Shard's splinter line when researched), flavour text set. `1502Ability.test.ts` (9 tests): two shards at two targets at 0.2 s / 0.5 s (1.5 s cast), pierce through first and stop on second (third untouched), 4 Water once per cast and no HP, ice sprite + frost trail + 2 damaging hits, registration/swapConfig/uses; splinters on each throw only with research, tooltip line only with research; real tiny engine: slot held at 4 Water, Blood Shard at 3. Tests supply the second target between throws (as the live lookahead does), since `ProjectileLaunch` aims at the trailing pixel. Docs: `15_water/AGENTS.md` and `03_blood_mage/AGENTS.md` rows. Verified: lint (only the known warning); `1502Ability.test.ts` 9/9, `0304Ability.test.ts` 13/13, `svgPalette.test.ts` 29/29, `selectTargetLookahead.test.ts` 6/6, `AbilityRegistry.test.ts` + `previewCanonEquivalence.test.ts` green; `npx tsc --noEmit` clean. Not yet seen in a live battle (Step 14).

### Step 9: Oriented rectangle hitbox

Files: new `hitboxes/OrientedRectHitbox.ts`, `hitboxes/OrientedRectHitbox.test.ts`, `hitboxes/index.ts`, `hitboxes/SKILL.md`.

- [x] `orientedRectAtPointHitbox({ length, width, maxRange })`: a `HitboxSpec` whose rectangle is centred on the aim point and aimed along caster → aim point.
  - The aim point is clamped to `maxRange` from the caster.
  - It provides the usual preview drawing, unit query and `getCells`-style "cells whose centre is inside", so the ground hazard and the hit use one geometry.
  - Tests: clamped aim; a rotated rectangle includes and excludes the right units and cells; zero-length aim falls back to the caster's facing.
  - Run the new test file.
  - Done: `hitboxes/OrientedRectHitbox.ts` — `OrientedRectHitboxSpec` + factory (optional `numTargets`, default 99, and `style: Partial<TelegraphStyle>`, default `danger`); `getRect` (centre, unit axes, half extents, corners), `resolveCells` (tile centres inside, row-major, not bounds-filtered), `resolveTargets` (no team filter, caster dropped) and `resolveHits` (enemies, `isUntargetable` skipped, `filterCombatHitTargets`, nearest-centre first, lock-on moved to front) all use body-circle overlap; preview draws a faint aim line + filled rect without `clear()`, invalid preview greys it with a centre cross. Pure helpers `orientedRectAt` / `pointInOrientedRect` / `unitOverlapsOrientedRect` / `cellsInOrientedRect` exported via `hitboxes/index.ts`. Surprise: **units have no stored facing**, so the zero-aim fallback reads an optional `facing` (radians, the deployables' name) on the caster-like origin, else +x; the centre stays on the caster. Step 12 notes: pass `style: themedTelegraphStyle('1503')` for a Tidewater telegraph; set the select's `numTargets: 0` if the pick must stay a ground pixel rather than lock on; the ground hazard should use `resolveCells(caster, pickedPixel)`. Documented in `hitboxes/SKILL.md`. Verified: lint (only the known warning), `OrientedRectHitbox.test.ts` 12/12, `npx tsc --noEmit` clean.

### Step 10: Stunning, team-aware ground hazard

Files: `game/terrainEffects/terrainEffectDefs.ts`, `game/terrainEffects/standingDamage.ts`, `game/terrainEffects/standingDamage.test.ts`, the ground-effect record type (wherever `GroundPatchBehaviour` records live), `game/GameRenderer/terrainEffectDefs.ts`.

- [x] Extend `StandingDamageDef`:
  - `hurts` also accepts `'enemiesOfOwner'`. The record must carry its owner's team; add `ownerTeamId` to the record if it is not there, and serialize it.
  - Optional `stunSec`: each pulse also stuns through `tryApplyHardCcStun`, so boss CC armour applies.
  - Optional `damageFromRecord`: the record's `params.damage` wins over the def's damage, so an ability can scale it.
  - Pulses still land on world-clock boundaries; keep the rule stateless.
  - Done: `hurts: StandingDamageTargets` (`CreatureFilter | 'enemiesOfOwner'`), `stunSec?`, `damageFromRecord?` and `STANDING_DAMAGE_PARAM = 'damage'` in `terrainEffectDefs.ts`. No new record field: `TerrainEffectRecord.teamId` already exists, is serialized by `toEffectsJSON` and set by `placeJitteredGroundThorns` (so `GroundPatchBehaviour` cells carry it); `'enemiesOfOwner'` = `areEnemies(record.teamId, unit.teamId)`, an ownerless record hurts nobody. `standingDamage.ts` exports `unitIsHurtByStandingDamage` / `getStandingDamageAmount`; after the damage a `stunSec` pulse calls `tryApplyHardCcStun` and, when it lands, `engine.interruptUnitAndRefundAbilities?.(unit)` (Stagger's interrupt path). `StandingDamageEngine` gained `roundNumber` + that optional hook; `EngineContext` already satisfies it, so `UnitManager` is unchanged. Still stateless world-clock pulses. Note: each re-stun pushes a new `StunnedBuff` (engine-wide `addBuff` behaviour, same as other stun sources).
- [x] Register `frozen_field` (ground layer, `standingDamage: { hurts: 'enemiesOfOwner', damage: 4, intervalSec: 0.5, stunSec: 0.6 }`) and its visual entry (navy frost fill, seafoam edge, faint flake texture).
  - Tests: an enemy in the cell is hurt and stunned each pulse; the owner and allies are not; stun is refused for a boss when its CC armour applies; checkpoint round-trip keeps the owner team.
  - Run `standingDamage.test.ts`.
  - Done: `FROZEN_FIELD_EFFECT_TYPE` + `FROZEN_FIELD_DAMAGE` (4) / `_INTERVAL_SEC` (0.5) / `_STUN_SEC` (0.6) registered on the ground layer with `damageFromRecord: true` (Step 12 can store a modified `params.damage`; 4 is the fallback). Visual (`GameRenderer/terrainEffectDefs.ts`): `frostSheetSvg` built from `WATER_THEME` hexes (navy-to-font gradient sheet, inset seafoam rim, faint white cracks, four six-armed flakes), `lifetimeFade` to 0.6 alpha and a 0.3 s exit. Outside Touches: new generic **`TerrainEffectVisualDef.footprint: 'lowerHalf' | 'fullCell'`**, read in `TerrainEffectRenderer.createEffectVisual`, so the ice covers whole cells and joins into one field (thorns/miasma unchanged). `standingDamage.test.ts` +9 tests (def shape, enemy hurt + stunned + interrupted on each of 3 pulses, owner/ally/nature untouched, ownerless hurts nobody, record damage override, boss armour absorbs the stun but takes damage, stops on expiry, cell edge, checkpoint round trip keeps `teamId`). Verified: lint (only the known warning), `standingDamage.test.ts` 12/12, `thorns.test.ts` + `terrainClearing.test.ts` green, `npx tsc --noEmit` clean. Visual not yet seen in a live battle (Step 14). Step 12 note: place cells with `teamId: caster.teamId` (GroundPatch/`placeJitteredGroundThorns` already does); `placeJitteredGroundThorns` already takes `cells` (feed it `resolveCells`), but `GroundPatchConfig` does not expose them yet; use `jitterSec: 0` for a crisp 3 s field.

### Step 11: Water spell circle

Files: `game/spellCircles/spellCircles.ts`, `game/effect_defs/spellCircleEffects.ts` (or a new `game/effect_defs/waterEffects.ts` like `commandEffects.ts`), `game/spellCircles/spellCircles.test.ts`.

- [x] Register `SPELL_CIRCLE_STYLE_WATER = 'water'`: a navy ring with rotating seafoam rune dashes. Ice shards and droplets come off its rim (Step 2 shapes; droplets use `gravityPx`), at roughly the studio's Ring counts.
  - Test: the style is registered and its default data names both particle shapes. Run `spellCircles.test.ts`.
  - Done: built as engine, not a Water painter: new data-driven **`SpellCircleMoteRing`** (`game/effect_defs/moteRingSpellCircle.ts`, registered in `effect_defs/index.ts`): ring + turning band of short/long rune dashes (the studio's "2 5 7 5"), rim motes from style data `rimMotes: { spec: MoteSpec, count }[]` (each kind evenly spaced and interleaved, stable jitter and join order; slots cached per `rimMotes` array); motes join over the charge, at the cast the ring flares and the motes burst outward and fade. New pure helper **`loopingMotePose(spec, seed, seconds)`** in `game/effects/motes.ts` (outside Touches) loops an inline mote exactly as `createMote` moves one (gravity arc, drift, spin, flicker). `WATER_STYLE` in `spellCircles.ts`: radius 1.2 cells, linger 0.25, ring = theme primary, runes = secondary, 0.25 turns/s (studio's 4 s), 10 dash pairs, `MOTE_PRESETS.iceShards('water')` x14 + `droplets('water')` x16 (a little under the studio's 16/18 since they share a rim). Docs: `game/effects/AGENTS.md`, `card_defs/SKILL.md` style list, `15_water/AGENTS.md`. Tests (+6 in `spellCircles.test.ts`): registered with Tidewater colours, data names shard + gravity droplet, slots interleave in every quarter and join in 0.05-0.6 of the charge, painter draws arcs/polys/ellipses mid-charge, `loopingMotePose` droplet rises then lands below anchor (deterministic per seed), shard climbs and tumbles. Verified: lint (only the known warning), `spellCircles.test.ts` 17/17 + `motes.test.ts` 19/19, `npx tsc --noEmit` clean. Not yet seen in a live battle (Step 14). Step 12: `CastBehaviours.SpellCircle({ style: SPELL_CIRCLE_STYLE_WATER })` on the 0-0.8 windup.

### Step 12: Frozen Field (1503)

Files: new `card_defs/15_water/1503_FrozenField/1503Ability.ts`, `1503Ability.test.ts`; registry; `card_defs/15_water/AGENTS.md`.

- [x] Timings from the Decisions section:
  - `windup` 0-0.8 with `SpellCircleBehaviour` (water style) at the caster.
  - `select` interval 0.8-1.0 with `pickAtEntry: true`, `orientedRectAtPointHitbox({ length: 160, width: 120, maxRange: 140 })`, `allowMiss: true`.
  - `impact` at 1.0; cooldown to 1.8.
  - Done: `card_defs/15_water/1503_FrozenField/1503Ability.ts` (`FROZEN_FIELD_TIMINGS`): `windup` 0-0.8 (`SpellCircle` water), `select` 0.8-1.0 (`FROZEN_FIELD_HITBOX`, `filter: 'enemy'`, `allowMiss`, `pickAtEntry`, `strictHitbox`), `impact` 1.0-1.1 (`doNotRefund`, so a cut before the hit refunds the 16 Water and the use), `cooldown` to 1.8. Telegraph: `themedTelegraphStyle('1503')` widths with the seafoam secondary as colour (the navy primary barely reads on dark ground; the studio marks the pick in seafoam). Every consumer reads the trailing aim pixel (`frozenFieldAim` = `findMeleeAimPixelInTargets`), so a lock-on unit in `targets[0]` never moves the field.
- [x] Intro (0.8-1.0): spawn the "ice rising" effect across the picked rectangle. It is a new effect type that scales spikes up out of the ground, ported from the studio's `wfx-rise`. Render-only; the field's real geometry comes from the hitbox.
  - Done: new generic **`SpikesRise`** effect (`game/effects/spikesRise.ts`: `createSpikesRise({ rect: OrientedRect, seconds, style: SpikesRiseStyle, seed })`, pure `spikesRiseLayout` jittered-grid placement / `spikeRiseScale` (0.15 -> 1.12 overshoot -> 1, as `wfx-rise`) / `spikesRiseAlpha`; `timeDomain: 'world'` so it holds at a pause plane) with painter `game/effect_defs/spikesRiseEffects.ts` (upright spikes, shadow, lit right facet), registered in `effect_defs/index.ts`. Frozen Field spawns it at the select's start across `FROZEN_FIELD_HITBOX.getRect(caster, aim)`: seafoam body, theme-shade edge, white facet, 1.2 s life, all up within the 0.2 s before the hit, fading once the field has landed. Documented in `game/effects/AGENTS.md`.
- [x] Impact: 10 damage plus a 0.6 s stun to enemies in the rectangle. Then place `frozen_field` ground effects on every cell whose centre is inside it, for 3 s, using `GroundPatchBehaviour` or a sibling that takes the hitbox's cells. The hazard does the 4-per-0.5 s damage and re-stun.
  - Done: impact = an `Instant` that resolves `FROZEN_FIELD_HITBOX.resolveHits` at the aim and runs the shared `landAreaStrike` (blockable 10 damage, then `tryApplyHardCcStun` 0.6 s through the armour gate + interrupt), with `MOTE_PRESETS.iceShards` chips (`moteBurst`, seeded `moteRng`) on each landed hit. Then `GroundPatch` lays `frozen_field` for 3 s: **`GroundPatchConfig` gained a generic `cells?: (ctx) => TileCoord[]`** (passed straight to `placeJitteredGroundThorns`), fed `FROZEN_FIELD_HITBOX.resolveCells(caster, aim)`, `jitterSec: 0`, centre = rect centre, radius = half diagonal (it only shapes the zero jitter), `params.damage` = `getModifiedAbilityDamage(caster, 4)` so damage modifiers scale the pulses like the impact. Cells carry the caster's `teamId`. Note: hazard pulses land on world-clock 0.5 s boundaries (Step 10's stateless rule), so a cast whose impact tick happens to cross a boundary can take one extra pulse on the impact tick; the test starts off-boundary for an exact count.
- [x] Cost 16 Water (`FROZEN_FIELD_WATER_COST`); 2 uses, as Blood Burst.
  - `swapConfig` `whileCastable` with `replacesAbilityId: '0302'`.
  - `abilityModes` with a Blood Burst mode: `modeAbilityIds: { blood: '0302' }`, labels and descriptions, so the player can cast Blood Burst from the slot even while Frozen Field is affordable.
  - Card icon from `FrozenFieldIcon`.
  - Tests: the target is picked at 0.8 s, not up front; enemies in the rectangle take 10, are stunned, and keep taking 4 and being re-stunned until 4.0 s; an enemy outside is untouched; the Blood Burst mode casts Burst.
  - Run `1503Ability.test.ts`.
  - Done: `resourceCost` 16 Water, `maxUses` `BURST_MAX_USES` (2) with a full round refill, `swapConfig` `whileCastable` -> `0302`, `abilityModes` `frozen` (default) / `blood` with `modeAbilityIds: { blood: '0302' }`, labels and descriptions. Icon `1503_FrozenField/frozenField.svg` ports `FrozenFieldIcon` (theme hexes + white only; `svgPalette.test.ts` green, no allow-list entry). Tooltip: two mechanic lines + the swap line, `flavorText` set. Registered in `AbilityRegistry.ts` and `card_defs/index.ts`. Docs: `15_water/AGENTS.md` row, `03_blood_mage/AGENTS.md` Burst row, `abilities/AGENTS.md` (GroundPatch `cells`). `1503Ability.test.ts` (10 tests): timeline + water circle; select is `pickAtEntry` with the rect hitbox and `findPreviewDeferredSelectLabel` returns null (not picked up front); real tiny engine: no damage before 1.0, inside dummy takes 10 + one stun at 1.0, then exactly 6 x 4 damage and 6 more stuns until 4.0 and nothing after (ice gone), outside dummy and caster untouched, 16 Water spent; SpikesRise spawned at 0.8 at the range-clamped centre (aim at 600 -> centre at +140) and ice on exactly `resolveCells` (not past the far edge); Blood Burst mode resolves to `0302` and casting it pays Burst's HP and no Water; slot held at 16 Water / Burst at 15; registration; SpikesRise layout inside the rotated rect, deterministic per seed, overshoot/fade curves, painter draws 2 polys per spike. Removing the ground patch fails 2 of them. Verified: lint (only the known warning), `1503Ability.test.ts` 10/10, `svgPalette.test.ts` 30/30, `spawnLeapGroundPatch.test.ts` 10/10, `AbilityRegistry.test.ts`, `previewCanonEquivalence.test.ts` + `selectTargetLookahead.test.ts` green; `npx tsc --noEmit` clean. Not yet seen in a live battle (Step 14). Step 13 note: grant `1503` via a node requiring `blood_mage_burst`; the swap can only bring it into Burst's slot once the unit has a Water resource attached (it cannot pay otherwise).

### Step 13: Research nodes and the Water resource on the unit

Files: `app/js/researchTrees/trees/blood_mage.ts`, the Blood Mage tree test (or `researchTrees/evaluator.test.ts`), `card_defs/03_blood_mage/AGENTS.md`.

- [x] Add three nodes, placed beside the cards they upgrade:
  - **Ice Claws** requires `blood_mage_claws`;
  - **Ice Shards** requires `blood_mage_core`;
  - **Frozen Field** requires `blood_mage_burst`.
  - Effects: `addCard` of the ice card and `grantMissionStartResource` `water` 0.
  - Confirm a 0 grant still attaches the resource. If it does not, make attachment explicit with a generic effect (e.g. `attachResource`), not a Water special case.
  - Costs in line with the neighbouring nodes.
  - Done: a 0 grant does **not** attach (`applyMissionStartResourcesFromResearch` only `add`s to a resource the unit already has), so there is a new generic **`ResearchEffect` `{ type: 'attachResource'; resourceId }`** (`researchTrees/types.ts`), read by `getAttachedResourcesFromResearch` (`evaluator.ts`, deduped, deterministic node order) and applied by new exported `attachResourcesFromResearch` in `BaseMissionDef.ts` (after equipment resources, before mission-start grants; skips a resource the unit already has); the tiny-battle harness `placePlayerFromLoadout` calls the same helper. The nodes use `attachResource` `water` and no `grantMissionStartResource` (it would be a no-op). Nodes in `trees/blood_mage.ts`: `blood_mage_ice_claws` (tier 11, 12/8/2, at (660, 150) right of Bloody Claws, adds `1501`), `blood_mage_ice_shards` (tier 11, 13/7/2, at (180, 430) under the Core, adds `1502`), `blood_mage_frozen_field` (tier 12, 13/8/3, at (660, 290) right of Burst, adds `1503`); each has the matching `prereqNodeIds` + mirrored `anyResearched` requirement; costs pass `researchCosts.test.ts` (floors, curve, attunement/vigor lean). Descriptions/flavour per STYLE.md's research-node rules. Also documented in the **research-trees** skill (pre-battle application).
- [x] Note the overlap in the Blood Mage `AGENTS.md`.
  - Test: researching each node adds its card and the unit starts with a Water resource. Run that test file.
  - Done: "Water overlap" paragraph in `card_defs/03_blood_mage/AGENTS.md` (the three nodes, their prereqs, `attachResource`, the `whileCastable` swap). New `researchTrees/bloodMageWaterOverlap.test.ts` (13 tests): each node's prereq + availability, each adds its card beside its blood card (`resolveCharacterLoadout`), Water attached once and no grant needed, a real `DARK_AWAKENING.initializeGameState` player with each node has the card and exactly one Water at 0 (none without the nodes), the harness attaches it too, no tree-view overlap. Verified: lint (only the known warning); `npx tsc --noEmit` clean; the new file plus `researchCosts`, `researchTreeChrome`, `coreResearchUnlocks`, `treeAbilities`, `evaluator.merge`, `researchEquipmentInvariants`, `researchTreeLayout`, `missionRewardRequirement`, `researchTags`, `draftNodes`, `disabledResearchNodes`, `passiveSpawnEffects`, `campsite` and all `03_blood_mage` card tests green (140 tests). Step 14 note: scenarios can grant Water via `placePlayerFromLoadout` with these nodes, or attach `new Water()` directly; the unit starts at 0 Water, so a swap scenario must stand it by water (or `add` Water) first.

### Step 14: AbilityTest scenarios and final verification

Files: new `testing/scenarios/abilities/waterScenarios.ts`, `testing/scenarios/registry.ts`.

- [x] Scenarios, kept high level (per **ability-tests**):
  - **Water siphon:** a caster beside deep water gains Water and the tile drops a level.
  - **Ice Claws swap:** Ice Claws casts with 3 Water, then Bloody Claws is in the slot once Water runs out.
  - **Ice Shards pierce:** two shards each pass one enemy and stop on the next.
  - **Frozen Field:** enemies in the field stay stunned and take damage until the field ends.
  - Make sure `inferScenarioAbilityId` maps each to its card.
  - Done: `testing/scenarios/abilities/waterScenarios.ts` (`water_siphon_e2e`, `ice_claws_swap_e2e`, `ice_shards_pierce_e2e`, `frozen_field_e2e`), registered in `registry.ts`. `inferScenarioAbilityId` maps the three cards to `1501` / `1502` / `1503`, and those ids are on the Blood Mage sidebar group. The siphon has no card, so it stays unmapped and is run headlessly only.
- [x] Run the four new scenarios headlessly and the scenarios for Bloody Claws, Blood Shard and Burst (regressions).
  - Done: `water.scenarios.test.ts` — the four new scenarios plus Burst (it had no other headless wiring). Bloody Claws (3) and Blood Shard passed in `SimulationRunner.test.ts`.
- [ ] Run `npm run test` once and `npx tsc --noEmit`, and fix any failures the plan caused.
- [ ] Browser check (dev server, a tiny battle by water):
  - the Water bar fills with the moving surface and its tooltip shows the three lines;
  - tiles visibly drop a level;
  - the three ice cards swap in and out of their slots;
  - Frozen Field shows its windup circle, the rising ice at 0.8 s, and the stun stars while pulsing.
  - Report anything that could not be checked.
