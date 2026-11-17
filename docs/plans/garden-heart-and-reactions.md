# Garden Heart boss + Reactions — Implementation Plan

Goal: build the second Chapter 3 boss, **The Garden Heart** (`garden_heart`), and the **Reaction** mechanic it teaches: a Reflex resource that lets players pause a Reactable boss attack at its reaction frame and answer it, including the co-op claim flow. Source of truth for the design is the browser plan **0008 The Garden Heart: Reactions** (`docs/ideas/plans/0008_2026-11-15_garden-boss.md`, Ideas → Plans). Link to its sections rather than restating the design; this file records only the decisions that bind implementation.

The plan has three parts that can ship separately, in order: **A** engine pieces and the fight (Steps 1–8), **B** single-player Reactions (Steps 9–13), **C** co-op Reaction claims (Steps 14–17). Step 18 verifies everything.

## Plan-level decisions (locked)

**Fight** (browser plan 0008, "The fight")

- **Vocabulary:** Heart, Knot, Bud, Stem, Shell, Briar, Tangle. Use these names in code (`GardenHeart…`, `knot`, `bud`), not "leaf node" / "thick vines".
- **Shell:** a Knot with at least one living child takes 10 less per hit, never below 10, and a hit already under 10 is unchanged (25 → 15, 14 → 10, 6 → 6). The grey "resisted" number shows whenever the Shell took anything off.
- **Phases:** four, at 100/75/50/25%. Damage past a threshold is lost. On retreat the old tree dies and its Stems become Briar; the Heart resurfaces at an authored sprout point away from the party and old Briar.
- **Arena:** four segments, `62_47_queens_garden`, `63_47_conservatory`, `62_48_herb_garden`, `63_48_orchard`.
- **Pod Mortar seed:** destroyable, **20 base health scaled by player count** via `getEnemyHealthMultiplier` (`constants/enemyConstants.ts`), the same as other enemies. Killing it cancels the burst (no damage, a short fizzle).
- **Look:** Nightbloom palette (`#134e4a` / `#e9d5ff`), Seed pod Heart. Art references are the `gh-*` pieces in `app/js/components/minionBattlesHomePage/Ideas/fxArt/gardenHeartArt.tsx`.

**Reactions** (browser plan 0008, "Reactions in this fight")

- **Names:** Reaction (the mechanic), **Reflex** (the resource), **Reactable** (the ability flag), **reaction frame** (the moment). Never reuse "interrupt" (that is `ccInterrupt` / `interruptPolicy`).
- **Reflex:** a per-unit `Resource`, start 1, cap 1, recover 1 at each round start (`Resource.onRoundStart`, as `Charge` does).
- **Knowledge:** account knowledge key `Reactions`. Granted at the **start** of the Garden Heart fight. The engine gets a per-player "knows Reactions" flag at battle bootstrap, serialized so every client agrees.
- **Tutorial:** fires the first time a reaction frame pauses the local player, in any mission. Uses the existing tutorial system with a new trigger.
- **Who is paused:** at a reaction frame, every player unit that knows Reactions, has ≥ 1 Reflex and is inside that attack's telegraph. No active player.
- **Merge:** reaction-frame waiters are added to the tick's deferred pause (`requestMidCastOrderPause` already merges), so simultaneous frames and any other pause on that tick form one plane.
- **Acting:** pass (`wait`) is free. Any ability (no tag filter in v1) spends 1 Reflex, cancels whatever the unit was casting (refund rules as `applyConditionalCancelDecision`), uses its normal cooldown, and plays out in normal time. The boss's attack keeps running.
- **Garden attacks that are Reactable:** Pod Mortar burst (frame at the start of the 1.5 s red telegraph) and the resprout eruption. Crystal Laser (`1490`) also gets the flag; it stays inert for parties without the knowledge.

**Co-op claims** (browser plan 0008, "Co-operation" and "Co-op claim: settled")

