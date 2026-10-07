# Plan: Deployables — one query/contract for things abilities leave on the map

> **IMPLEMENTED 2026-10-06** (steps 1-9 and automated verification of step 10). Deployable contract/registry with providers for light sources, owned ground terrain effects (bramble) and ownerless special tiles; owner/team synced via checkpoint JSON and fingerprint; Devour Light and Lay Hands now use `findDeployables` (team match required, ownerless never matches). Open: manual browser checklist in Step 10. Follow-ups: `bright` keyword and Shining Block (0110) lights are still ownerless; Torch-effect conversion only carries an owner if effectData has one.

## Context

Abilities increasingly interact with objects that other abilities left behind: Gather Light's Devour Light eats light emitters, Lay Hands (0806) detonates the nearest one, Bramble Patch (0706) leaves bramble. Today these live in four parallel stores with no shared concept:

| Store | Holds | Owner info |
|-------|-------|------------|
| `LightSourceManager` (`LightSource`) | Throw Torch, `Bright` keyword lights, Gather Light bright light, lanternite/nest pulses, world-modifier lights | none |
| `SpecialTileManager` (`SpecialTile`) | Campfires, crystals (story objects) with `emitsLight` | none |
| `TerrainLayerManager` (`TerrainEffectRecord`) | Bramble patch (`bramble_slow`), thorns, created rock | `ownerUnitId` / `ownerAbilityId` only |
| Units | Pets, nests, lanternites | n/a (out of scope) |

`findDevourableLightSources` + `game/lightSources/lightEmitters.ts` only see `LightSourceManager`, so "light emitter" is a half-definition.

### Design (decided with the user)

- **Deployable** = *something that exists on the map* that abilities can find and interact with. It may or may not be a light emitter.
- **Thin layer, not a migration.** A `Deployable` is a lightweight *view* produced by providers registered by each existing store. Stores keep their own data, rendering and serialization; they gain **owner + team** fields. A `DeployableRegistry` owns the generic query and the interaction verb.
- **Owner + team are tracked** on every deployable: `ownerUnitId`, `ownerAbilityId`, `teamId`.
- **Story objects are protected by ownership, not by a flag.** Campfires and crystals are surfaced as deployables with **no owner / no team**. `findDeployables` takes the `castingTeam` and **only returns deployables whose `teamId` equals it**, so ownerless things can never be consumed by Lay Hands / Devour Light / future abilities. No `consumable` flag.
- **Replace** `LightSourceManager.findDevourableLightSources` and `game/lightSources/lightEmitters.ts` with `findDeployables`. Light emitters become the tag `lightEmitter`; bramble patches the tag `bramble`.
- **Synchronized:** owner/team ride in the existing checkpoint JSON of each store and are mixed into the determinism fingerprint. Missing fields in old checkpoints deserialize as "ownerless".
- **Interaction verb:** only `consume` is implemented (the only verb with a user today): light source → `active = false`; terrain effect → `terrainLayers.remove(id)`. `detonate` stays ability-specific (the ability reads position/radius from the deployable, then calls `consume`). `damage` is deferred until a deployable needs HP.

### Behaviour changes to be aware of

- Devour Light and Lay Hands can now only consume lights **owned by the caster's team**. Enemy lanternite pulse lights, world-modifier lights, campfires and crystals are no longer consumable (they were, for the first two, before).
- Lights/bramble placed by the player's own abilities (Throw Torch, Bright, Gather Light's bright light, Bramble Patch) are consumable by the player's team.

### Query shape

```ts
findDeployables({
  castingTeam: TeamId,            // required; only deployables with teamId === castingTeam match
  near: { x, y },                 // sort origin (nearest-first, stable id tie-break)
  halfExtent?: number,            // Chebyshev square around `near` (5x5 tiles = 2 * CELL_SIZE)
  radius?: number,                // optional circular reach
  tags?: DeployableTag[],         // all must be present, e.g. ['lightEmitter']
  includeInactive?: boolean,      // default false
}): Deployable[]
```