- **Gate:** one rule, `canClaimReaction(engine, unit)`, true only while a Reactable attack is in progress (start of its cast to its hit) and the unit knows Reactions and has ≥ 1 Reflex. Later this widens to "any pause plane" (Ideas → Systems, "Reflex as an extra turn"), so nothing else may hard-code the in-progress check.
- **Flow:** claimant broadcasts a claim request over the WebRTC mesh (to host and peers) carrying `planeId` and `atTick`. Peers mark it pending. The host validates, records it through a **dedicated claim endpoint** (not `BattleNet.submitOrder`), and only then sends accepted/rejected with the same `planeId`/`atTick`. A record that cannot be written is a rejection.
- **Several claimants:** every claim that reaches the host before the plane closes is accepted; the plane belongs to all of them.
- **Host sequencing:** the host never closes a plane while a claim request for it is undecided, so "accepted, then resumed anyway" cannot happen.
- **Stopping:** a claimant gives up on a rejection, or when the plane with the matching `planeId` closes. Peers that played ahead past the plane rewind to it if the claim is accepted.
- **Plane identity:** every pause plane gets a deterministic `planeId` (derived from `atTick` plus a per-battle counter), serialized in `WaitingForOrders`.
- **Mesh down:** the claim button is disabled while the mesh link to the host is down.
- **Not now:** no pause-plane timeout (Ideas → Systems).
- **Endpoint shape:** decided in Step 15 on architecture grounds, with this rule: the accepted claim must live in the stream the engine replays (so replays and checkpoint fingerprints include it), never in a separate claims store.

## Key existing code index

Paths are under `app/js/games/minion_battles/` unless noted.

| Concern | Location |
|---|---|
| Mid-cast pause and its decision | `game/units/unitAbilityTick.ts` (conditionalCancel on interval exit), `game/managers/OrderManager.ts` (`applyConditionalCancelDecision`, `resolveConditionalCancelIfNeeded`) |
| Pause plane forming / merging / resuming | `game/orderPause/OrderPauseController.ts` (`requestMidCastOrderPause`, `commitDeferredOrderPauseAfterCompletedTick`, `tryResumeParallel`), `GameEngine.requestConditionalCancelPause` |
| Pause plane state | `game/types.ts` (`WaitingForOrders`, `OrderWaiter`, `normalizeWaitingForOrdersFromJSON`) |
| Timing intervals + timeline marks | `abilities/abilityTimings.ts` (`AbilityTimingInterval`, `ConditionalCancelDef`, cancel timeline marks) |
| Resources | `resources/Resource.ts` (`onRoundStart`), `resources/Charge.ts` (round recovery precedent), `resources/SuperBar.ts`, `resources/resourceIds.ts`, `resources/createResourceFromId.ts`, `resources/resourceDisplayDefs.ts` |
| Round start | `game/managers/UnitManager.ts` (`onRoundStart`), `game/roundProgressMilestones.ts` |
| Enemy health scaling | `constants/enemyConstants.ts` (`getEnemyHealthMultiplier`) |
| Phases | `game/units/components/phaseDef.ts` (`invulnerableSeconds`, `health_below_percent`) |
| Damage modifiers / armour precedent | `abilities/damageModifiers.ts`, `abilities/earthCoreArmour.ts` |
| Damage numbers | `game/effect_defs/textEffects.ts` (`damageNumberEffectDef`) |
| Thorns | `game/terrainEffects/thorns.ts`, `terrainEffectDefs.ts`, `DARK_THORN_EFFECT_TYPE`, `THORN_HITS_TAKEN_PARAM` |
| Nest spawner | `spawnerCore.ts`, `buildNestSpawnContext` |
| Boss setups / mission | `storylines/WorldOfDarkness/missions/castle/castleBosses.ts`, `.../missions/020_garden_heart.ts`, `defineCastleMission` |
| Knowledge + tutorials | `app/js/accountKnowledge.ts`, `backend/TutorialKnowledge.php`, `tutorials/` (see `tutorials/AGENTS.md`), `ui/pages/battlePhase/useBattleTutorial.ts` |
| Mission knowledge grants (completion precedent) | `phaseHandlers/battleVictory.ts`, `app/js/app/useMissionResultRecording.ts` |
| Battle bootstrap per-player data | `game/battleBootstrap.ts` (`darknessUpgradeBonuses` precedent) |
| Sync | `game/battlenet/BattleNet.ts`, `game/battlenet/types.ts` (`BattleSyncNudge`), `game/battlenet/hostPersistWindow.ts`, `app/js/WebRtcLobbyMesh.ts`, `backend/BattleStorage.php`, `backend/Http/` |
| Existing pause tests | `game/conditionalCancel.test.ts` |

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`; do not restate its workflow here). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never in the background), waits for each worker to finish, then moves to the next step, and finally reports plan completion to the user. Each worker implements **exactly one step**, checks off that step's checklist items with a one-line summary under each, and **stops without spawning the next agent**.

Every worker reads "Build the engine, not the feature" in `app/js/games/minion_battles/AGENTS.md` first. Each piece below is a reusable property or preset; nothing may special-case the Garden Heart in engine code.

Project skills relevant to this plan (workers invoke the ones matching their step):

- `working-on-minion-battles` — always.
- `game-engine`, `game-object-def-pattern` — any step adding serialized state (Steps 1, 3, 4, 6, 9–11, 14).
- `creating-an-ability`, `editing-card-behaviour`, `card_defs/SKILL.md` (AbilityRegistry) — Steps 6–7, 10.
- `abilities/AGENTS.md` (CastBehaviours) — Steps 6, 10.
- `crowdControl/AGENTS.md` — Step 10 (keep Reactions separate from CC interrupts).
- `terrain/AGENTS.md` — Step 4.
- `game/effects/AGENTS.md` — Steps 2, 3, 5.
- `working-on-ai-controllers` — Step 7.
- `missions`, `map-segments`, `map-design`, `modifying-spawn-definitions` — Step 8.
- `research-trees` (knowledge) and `tutorials/AGENTS.md` — Step 12.
- `editing-and-creating-components`, `components-for-the-ui`, `hud-effects` — Steps 13, 17.
- `game-sync-data-flow`, `webrtc-lobby-mesh` — Steps 14–17.
- `time-dilation` — Step 10 (Crystal Laser runs under Time Stop).
- `writing-style-abilities` (`.claude/skills/narrative/writing-style-abilities/STYLE.md`) — any player-facing text.
- `ability-tests` — Step 18 (scenarios).
- `scoped-testing` — per-step Vitest scope.

**Verification cadence:** per step, at most `npm run lint:changed`, `npx tsc --noEmit` when the step crosses an interface boundary, and only the specific test files the step touches or creates. No full-suite, whole-directory, or AbilityTest/E2E runs in regular steps; Step 18 runs the expensive things once. `tsc` currently has one pre-existing error in `abilities/archetypes/defineDirectionalShield.ts`; ignore it, add no new ones.

---

## Part A — Engine pieces and the fight

### Step 1 — Flat per-hit damage reduction

Files: `abilities/damageModifiers.ts` (or a new sibling `game/units/components/flatReduction.ts` if the modifier pipeline is the wrong layer), the unit damage entry point it feeds, new `game/flatDamageReduction.test.ts`.

- [ ] Add a generic per-hit flat reduction a unit can carry: `{ amount, floor, condition }`, where a hit under `floor` is unchanged and any other hit becomes `max(floor, hit - amount)`.
  - `condition` is a named predicate id resolved from a registry (serializable), not a closure on the unit.
- [ ] Report on the damage event how much was resisted, so feedback (Step 2) and logs can read it.
- [ ] Tests: 25 → 15, 14 → 10, 6 → 6 with `{ amount: 10, floor: 10 }`; condition false → full damage; it stacks after (not before) percentage modifiers, matching how `earthCoreArmour` orders itself (confirm and document the order).

### Step 2 — Resisted damage numbers

Files: `game/effect_defs/textEffects.ts`, the site that spawns damage numbers, a test next to existing text-effect tests (or new `game/effect_defs/textEffects.resisted.test.ts`).

- [ ] Add a "resisted" variant of `damageNumberEffectDef`: smaller, grey, slower drift. Spawned for any unit whenever the hit's resisted amount (Step 1) is > 0.
- [ ] Test that a resisted hit picks the variant and a normal hit does not.

### Step 3 — Node trees and Stem tethers

Files: new `game/units/components/nodeTree.ts` (parent/child links), new `game/tethers/` module (Stem bodies), registration in the unit component and serialization paths (`unitToJSON.ts` / `unitFromJSON.ts` or the component registry), new `game/nodeTree.test.ts`, new `game/tethers/tether.test.ts`.

- [ ] Node tree component: `parentId`, `childIds`, and hooks `onLastChildDied` and `onDeath`. Provide the named condition `hasLivingChildren` for Step 1's reduction.
- [ ] Tether body linking two units: blocks unit movement along its length (feed the occupancy / pathing layer, see `CellOccupancyManager.ts`), follows its ends, keeps a max length (the Bud's leash), lets projectiles pass while alive, and exposes a sway phase for the renderer.
  - On `onDeath` of the child end, the tether converts to terrain (Step 4) along the tiles it covers.
- [ ] Serialize both; round-trip test in each test file.
- [ ] Tests: killing a Bud fires its parent's `onLastChildDied` only when it was the last child; a living tether blocks a walk through it; a dead tether leaves Briar on its tiles.
- [ ] Renderer: draw tethers as a segmented vine with a travelling wave (art: `gh-opening`). Keep drawing in the existing GameRenderer layer conventions.

### Step 4 — Destructible and wearing terrain (Briar, Tangle)

Files: `terrain/` defs (see `terrain/AGENTS.md`), `game/terrainEffects/` (wear precedent in `thorns.ts`), new `game/terrainEffects/briar.test.ts`.

- [ ] Briar: terrain that blocks movement, has health, can be targeted/damaged, and becomes Tangle when destroyed.
- [ ] Tangle: a `variantOf` Thick Grass with a much lower speed multiplier and `blocksProjectiles`; each stopped projectile adds wear (`THORN_HITS_TAKEN_PARAM` pattern); after 3 it becomes Grass.
- [ ] Health and wear are serialized and in the checkpoint fingerprint.
- [ ] Tests: Briar destroyed → Tangle; three projectiles → Grass; movement cost on Tangle.

### Step 5 — Burrow and resprout phase transition preset

Files: `game/units/components/phaseDef.ts` (transition presets), the phase runner, new `game/phaseBurrow.test.ts`.

- [ ] Verify whether `invulnerableSeconds` also clamps the hit that crossed the threshold. If not, add a phase option that clamps that hit to the threshold, so a burst cannot skip a phase. Record the finding in a one-line comment on the option.
- [ ] Add a `burrow` transition preset: close (callback), sink with a ground mask, travel along a burrow trail to a chosen point, rise. Point choice is a pluggable rule; ship `farthestFromParty` filtered by a min distance from given exclusion zones.
- [ ] Tests: crossing 75% with a large hit leaves health at exactly 75%; the unit is untargetable during the transition and ends at a valid sprout point.

### Step 6 — Fused body (destructible seed)

Files: new `game/units/fusedBody.ts` (or a CastBehaviour if the abilities layer fits better; decide and note why), Pod Mortar seed unit def, new `game/fusedBody.test.ts`.

- [ ] Generic "fused body": a small unit with health, a fuse duration, an effect on expiry and an effect on death. Health uses `getEnemyHealthMultiplier(playerCount)`.
- [ ] The fuse exposes its telegraph window (last 1.5 s) so Step 10 can put a reaction frame on it.
- [ ] Tests: expiry triggers the burst; killing it first triggers the fizzle and no damage; health scales with player count.

### Step 7 — Five node kinds and the Garden Heart unit

Files: new `card_defs/` folder for the Garden Heart abilities (next free enemy number; register in `AbilityRegistry`), unit defs for Heart, Thornspitter, Pod Mortar, Mender Bloom, Hive Gourd, Creeper, AI in `game/units/unitAI/gardenHeart/`, tests next to each ability.

- [ ] Thornspitter: two quick fans of three slow thorn projectiles at a player.
- [ ] Pod Mortar: lobs a fused body (Step 6) with 5 s fuse, 1.5 s red telegraph.
- [ ] Mender Bloom: rooted area heal on nearby nodes, Shelled ones and the Heart included.
- [ ] Hive Gourd: capped spawner reusing `spawnerCore.ts` / `buildNestSpawnContext` with `swarmling` and `slime`.
- [ ] Creeper: runner vine that lays `dark_thorn` for 4–6 tiles, then retracts.
- [ ] Heart and Knots carry Step 1's reduction with condition `hasLivingChildren`; their Shell opens visually on `onLastChildDied`.
- [ ] Bud movement on a leash (tether max length), Knots stationary, Mender Bloom never moves.
- [ ] Phase tree layouts are data (one table per phase), matching browser plan 0008 "Node kinds": P1 one Thornspitter Bud; P2 Thornspitter + Pod Mortar; P3 Hive Gourd Knot → Thornspitter Bud, Creeper Knot → Mender Bloom Bud; P4 a mix with two extra Pod Mortar Buds on the Heart.
- [ ] Ability tests per kind (headless), one behaviour each, no number-tuning assertions.

### Step 8 — The Garden Heart mission

Files: `storylines/WorldOfDarkness/missions/020_garden_heart.ts`, `castle/castleBosses.ts`, the two new segments if they are not yet stitched, mission tests.

- [ ] Stitch the 2×2 arena (`62_47`, `63_47`, `62_48`, `63_48`) and author sprout points per segment.
- [ ] Replace the Alpha Wolf placeholder with a `boss: { kind: 'custom', ... }` Garden Heart setup: four phases at 75/50/25%, `burrow` transitions, old tree dies to Briar on retreat.
- [ ] Mission test: loads, spawns the Heart with the phase-1 tree, segment coords line up (see `map-segments`).

## Part B — Single-player Reactions

### Step 9 — Reflex resource

Files: new `resources/Reflex.ts`, `resources/resourceIds.ts`, `resources/createResourceFromId.ts`, `resources/resourceDisplayDefs.ts`, new `resources/Reflex.test.ts`.

- [ ] `Reflex` resource: start 1, max 1, `onRoundStart` recovers 1. Icon and colour per `resourceDisplayDefs`. Constants `REFLEX_START`, `REFLEX_MAX`, `REFLEX_PER_ROUND`.
- [ ] Every player unit gets Reflex in battles where its owner knows Reactions (Step 11 provides the flag; until then gate on a parameter so tests can set it).
- [ ] Tests: spend to 0, round start back to 1, never above max, serialization round-trip.

### Step 10 — Reactable flag, reaction frame and the pause

Files: `abilities/abilityTimings.ts` (`reactionFrame` on `AbilityTimingInterval`), `abilities/Ability.ts` (`reactable` flag), `game/units/unitAbilityTick.ts` (frame detection), `game/orderPause/OrderPauseController.ts` / `GameEngine.ts` (new `requestReactionPause`), `game/managers/OrderManager.ts` (reaction decision), `game/types.ts` (`WaitingForOrders.planeId`, per-waiter `reason`), new `game/reactionPause.test.ts`.

- [ ] `reactionFrame?: { at: 'start' | 'end' }` on an interval, valid only on abilities with `reactable: true`. The telegraph area the frame checks against comes from the interval's existing telegraph/hitbox data.
- [ ] When an enemy's interval reaches its frame, collect player units that know Reactions, have ≥ 1 Reflex and are inside the telegraph, and add each as a waiter via the same deferred-pause path as `requestMidCastOrderPause` (so it merges with any other pause that tick).
- [ ] Mark each such unit with a serialized `reactionPending` (ability id + caster id); the decision runs in `OrderManager` beside `applyConditionalCancelDecision`: `wait` clears it for free; any castable ability spends 1 Reflex, cancels the unit's current cast with the same refund rules, and queues normally.
- [ ] Add a deterministic `planeId` to `WaitingForOrders` (per-battle counter in engine state); include it and the waiters' `reactionPending` in serialization and the checkpoint fingerprint (`game/Fingerprint.ts`).
- [ ] Flag Crystal Laser (`1490`) Reactable with a frame at the start of its aim window; flag the Pod Mortar burst (fuse telegraph start) and the resprout eruption.
- [ ] Tests: two players, one in the telegraph, one out → one waiter; no knowledge or 0 Reflex → no pause; pass costs nothing; acting spends 1 and cancels the current cast; two Reactable frames on one tick → one plane; plane id is stable across a save/load.

### Step 11 — Per-player Reactions knowledge in the engine

Files: `game/battleBootstrap.ts`, the engine/player state that receives it, `storylines/BaseMissionDef.ts` or the mission-start path, `app/js/accountKnowledge.ts`, `backend/TutorialKnowledge.php` or the knowledge grant path, tests next to `battleBootstrap.test.ts`.

- [ ] Add knowledge key `Reactions` to `accountKnowledge.ts`.
- [ ] Pass each player's knowledge of `Reactions` into battle bootstrap (follow the `darknessUpgradeBonuses` precedent) and store it per player in serialized engine state. Step 9 and 10 read it from there.
- [ ] Add a mission-start knowledge grant (`startRewards.knowledgeKeys` or similar on the mission def, mirroring `completionRewards.knowledgeKeys`). The Garden Heart grants `Reactions`. The grant both persists to the account and sets the engine flag for this battle, so the mechanic works from this fight's first reaction frame. Investigate whether the server needs a new endpoint or can reuse the completion-grant path; pick the simplest that is idempotent.
- [ ] Tests: bootstrap with and without the key; a mission with a start grant sets the flag on every player.

### Step 12 — Reactions tutorial

Files: `tutorials/tutorialTypes.ts` (new trigger), `tutorials/tutorialLogic.ts`, `storylines/WorldOfDarkness/tutorials.ts` (or the storyline that owns Chapter 3), `storylines/tutorialRegistry.ts`, `ui/pages/battlePhase/useBattleTutorial.ts`, `tutorials/tutorialLogic.test.ts`.

- [ ] New trigger `reactionPause`: fires when the local player is a waiter with `reactionPending`, in any mission.
- [ ] Tutorial under knowledge key `Reactions`: point at the Reflex display, the reaction mark on the enemy timeline, and the ability bar; explain pass is free and acting costs 1 Reflex. Follow the writing style guide.
- [ ] Tests in `tutorialLogic.test.ts`: triggers on the first reaction pause, never again once done.

### Step 13 — Reactions UI

Files: the enemy battle timeline (where `TimelineCancelMark`s render), `abilities/abilityTimings.ts` (reaction marks), `ui/pages/battlePhase/BattleAbilityBar.tsx`, the player resource HUD, a unit test for the mark builder.

- [ ] Reaction frame mark on the enemy timeline (red danger bars), with a tooltip: "Reactable: spend 1 Reflex to act here."
- [ ] Reflex shown on the player's resource HUD.
- [ ] At a reaction pause, the ability bar shows a "Reaction" banner and the Reflex cost on each ability; Pass is labelled free.
- [ ] Test the mark builder (pure function), as the existing cancel marks are tested.

## Part C — Co-op Reaction claims

### Step 14 — Claim rule and claim state in the engine

Files: new `game/reactions/claimRule.ts` (`canClaimReaction`), `game/types.ts` (`WaitingForOrders.claims`), `game/orderPause/OrderPauseController.ts` (add a waiter to an open plane), `game/managers/OrderManager.ts`, new `game/reactions/claim.test.ts`.

- [ ] `canClaimReaction(engine, unit)`: unit knows Reactions, has ≥ 1 Reflex, is not already a waiter, and a Reactable attack is in progress (any enemy active ability with `reactable` between cast start and its hit). Document that this last clause is the one to widen for "Reflex as an extra turn".
- [ ] `applyReactionClaim(planeId, unitId)`: engine-side, deterministic; rejects if the plane id does not match the open plane or the rule fails; otherwise adds the unit as a waiter with `reactionPending` and records the claim on the plane. Multiple claims per plane allowed.
- [ ] Serialize claims; include them in the fingerprint.
- [ ] Tests: accept while a Reactable attack is in progress; reject without one; reject for a stale plane id; two claims on one plane both accepted; the plane resumes only when every waiter, claimants included, has an order.

### Step 15 — Claim endpoint and recorded stream

Files: `backend/Http/` (new handler), `backend/BattleStorage.php`, `game/battlenet/BattleNet.ts` (host-side caller), `game/BattleSession.ts`, PHP test under `backend/tests/`, `game/battlenet/BattleNet.test.ts`.

- [ ] Design the endpoint (write the decision as a short comment block at the top of the handler): the host posts `{ planeId, atTick, unitId, playerId }`; the server appends it to the stream the engine replays (the applied-orders stream or a sibling record type read by the same merge), bumps the orders revision, and returns success or failure. It is not `submitOrder` and has none of its client-side early returns.
- [ ] Clients apply recorded claims through `applyReactionClaim` when merging, at `atTick`, so replays and late joiners rebuild them.
- [ ] Host never replies accepted before the endpoint returns success; a failure is a rejection.
- [ ] Tests: PHP test for append and revision bump; BattleNet test that a recorded claim is applied on merge at the right tick.

### Step 16 — Claim messages over the mesh and host sequencing

Files: `game/battlenet/types.ts` (new message kinds), `app/js/WebRtcLobbyMesh.ts` (routing only), `game/battlenet/BattleNet.ts`, `game/orderPause/OrderPauseController.ts` (`tryResumeParallel` hold), `game/battlenet/BattleNet.test.ts`.

- [ ] Messages: `reaction-claim-request { planeId, atTick, unitId }` (claimant → host and peers), `reaction-claim-result { planeId, atTick, unitId, accepted }` (host → all). They are hints; state from Step 15 is the truth.
- [ ] Host: validate with `canClaimReaction`, call the endpoint, apply locally, send the result. While a request for the open plane is undecided, `tryResumeParallel` must not close the plane.
- [ ] Peers: track pending claims per `planeId`; if they have played ahead past the plane and the claim is accepted, rewind to the plane (use the existing resync/rewind path; do not invent a new one).
- [ ] Claimant: give up on a rejection or on the close of the plane whose id matches. Ignore results for other plane ids.
- [ ] Tests: request then accept; request then reject; request arriving after close is rejected; two requests both accepted; a lost result is recovered from the merged state; a close of an earlier plane does not cancel a pending claim.

### Step 17 — Claim button and visibility

Files: `ui/pages/battlePhase/` (claim button near the ability bar), the pause-plane HUD that shows who is being waited for, `app/js/WebRtcLobbyMesh.ts` (link state read), component test if a pattern exists.

- [ ] "React" button for a player who is not a waiter, shown only while `canClaimReaction` is true; disabled with a tooltip while the mesh link to the host is down.
- [ ] Pending, accepted and rejected states on the button ("Too late" for a rejection).
- [ ] The plane HUD lists every waiter and every pending claim, for all players.

## Verification

### Step 18 — Final verification

Files: new AbilityTest scenarios under `testing/scenarios/` (see `ability-tests`), the browser plan.

- [ ] AbilityTest scenarios (high level, deterministic):
  - Shell: hitting a shelled Knot does reduced damage, killing its Bud opens it.
  - Phase retreat: a large hit at the 75% threshold triggers the retreat, the old tree becomes Briar, the Heart resurfaces with the phase-2 tree.
  - Seed: a destroyed seed does not burst.
  - Reaction: a player inside a Pod Mortar telegraph is paused at the frame, acts, spends 1 Reflex; after a round it has 1 again.
  - Co-op claim: a second player claims during the attack, both act, the plane resumes after both orders.
- [ ] Run the new scenarios and `npm run test:sim`.
- [ ] Run the specific unit test files created by Steps 1–17 in one `npx vitest run <files>` call.
- [ ] `npx tsc --noEmit` (only the known pre-existing error) and `npm run lint:changed`.
- [ ] Manual browser checklist (two local accounts, see `session-testing`):
  - Fight the Garden Heart start to finish; the Shell numbers read as "not working"; Briar and Tangle shape the arena.
  - First reaction frame shows the tutorial once.
  - Second player claims at a reaction; both see the pending state; the host's result shows on both.
  - Drop the mesh link (disconnect one peer): the claim button disables.
- [ ] Mark finished items in the browser plan 0008 (items done, decisions recorded) and move this file to `docs/plans/done/`.