`Deployable` view: `{ id, kind: 'lightSource' | 'terrainEffect' | 'specialTile', x, y, active, ownerUnitId?, ownerAbilityId?, teamId?, tags: readonly DeployableTag[] }`. A `LightSource` is tagged `lightEmitter` only while `active && lightAmount > 0 && overlapMethod?.method !== 'base'` (the old devourable rule, now defined once).

---

## Agent Instructions

This plan is executed by **`/jp-implement-plan`**: the **invoking agent is the sole orchestrator** — it spawns one worker per step **synchronously** (never background), waits for each to finish, then reports plan completion to the user. Each worker implements exactly one step, checks its items off with a one-line summary, and **stops without spawning the next agent**. See `.claude/skills/jp-implement-plan/SKILL.md` (do not restate its workflow here).

Rules for this plan:

- Read every listed file before editing. Do not guess types or signatures.
- Relevant skills: `working-on-minion-battles`, `game-engine`, `game-sync-data-flow`, `creating-an-ability`, `editing-card-behaviour`, `ability-tests`, `scoped-testing`, `working-with-skills`, `writing-nested-agents-files`.
- **Per step verification is cheap:** `npm run lint` (and `npx tsc --noEmit` when the step crosses interface boundaries) plus **only the test files the step touches or creates** (`npx vitest run path/to/File.test.ts`). Never run a full suite, a whole directory, or any AbilityTest/E2E scenario inside a regular step — that is the final step's job.
- After verification, change `- [ ]` to `- [x]` and add a one-line summary of what changed.
- Keep changes minimal; do not refactor surrounding code. `Unit` and special-tile *gameplay* are out of scope except where a step says so.
- Determinism: never use `Math.random` or module counters for deployable ids; reuse each store's existing id allocation.

---

## Steps

### Step 1 — Deployable contract and registry (pure, no engine wiring)

Files: `app/js/games/minion_battles/game/deployables/Deployable.ts` (new), `.../DeployableRegistry.ts` (new), `.../DeployableRegistry.test.ts` (new).

- [x] Create `Deployable.ts`: `DeployableKind`, `DeployableTag` (`'lightEmitter' | 'bramble'`), the `Deployable` view interface, `DeployableQuery`, and the exported constant `REACH_5X5_HALF_EXTENT = 2 * CELL_SIZE` (the 5×5-tile square around the caster; this replaces `LIGHT_EMITTER_REACH_HALF_EXTENT`).
  - Done: Deployable.ts: kinds, tags, Deployable view, DeployableQuery, REACH_5X5_HALF_EXTENT.
- [x] Create `DeployableRegistry.ts`: `DeployableProvider { listDeployables(): Deployable[]; consume(id: string): boolean }`; `DeployableRegistry` with `registerProvider(provider)`, `findDeployables(query)` and `consumeDeployable(deployable)` (routes to the provider that listed it via `kind`).
  - Done: DeployableRegistry.ts: provider interface, findDeployables (team match, ownerless excluded, tags, reach, sort), consumeDeployable.
  - `findDeployables` rules: skip inactive unless `includeInactive`; require **`teamId === query.castingTeam`** (ownerless entries never match); require all `tags`; apply `halfExtent` (Chebyshev) and/or `radius`; sort nearest-first with stable id tie-break.
- [x] Write `DeployableRegistry.test.ts` with fake providers: team filter (own team matches, other team excluded, **ownerless excluded**), tag filter, 5×5 edge inclusion/exclusion, nearest-first + id tie-break, inactive skipped, `consumeDeployable` routes to the right provider and returns false for unknown ids.
  - Done: DeployableRegistry.test.ts: 7 tests with fake providers.
- [x] Verify: `npx vitest run app/js/games/minion_battles/game/deployables/DeployableRegistry.test.ts`, `npm run lint`.
  - Done: Verified: 7/7 tests, lint 0 errors, tsc clean.

### Step 2 — Owner/team on `LightSource` + light-source provider

Files: `game/lightSources/LightSource.ts`, `game/lightSources/LightSourceManager.ts`, `game/lightSources/LightSource.determinism.test.ts` (extend) or a new `LightSource.deployable.test.ts`.

- [x] Add optional `ownerUnitId`, `ownerAbilityId`, `teamId` to the `LightSource` config/fields, to `toJSON` (omit when undefined) and `fromJSON` (missing → undefined = ownerless, so old checkpoints still load).
  - Done: LightSource gains optional ownerUnitId/ownerAbilityId/teamId, serialized only when set; missing = ownerless.
- [x] In `LightSourceManager`, add `listDeployables()` mapping each `LightSource` to a `Deployable` (`kind: 'lightSource'`, tag `lightEmitter` only when `active && lightAmount > 0 && overlapMethod?.method !== 'base'`) and `consume(id)` (set `active = false`; return whether found). Implement `DeployableProvider`.
  - Done: LightSourceManager implements DeployableProvider (lightEmitter tag rule defined once, consume deactivates).
- [x] Do **not** remove `findDevourableLightSources` yet (removed in Step 6).
  - Done: findDevourableLightSources left in place until Step 7.
- [x] Test: JSON round-trip keeps owner/team and omits them when absent; old JSON without the fields loads ownerless; tag rules (base-method and zero-light sources are not `lightEmitter`); `consume` deactivates.
  - Done: LightSource.deployable.test.ts: 4 tests.
- [x] Verify: the touched test file(s) only, `npx tsc --noEmit`, `npm run lint`.
  - Done: Verified: lint 0 errors, tsc clean, test passes.

### Step 3 — Owner/team on terrain effects + bramble provider

Files: `game/TerrainLayerManager.ts`, `game/TerrainLayerManager.test.ts` (extend), `abilities/targetHelpers.ts`, `abilities/passiveRunner.ts`, `card_defs/07_command_core/0706_BramblePatch/0706Ability.ts` (+ its test if it asserts the record shape).

- [x] Add optional `teamId` to `TerrainEffectRecord`; make sure `toEffectsJSON` / `fromJSON` (and any copy at `TerrainLayerManager.ts` ~L336) carry `ownerUnitId`, `ownerAbilityId` and `teamId`.
  - Done: TerrainEffectRecord gains teamId, round-tripped in toEffectsJSON; old data loads ownerless.
- [x] Add `listDeployables()` / `consume(id)` to `TerrainLayerManager` (`DeployableProvider`). Only **ground-layer effects with an `ownerUnitId`** are listed (`kind: 'terrainEffect'`). Position = circle `x,y`, or the cell center / mean of cell centers. Tag `bramble` when `effectType === 'bramble_slow'`. `consume(id)` calls `remove(id)`. Floor effects (rock) are not deployables in this plan.
  - Done: TerrainLayerManager implements DeployableProvider (owned ground effects only, bramble tag, consume removes).
- [x] Where effects are added with an owner (`targetHelpers.ts` ~L318, `passiveRunner.ts` ~L98, Bramble Patch `0706Ability.ts` ~L102), also set `teamId` from the owning unit's `teamId`. Grep `terrainLayers.add(` for any other owned call sites and cover them.
  - Done: teamId set in targetHelpers.placeJitteredGroundThorns (covers Bramble Patch) and passiveRunner; 0706Ability.ts needed no change.
- [x] Test: round-trip keeps `teamId`; a bramble effect owned by a player unit is listed with the `bramble` tag and the player's team; floor/rock and ownerless effects are not listed; `consume` removes the effect and frees its cells.
  - Done: 4 new tests in TerrainLayerManager.test.ts.
- [x] Verify: touched test files only, `npx tsc --noEmit`, `npm run lint`.
  - Done: Verified: lint, tsc, 10/10 tests.

### Step 4 — Special tiles as ownerless deployables (the "story object" guarantee)

Files: `game/managers/SpecialTileManager.ts`, a new `game/managers/SpecialTileManager.deployables.test.ts`.

- [x] Add `listDeployables()` to `SpecialTileManager`: every special tile with `emitsLight` is listed (`kind: 'specialTile'`, tag `lightEmitter`, position = tile center, **no `ownerUnitId`/`teamId`**). Add `consume(id)` that **always returns false** (story objects are never consumable; document that in a comment).
  - Done: SpecialTileManager implements DeployableProvider: emitsLight tiles listed ownerless, consume always false.
- [x] Test: a campfire and a crystal appear in an unfiltered view of the registry but are **never returned by `findDeployables` for any `castingTeam`**, and `consumeDeployable` on them returns false.
  - Done: SpecialTileManager.deployables.test.ts: 3 tests incl. never found for any team.
- [x] Verify: the new test file, `npx tsc --noEmit`, `npm run lint`.
  - Done: Verified: lint, tsc, 3/3 tests.

### Step 5 — Engine wiring, serialization sync and fingerprint

Files: `game/GameState.ts`, `game/GameEngine.ts`, `game/EngineContext.ts`, `abilities/AbilityEngineContext.ts`, `game/Fingerprint.ts` (only if the fingerprint helpers live there), `game/GameEngine.test.ts` or a new `game/deployables/deployables.sync.test.ts`.

- [x] Add `state.deployables: DeployableRegistry` in `GameState` and register the three providers (light source manager, terrain layers, special tile manager). Make sure the registration survives `GameEngine.fromJSON` / snapshot restore, which **replaces** `state.terrainLayers` and the light manager contents (`GameEngine.ts` ~L2129–2147): register providers lazily (resolve the manager at call time) or re-register after restore. Read `game-sync-data-flow` and `tickStateHistory.ts` before choosing.
  - Done: GameState.deployables registry with light/special-tile managers and a lazy terrainLayers provider (survives fromJSON).
- [x] Expose `findDeployables(query)` and `consumeDeployable(d)` on `GameEngine`, and add them to `EngineContext` and `AbilityEngineContext` so abilities and preview code (which receive the engine as `gameState`) can call them.
  - Done: GameEngine.findDeployables/consumeDeployable added; declared on EngineContext, optional on AbilityEngineContext.
- [x] Fingerprint: where `lightSources` and terrain effects are mixed into the runtime/state fingerprint (`GameEngine.ts` ~L1631 and `Fingerprint.ts`), include `ownerUnitId`, `ownerAbilityId`, `teamId` so a desync in ownership is detected.
  - Done: Fingerprint mixes owner/ability/team on addLightSource and an order-independent hash of owned lights/terrain each tick (unchanged when nothing owned).
- [x] Test (fast, no scenario runner): build a tiny engine, add an owned light source and an owned bramble effect, round-trip through `toJSON`/`fromJSON`, and assert `findDeployables` returns the same results and the fingerprints match before/after; also assert two engines that differ only in a light source's `teamId` produce different fingerprints.
  - Done: deployables.sync.test.ts: find/consume, fromJSON round trip with matching fingerprint, team change alters fingerprint.
- [x] Verify: the touched/new test file, `npx tsc --noEmit`, `npm run lint`.
  - Done: Verified: lint, tsc, 3/3 tests.

### Step 6 — Creators set owner/team

Files: `abilities/brightKeyword.ts`, `abilities/gatherLightHelpers.ts`, `game/effects/EffectManager.ts`, `game/lanternite/lanternitePulse.ts`, `worldModifiers/WorldModifierRuntime.ts`, the Throw Torch ability (`card_defs/utility/0601_ThrowTorch/`), and `storylines/BaseMissionDef.ts` (nest light registration, ~L580) only if it builds a `LightSource` itself.

- [x] Grep `new LightSource(` (non-test) and set ownership at each creation site: `spawnBrightLight` gets an optional `owner: { unitId, abilityId, teamId }` parameter (callers pass the casting unit); Gather Light's bright light and Throw Torch pass the caster; lanternite/nest pulses are owned by the lanternite/nest unit and its team.
  - Done: spawnBrightLight takes optional owner; Throw Torch, Gather Light, Light Blast and Throw Charged Rock pass the caster; lanternite/nest lights owned by their unit and team.
- [x] `WorldModifierRuntime` lights stay **ownerless on purpose** (story/environment) — add a one-line comment saying so. `EffectManager.ts:40` lights get the owner of the effect's creator when it has one, otherwise stay ownerless.
  - Done: WorldModifierRuntime commented ownerless; EffectManager copies owner/team from effectData when present.
- [x] Update only the existing tests whose assertions break because of the new optional parameter (grep for `spawnBrightLight(` / `brightKeyword` tests).
  - Done: No existing tests needed changes (new parameter optional).
- [x] Verify: the tests of the touched files only (find co-located `*.test.ts`), `npx tsc --noEmit`, `npm run lint`.
  - Done: Verified: lint, tsc, 31 tests across touched files.

### Step 7 — Migrate Devour Light + Lay Hands to `findDeployables`, delete the old query

Files: `abilities/keywords/devourLightKeyword.ts` (+ `.test.ts`), `card_defs/08_light_core/0806_LayHands/0806Ability.ts` (+ `0806Ability.test.ts`), `game/lightSources/LightSourceManager.ts`, `game/lightSources/lightEmitters.ts` (delete), `testing/scenarios/abilities/gatherLightScenario.ts` (comment only).

- [x] Devour Light: replace the `findReachableLightEmitters` call with `engine.findDeployables({ castingTeam: ctx.caster.teamId, near: caster, halfExtent: REACH_5X5_HALF_EXTENT, tags: ['lightEmitter'] })` and consume via `consumeDeployable`. Keep `DEVOUR_LIGHT_HALF_EXTENT` only if still imported; otherwise delete it.
  - Done: devourLightKeyword.ts now uses engine.findDeployables (team, 5x5, lightEmitter tag) + consumeDeployable; DEVOUR_LIGHT_HALF_EXTENT removed.
- [x] Lay Hands: `lockEmitter`, `detonateEmitter` and `drawLayHandsPreviewExtras` all use the same `findDeployables` call (first result = nearest; preview and cast must use identical arguments). Detonation consumes via `consumeDeployable` instead of setting `active = false`. The ability note stores the deployable `id` and frozen position as before.
  - Done: Lay Hands lock and preview share one findNearestEmitter helper; detonation re-resolves by id (same team/tag, no reach limit) and consumes via consumeDeployable; frozen-position fallback kept.
- [x] Delete `LightSourceManager.findDevourableLightSources` and `game/lightSources/lightEmitters.ts`; fix every import (`grep -rn "lightEmitters\|findDevourableLightSources"`).
  - Done: Deleted findDevourableLightSources and lightEmitters.ts; no remaining references.
- [x] Update `devourLightKeyword.test.ts` and `0806Ability.test.ts`: the old "shared emitter reach" tests move to the registry test (already covers 5×5 + ordering); add cases that **an enemy-team light and an ownerless light are not devoured/detonated** and an own-team light is.
  - Done: devourLightKeyword.test.ts and 0806Ability.test.ts rewritten around DeployableRegistry with enemy/ownerless cases.
- [x] Verify: `npx vitest run` on `devourLightKeyword.test.ts` and `0806Ability.test.ts`, `npx tsc --noEmit`, `npm run lint`.
  - Done: Verified: lint, tsc, 17 tests.

### Step 8 — Docs

Files: `game/deployables/AGENTS.md` (new), `game/lighting/AGENTS.md`, `abilities/keywords/AGENTS.md`, `card_defs/SKILL.md`.

- [x] Write `game/deployables/AGENTS.md` per `writing-nested-agents-files`: contract, providers, query rules (**team match required; ownerless = story = never returned**), the single `consume` verb, how to make a new thing a deployable (add owner/team to its store's JSON, implement `DeployableProvider`, register, add a tag), and the sync/fingerprint requirement.
  - Done: New game/deployables/AGENTS.md (contract, providers, team-match rule, consume verb, recipe, sync requirement); also linked from game/AGENTS.md.
- [x] Update `game/lighting/AGENTS.md` (light emitter = deployable tagged `lightEmitter`, campfires/crystals ownerless) and `abilities/keywords/AGENTS.md` (`devourLight` now uses `findDeployables`).
  - Done: Updated game/lighting/AGENTS.md and abilities/keywords/AGENTS.md.
- [x] Add a short "Interacting with deployables" note to `card_defs/SKILL.md` pointing at `findDeployables` and the preview/cast parity rule (Lay Hands is the reference).
  - Done: Added Interacting with deployables section to card_defs/SKILL.md.
- [x] Verify: markdown only — confirm file paths named in the docs exist.
  - Done: Verified paths exist.

### Step 9 — AbilityTest scenarios (write only; run in Step 10)

Files: `testing/scenarios/abilities/layHandsScenarios.ts`, `testing/scenarios/abilities/gatherLightScenario.ts`, a new `testing/scenarios/abilities/deployableScenarios.ts`, `testing/scenarios/registry.ts`, `testing/runner/SimulationRunner.test.ts`.

- [x] Keep scenarios high level and fast. Add (existing `lay_hands_*` and `gather_light_devour_*` scenarios must be updated so their seeded light sources carry the player's `teamId`, otherwise they no longer match):
  - Done: Existing lay_hands_* and gather_light_devour_* seeded lights now carry player owner/teamId; added the five new scenarios (story campfire ignored, enemy light ignored, own torch devoured only, bramble found+consumed, checkpoint round-trip).
  - `lay_hands_ignores_story_campfire`: a campfire special tile (ownerless) next to the player plus an enemy dummy by it — Lay Hands punches but the campfire stays lit and the dummy takes no blast.
  - `lay_hands_ignores_enemy_light`: an enemy-team light source in reach is not detonated.
  - `gather_light_devour_own_torch_only`: a player-owned torch is devoured (+1 Light) while an ownerless light beside it survives.
  - `deployable_bramble_found_and_consumed`: cast Bramble Patch, then query/consume it through `findDeployables` using the casting team (a small custom assertion in `assertPass`) — proves bramble is a first-class deployable and its cells are freed.
  - `deployable_checkpoint_roundtrip`: seed owned light + bramble, serialize/restore mid-battle, and assert the same deployables are found afterwards.
- [x] Register the new scenarios in `registry.ts` and add one `it(...)` per scenario in `SimulationRunner.test.ts` (follow `.claude/skills/ability-tests/SKILL.md`).
  - Done: Registered in registry.ts with one it() each in SimulationRunner.test.ts.
- [x] **Do not run the scenarios in this step.** Verify only `npx tsc --noEmit` and `npm run lint`.
  - Done: Verified: tsc clean, lint 0 errors; scenarios not run (Step 10).

### Step 10 — Final verification (the only broad run)

- [x] Run the new/changed AbilityTests once: `npx vitest run app/js/games/minion_battles/testing/runner/SimulationRunner.test.ts -t "Lay Hands|Gather Light|deployable|Bramble"`.
  - Done: SimulationRunner.test.ts: 96/96 pass, including all new deployable/Lay Hands/Gather Light scenarios.
- [x] Run the broad regression once: `npx vitest run --changed` against the plan's base ref (or `npm run ci` if the tree is large); fix any failure caused by this plan, and report unrelated pre-existing failures without fixing them.
  - Done: vitest --changed: 200 files / 1607 tests pass (1 skipped).
- [x] `npx tsc --noEmit` and `npm run lint` clean.
  - Done: tsc clean; lint 0 errors (15 pre-existing warnings).
- [ ] Manual browser checklist (Admin Ability Test page): (1) Lay Hands preview shows the ring/tether on a player-thrown torch but **not** on a campfire or enemy lanternite light; (2) Gather Light still devours a thrown torch; (3) Bramble Patch still slows/damages as before; (4) reload mid-battle (checkpoint) and confirm torches/bramble still behave the same.
- [x] Report plan completion to the user, including the two behaviour changes listed under Context.
  - Done: Completion reported to the user (manual browser checklist left open).
