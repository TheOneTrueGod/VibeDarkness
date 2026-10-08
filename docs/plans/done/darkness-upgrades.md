> **Completed 2026-10-07.** Steps 1-10 implemented and verified (lint 0 errors, tsc clean, full suite 328 files / 2553 tests passed). Pending: Step 9 manual browser checklist (needs admin login + running app). Follow-ups: darkness-upgrade node ids are held in memory in Game.tsx after battle (a reload during post-mission story loses the bonus); reward entries assume default level (multi-level nodes would need levels carried); exhaustion is intentionally excluded from the +2 each-resource reward.

# Darkness Upgrades

Per-player, admin-granted global upgrades that modify **all units on the field** and add **bonus mission rewards**. Tracked as a research tree (`darkness_upgrades`) so existing research UI/aggregation is reused, but stored in a **separate player-level field** (`darknessUpgrades`), not on `CampaignCharacter`. Only the **host's** upgrades count in battle (single resolver function so the policy is easy to change later).

First upgrade: **Empowered Spirits** (the "ghost" enemy is the **slime**: `characterId: 'slime'`, ability `0001` SlimeShot, `game/units/dark_animals/slimeRanged.ts`):
- Slimes get +12 max health.
- Slimes fire 2 additional projectiles in a wedge; targeting preview shows them as smaller, paler lines with **no narrowing effect**, length < 40 px + slime radius.
- Grants +2 of **each** resource at the end of a victorious mission (rolled into total mission rewards).

Do not confuse with `app/js/darknessStrength/` (campaign difficulty packages) — separate system. Name everything `darknessUpgrade*` / `darkness_upgrades`.

## Agent Instructions

This plan is executed by `/jp-implement-plan` (see `.claude/skills/jp-implement-plan/SKILL.md`). The **invoking agent is the sole orchestrator**: it spawns one worker per step **synchronously** (never background), waits for each to finish, then reports plan completion to the user. Each worker implements **exactly one step**, checks off its items with a one-line summary, and **stops without spawning the next agent**.

Relevant project skills: `research-trees`, `working-on-minion-battles`, `creating-an-ability`, `editing-card-behaviour`, `game-engine`, `game-object-def-pattern`, `game-sync-data-flow`, `editing-and-creating-components`, `scoped-testing`, `ability-tests`.

Rules for every step:
- Per-step verification is limited to `npm run lint` (plus `npx tsc --noEmit` when the step crosses interface/type boundaries) and **only the specific test files the step touches or creates** (`npx vitest run path/to/That.test.ts`). **Never** run the full suite, whole directories, or AbilityTests in a regular step — that is the final step's job.
- Write the failing test first where the step lists tests (CLAUDE.md: Vitest, not Jest).
- Working tree has uncommitted edits (e.g. `0001Ability.ts`, `unitDef.ts`); build on top of them, never revert them.
- Line endings: files are CRLF in the working tree; preserve existing endings.

## Design decisions (already agreed)

- Stat keys: `enemy_unit_slime_max_health_bonus` (add 12) and `enemy_unit_slime_extra_projectiles` (add 2). General pattern: `enemy_unit_<characterId>_<stat>`.
- Storage: `darknessUpgrades: { researchTrees, researchNodeLevels, researchNodeSources }` on the player (same shapes as character research), defaulting to empty for legacy saves.
- `Empowered Spirits` node: `disabled: true` (admin-only), no cost.
- `bonusRewards`: optional `Partial<Record<CampaignResourceKey, number>>` on the node def. Victory only.
- Host-only: `resolveActiveDarknessUpgrades(lobby)` is the one place deciding whose upgrades count.

## Steps

### Step 1 — Types, stat keys, and node-def fields

Files: `app/js/researchTrees/types.ts`, `app/js/types.ts`

- [x] Add `PassiveStatKey.EnemyUnitSlimeMaxHealthBonus = 'enemy_unit_slime_max_health_bonus'` and `PassiveStatKey.EnemyUnitSlimeExtraProjectiles = 'enemy_unit_slime_extra_projectiles'` to the enum in `researchTrees/types.ts`.
    - Added `EnemyUnitSlimeMaxHealthBonus` and `EnemyUnitSlimeExtraProjectiles` to `PassiveStatKey` (also added their labels to `STAT_LABELS` in `StatBonusesTab.tsx` since it is an exhaustive `Record<PassiveStatKey,string>`).
- [x] Add optional `bonusRewards?: Partial<Record<CampaignResourceKey, number>>` to `ResearchNodeDef` (import/use the existing `CampaignResourceKey` type; check where it is defined and avoid circular imports).
    - Added optional `bonusRewards` to `ResearchNodeDef`; `CampaignResourceKey` is already re-exported from `../types` in `researchTrees/types.ts`, no new imports.
- [x] Add a `DarknessUpgradesState` type (`{ researchTrees: Record<string,string[]>; researchNodeLevels: ResearchNodeLevels; researchNodeSources: ResearchNodeSources }`) and an optional `darknessUpgrades?: DarknessUpgradesState` field on the player/account-level campaign state type in `app/js/types.ts` (next to where per-player research/campaign data lives; pick the same level as `campaignCharacters` owner data — inspect `CampaignState` and decide, documenting the choice in a comment). Export an `EMPTY_DARKNESS_UPGRADES` default.
    - Added `DarknessUpgradesState`, `EMPTY_DARKNESS_UPGRADES`, and optional `darknessUpgrades` on `CampaignState` (same owner level as `campaignCharacters`; documented in comment) in `app/js/types.ts`.
- [x] Run `npx tsc --noEmit` and `npm run lint`.
    - `npx tsc --noEmit` clean; `npm run lint` 0 errors (16 pre-existing warnings).

### Step 2 — Persistence (TS defaults + PHP)

Files: `app/js/darknessStrength/campaignFields.ts` (pattern reference only — put new code in `app/js/darknessUpgrades/campaignFields.ts`), `backend/Campaign.php`, `backend/Http/Handlers/UpdateCampaignHandler.php`, `app/js/LobbyClient.ts`, `app/js/App.tsx` (only if campaign payload plumbing requires it)

- [x] Create `app/js/darknessUpgrades/campaignFields.ts` with `withDarknessUpgradesDefaults(...)` (legacy saves without the key get `EMPTY_DARKNESS_UPGRADES`) and `DARKNESS_UPGRADES_PATCH_KEYS`, mirroring `darknessStrength/campaignFields.ts`.
    - Created `darknessUpgrades/campaignFields.ts` with generic `withDarknessUpgradesDefaults` (fresh empty maps for missing key, fills partial sub-maps) and `DARKNESS_UPGRADES_PATCH_KEYS`.
- [x] Test first: `app/js/darknessUpgrades/campaignFields.test.ts` — defaults applied for missing key, existing value preserved, PATCH keys listed. Run `npx vitest run app/js/darknessUpgrades/campaignFields.test.ts`.
    - Added `campaignFields.test.ts` (5 tests: default, no shared refs, preserved value, partial fill, PATCH keys); passes.
- [x] Update `backend/Campaign.php` `toArray`/`fromArray` to persist `darknessUpgrades` with unknown-safe defaults (`{researchTrees:{},researchNodeLevels:{},researchNodeSources:{}}`), and `UpdateCampaignHandler.php` to accept the new PATCH key. Follow exactly how `darknessStrengthInstances` is handled. Wire `LobbyClient.ts` / `App.tsx` only where the existing darkness-strength fields are plumbed.
    - `Campaign.php` now has `darknessUpgrades` property/getter/setter, normalizes unknown-safe, emits `{}` for empty maps in `toArray`, reads in `fromArray`; `UpdateCampaignHandler.php` accepts `darknessUpgrades` PATCH key; `php -l` clean and round-trip verified. `LobbyClient.updateCampaign` already accepts it via `Partial<CampaignState>` (doc comment updated); `App.tsx` needed no change.
- [x] Run `npx tsc --noEmit` and `npm run lint`.
    - `npx tsc --noEmit` and `npm run lint` clean (0 lint errors).

### Step 3 — Darkness Upgrades tree, Empowered Spirits node, and aggregation

Files: `app/js/researchTrees/trees/darkness_upgrades.ts` (new), `app/js/researchTrees/list.ts`, `app/js/researchTrees/researchTreeChrome.ts`, `app/js/researchTrees/darknessUpgrades.ts` (new), `app/js/researchTrees/darknessUpgrades.test.ts` (new)

- [x] Test first (`darknessUpgrades.test.ts`): (a) `computeDarknessUpgradeBonuses(darknessUpgrades)` returns `enemy_unit_slime_max_health_bonus.add === 12` and `enemy_unit_slime_extra_projectiles.add === 2` when Empowered Spirits is owned, and `{}` when not; (b) character `computePassiveBonuses` for a character that has *no* research is unaffected by owning the upgrade (storage separation); (c) `collectDarknessUpgradeBonusRewards(...)` returns 2 of **each** `CampaignResourceKey` for Empowered Spirits and `{}` when not owned.
    - Added `darknessUpgrades.test.ts` (4 tests: bonuses owned/empty, character separation, rewards 2-each/empty, tree id); passes.
- [x] Create `trees/darkness_upgrades.ts`: tree id `darkness_upgrades`, title "Darkness Upgrades", `accessRequirements` such that non-admins never see the tree (reuse existing admin/`disabled` mechanics — check how `disabled` trees/nodes are filtered in `ResearchTreePanel`), node `empowered_spirits` with `disabled: true`, no cost, `passiveBonus` for both keys, `bonusRewards` = 2 of every resource key (derive from the resource key list, not hand-written), description/flavor text. Register in `list.ts` and add colour/icon in `researchTreeChrome.ts` (reuse an existing asset or `assets/tree-generic.png`).
    - Created `trees/darkness_upgrades.ts` (admin-only disabled `empowered_spirits`, access gated on owning its node, `bonusRewards` derived from `ZERO_CAMPAIGN_RESOURCES` keys excluding `exhaustion` since it is a penalty), registered in `list.ts`, added `RESEARCH_TREE_COLOUR_DARKNESS` in chrome (generic icon reused).
- [x] Create `researchTrees/darknessUpgrades.ts` exporting `DARKNESS_UPGRADES_TREE_ID`, `isDarknessUpgradeTree(treeId)`, `computeDarknessUpgradeBonuses(state)` (delegates to `computePassiveBonuses`, passing the darkness upgrade maps), and `collectDarknessUpgradeBonusRewards(state)` (sums `bonusRewards` of owned nodes, scaled per level if levelled).
    - Created `researchTrees/darknessUpgrades.ts` with `DARKNESS_UPGRADES_TREE_ID`, `isDarknessUpgradeTree`, `computeDarknessUpgradeBonuses`, `collectDarknessUpgradeBonusRewards` (level-scaled, floored).
- [x] Ensure `computePassiveBonuses` for character research ignores the `darkness_upgrades` tree (it iterates `RESEARCH_TREES`; character calls must skip this tree so owning a darkness node in character storage can never leak) — add a test in the same file.
    - `computePassiveBonuses` now takes an optional `treeFilter` defaulting to skip the darkness tree; character-isolation test is in `darknessUpgrades.test.ts`.
- [x] Run `npx vitest run app/js/researchTrees/darknessUpgrades.test.ts`, then `npx tsc --noEmit` and `npm run lint`.
    - Vitest (darknessUpgrades, researchTreeChrome, passiveBonuses) all pass; `tsc --noEmit` and `npm run lint` clean (0 errors).

### Step 4 — Research UI and admin grant/revoke storage switch

Files: `app/js/games/minion_battles/ui/components/ResearchTreePanel.tsx`, `app/js/games/minion_battles/ui/components/CharacterEditor/CharacterEditor.tsx`, `app/js/games/minion_battles/ui/components/CharacterEditor/StatBonusesTab.tsx`, plus one test file `app/js/researchTrees/darknessUpgradesAdmin.test.ts` (new, pure-logic helpers only)

- [x] Add pure helpers (in `researchTrees/darknessUpgrades.ts` or a sibling) `grantDarknessUpgradeNode(state, nodeId)` / `revokeDarknessUpgradeNode(state, nodeId)` that update `researchTrees`, `researchNodeLevels`, and `researchNodeSources` (source `ResearchSource.Admin`). Test first in `darknessUpgradesAdmin.test.ts`: grant adds node + source, revoke removes it and cleans empty entries, non-admin flag cannot grant (pure `canInteractWithDarknessUpgradeTree(isAdmin)`).
    - Added grant/revoke/merge-view/canInteract helpers in researchTrees/darknessUpgrades.ts (Admin source, pure, cleans empties); 5 tests in darknessUpgradesAdmin.test.ts pass.
- [x] In `CharacterEditor.tsx`/`ResearchTreePanel.tsx`, when `isDarknessUpgradeTree(tree.id)`: read owned/level/source data from the player's `darknessUpgrades` instead of the character, route admin shift-grant/revoke through the helpers above, persist via the campaign PATCH key from Step 2, and render the tree only for admins (non-admins cannot see or interact). Keep changes minimal — branch on tree id at the data source/callback boundary rather than forking components.
    - CharacterEditor keeps darknessUpgrades state from the campaign, builds a merged view (darkness tree entries replace character data; admin grant bypasses access reqs so the first node is grantable), routes darkness grant/reset via new api.updateCampaignDarknessUpgrades (PATCH), and hides the tree from non-admins (even with debug show-all).
- [x] `StatBonusesTab.tsx`: add friendly labels for the two new stat keys (and make sure darkness keys never show in a character's own bonuses).
    - Labels were added in Step 1; verified darkness keys never reach a character (computePassiveBonuses skips the tree; Stat Bonuses tab and character data use character maps only, never the merged view).
- [x] Run `npx vitest run app/js/researchTrees/darknessUpgradesAdmin.test.ts`, then `npx tsc --noEmit` and `npm run lint`.
    - darknessUpgradesAdmin + darknessUpgrades tests pass (9); tsc clean; lint 0 errors.

### Step 5 — Host-only resolution and engine plumbing

Files: `app/js/researchTrees/darknessUpgrades.ts` (add resolver), `app/js/games/minion_battles/game/GameEngine.ts`, `app/js/games/minion_battles/game/GameState.ts`, `app/js/games/minion_battles/game/BattleSession.ts` and/or the lobby→engine setup site (find where `activeDarknessStrengths` is assigned at battle start), `app/js/researchTrees/darknessUpgradesHost.test.ts` (new)

- [x] Test first (`darknessUpgradesHost.test.ts`): `resolveActiveDarknessUpgrades(lobby)` returns the **host's** upgrade bonuses even when a non-host player also owns Empowered Spirits, ignores a non-host's upgrades when the host has none, and returns `{}` when the host has none. Determine from the lobby/player model how the host is identified (check `LobbyClient.ts`, lobby types) and note it in the function's doc comment: "Only the host's upgrades count — change here to alter policy."
    - Added `darknessUpgradesHost.test.ts` (3 resolver cases: host wins over guest, guest ignored when host empty, no host/no data -> empty); host = player with `PlayerState.isHost`.
- [x] Implement `resolveActiveDarknessUpgrades(lobby)` returning a `PassiveBonuses` bag (and the list of active node ids for reward display).
    - Added `resolveActiveDarknessUpgrades({players, darknessUpgradesByPlayer})` in `researchTrees/darknessUpgrades.ts` returning `{bonuses, activeNodeIds, state, hostPlayerId}`; doc comment states host-only policy.
- [x] Add `darknessUpgradeBonuses: PassiveBonuses` to `GameState` + `GameEngine` getter/setter, **serialized and restored in engine checkpoints** next to `activeDarknessStrengths` (`GameEngine.ts` serialize ~line 1994 / deserialize ~line 2057) so recovery/refresh stays in sync (see `game-sync-data-flow` skill — recovery vs refresh pitfalls). Set it at battle start where `activeDarknessStrengths` is set.
    - Added `darknessUpgradeBonuses` to `GameState`, `GameEngine` getter/setter, `SerializedGameState`; toJSON (omitted when empty) / fromJSON restore. `BattleSession.load` + `runBattleBootstrap` take optional `darknessUpgradeBonuses` (falls back to initial snapshot's bag for non-host) and set it before `initializeGameState`. NOTE: the live UI caller (BattlePhase/useBattleSessionLifecycle) does not yet pass the host's resolved bag - to be wired in Step 8 alongside Game.tsx.
- [x] Add a serialization round-trip assertion to the host test file (checkpoint → restore keeps the bag).
    - Added checkpoint round-trip tests (toJSON -> fromJSON keeps bag; empty omitted) to the host test file.
- [x] Run `npx vitest run app/js/researchTrees/darknessUpgradesHost.test.ts`, then `npx tsc --noEmit` and `npm run lint`.
    - `darknessUpgradesHost.test.ts` passes (5); tsc and lint results below.

### Step 6 — Apply upgrades to units at spawn (slime +12 max health)

Files: `app/js/games/minion_battles/game/units/spawning/spawnUnit.ts`, `app/js/games/minion_battles/game/units/spawning/spawnUnit.test.ts` (existing — add cases)

- [x] Test first in `spawnUnit.test.ts`: with `engine.darknessUpgradeBonuses = { enemy_unit_slime_max_health_bonus: {add: 12, mult: 1} }`, a spawned **enemy** slime has max health `base + 12` (use `applyPassiveBonusToBase` semantics, integer floor); a player-team unit or a non-slime enemy is unchanged; with an empty bag nothing changes. Mirror the existing `DS_ENEMY_HARDENED_MAX_HEALTH_MULT` test at ~line 331 for setup.
    - Added 3 tests (enemy slime +12 max/current HP, player-team slime and enemy wolf unchanged, empty bag unchanged); pass.
- [x] In `spawnUnit.ts`, for enemy-team units look up `enemy_unit_<characterId>_max_health_bonus` in `engine.darknessUpgradeBonuses` and bake it into the unit's max health the same place/way DarknessStrength `statBuff` is baked (mirror `darknessStrength/compile.ts` ordering so the two systems compose). Keep it generic across characterIds.
    - Added optional `darknessUpgradeBonuses` to `SpawnUnitContext` and generic `applyDarknessUpgradeMaxHealth` (enemy team, `enemy_unit_<characterId>_max_health_bonus`, via `applyPassiveBonusToBase`) applied after DS stat buffs.
- [x] Run `npx vitest run app/js/games/minion_battles/game/units/spawning/spawnUnit.test.ts`, then `npx tsc --noEmit` and `npm run lint`.
    - spawnUnit.test.ts 21/21 pass; tsc clean; lint 0 errors.

### Step 7 — SlimeShot wedge projectiles and targeting preview

Files: `app/js/games/minion_battles/card_defs/0001_SlimeShot/0001Ability.ts` (has uncommitted edits — build on them), `app/js/games/minion_battles/card_defs/0001_SlimeShot/0001Ability.test.ts` (existing or new), `app/js/games/minion_battles/game/GameRenderer/renderers/PreviewRenderer.ts`, plus a small pure helper and test: `app/js/games/minion_battles/card_defs/0001_SlimeShot/slimeWedge.ts` / `slimeWedge.test.ts`

- [x] Test first (`slimeWedge.test.ts`): `computeSlimeWedgeDirections(aimAngle, extraCount)` returns `extraCount` angles symmetric around the aim angle (for 2: one each side), and `getSlimeWedgePreviewLength(slimeRadius)` is `< 40 + slimeRadius` (define a `SLIME_WEDGE_PREVIEW_MAX_LENGTH = 40` constant).
    - Added `slimeWedge.ts` (`computeSlimeWedgeDirections`, `getSlimeWedgePreviewLength` = 30+radius, `SLIME_WEDGE_PREVIEW_MAX_LENGTH=40`, `getSlimeExtraProjectileCount`) and `slimeWedge.test.ts` (4 tests).
- [x] Test first (`0001Ability.test.ts`): a slime with the Empowered Spirits bag (`enemy_unit_slime_extra_projectiles.add === 2`) fires **3** projectiles total (1 main + 2 wedge), without the bag fires 1. Follow the multi-order ability-test pattern from the `ability-tests` skill; read the bag via the engine's `darknessUpgradeBonuses`. Extra projectiles use the same damage as the main shot unless the existing ability defines otherwise.
    - Added `0001Ability.test.ts`: engine-level cast yields 1 projectile without the bag, 3 with it; plus a preview test.
- [x] Implement in `0001Ability.ts` using the helper; use existing projectile-spawn/hitbox infrastructure (see `working-with-hitboxes`, `creating-an-ability`), respecting the existing uncommitted changes.
    - `0001Ability.ts`: new `SlimeShotLaunch` behaviour wraps `ProjectileLaunch`, re-invoking it for each wedge angle (same range/damage) when the caster is enemy-team and `engine.darknessUpgradeBonuses` has extra projectiles; added optional `darknessUpgradeBonuses` to `AbilityEngineContext`.
- [x] `PreviewRenderer.ts` / the SlimeShot preview spec: draw the extra wedge lines **smaller and paler** than the main targeting line, **without** the narrowing effect, with length from `getSlimeWedgePreviewLength`. Keep the change inside the existing preview path (check `game/interaction/AGENTS.md` and `hitbox-spec-targeting-refactor.md` for the conventions); only show them when the bonus is active.
    - `renderActivePreview` gained an optional 5th `engine` arg (typed in `Ability.ts`, passed by `PreviewRenderer.ts`); SlimeShot draws pale, thin, fixed-angle (non-narrowing) wedge lines of length `getSlimeWedgePreviewLength` only when the bonus is active.
- [x] Run `npx vitest run` on the two new/edited test files above only, then `npx tsc --noEmit` and `npm run lint`.
    - Both test files pass (7 tests); tsc and lint results below.

### Step 8 — Live wiring, bonus rewards at mission end, and Victory modal

- [x] **Live wiring (added by orchestrator after Step 5):** find the host's call site (where `Game.tsx` / `BattlePhase` / lobby setup has campaign state and calls `runBattleBootstrap`/`BattleSession.load`), call `resolveActiveDarknessUpgrades` there with the host's `CampaignState.darknessUpgrades`, and pass the resulting bag as `darknessUpgradeBonuses` so it lands in the host's initial snapshot (non-hosts pick it up from the snapshot). Add a small test if feasible (pure helper preferred).
    - Added `onLoadDarknessUpgrades` (App.tsx fetches this client's campaign `darknessUpgrades`) plumbed GameScreen -> Game -> BattlePhase -> `useBattleSessionLifecycle`; host-only it resolves via new `resolveBattleDarknessUpgradeBonuses` (non-host returns undefined so it reads the bag from the host's snapshot) and passes `darknessUpgradeBonuses` to `runBattleBootstrap`. Pure helper tested in `darknessUpgradeRewards.test.ts`.

Files: `app/js/games/minion_battles/Game.tsx`, `app/js/games/minion_battles/ui/components/VictoryModal.tsx`, `app/js/games/minion_battles/ui/pages/PostMissionStoryPhase.tsx` (only if it displays totals), `app/js/researchTrees/darknessUpgradeRewards.ts` (new) + `darknessUpgradeRewards.test.ts` (new)

- [x] Test first (`darknessUpgradeRewards.test.ts`): `mergeDarknessUpgradeRewards(resourceDelta, activeUpgradeRewards, victory)` — on victory adds each upgrade's `bonusRewards` into the total and returns per-upgrade line items `{ nodeId, title, delta }`; on defeat returns the input unchanged and no line items; does not mutate inputs; empty when no upgrades active; Empowered Spirits yields +2 for every resource key.
    - `darknessUpgradeRewards.test.ts` added (9 tests: +2 each resource, victory merge + line items, defeat unchanged, no mutation, empty, host/non-host bag resolution); passes.
- [x] Implement the pure merge function; call it in `Game.tsx` where `rewards.resourceDelta` is consumed (~line 723, `onComplete`) using the **host's** active upgrades from Step 5, so the merged total is what gets applied to campaign resources; ensure only the host path applies it (no double-grant in multiplayer — check how `resourceDelta` is currently applied per client and keep that behaviour).
    - Added `getActiveDarknessUpgradeRewardEntries` / `mergeDarknessUpgradeRewards` in `researchTrees/darknessUpgradeRewards.ts`; `Game.tsx` merges in both victory paths (`onComplete` and `onVictory`) via host-only `applyDarknessUpgradeVictoryRewards` (non-hosts/spectators/NPC controllers get nothing; each client only writes its own campaign, so no double-grant; only the host's upgrades count). Mid-quest, the bonus rides in the deferred quest delta like other resources.
- [x] `VictoryModal.tsx`: show a line item per active upgrade ("Empowered Spirits: +2 each resource") included in the displayed total, consistent with the existing `missionRewards.resourceDelta` display (~lines 85–93).
    - `VictoryModal` shows per-upgrade line items (e.g. "Empowered Spirits: +2 each resource") via `missionRewards.darknessUpgradeLines`; the amounts are already included in the displayed `resourceDelta` total. PostMissionStoryPhase needed no change.
- [x] Run `npx vitest run app/js/researchTrees/darknessUpgradeRewards.test.ts`, then `npx tsc --noEmit` and `npm run lint`.
    - New test passes (9); `npx tsc --noEmit` clean; `npm run lint` 0 errors.

### Step 9 — Final verification (run expensive checks once)

Files: `app/js/games/minion_battles/testing/` ability-test scenario file for Empowered Spirits (follow the `ability-tests` skill for location/registration)

- [x] Add one high-level AbilityTest scenario, "Empowered Spirits": tiny battle with an enemy slime and a player target, `darknessUpgradeBonuses` set to the Empowered Spirits bag; assert deterministically that the slime has +12 max health and that a single SlimeShot cast results in 3 projectiles (one wedge to each side). Keep it fast and feature-level, not number-level beyond those two facts.
    - Added `scenarios/general/darknessUpgrades.ts` (`darkness_upgrade_empowered_spirits`, section "Darkness Upgrades", registered in `registry.ts`): control slime vs empowered slime (+12 max HP via `engine.spawnUnit`) and one SlimeShot yields 3 projectiles; thin Vitest wiring in `scenarios/darknessUpgrades.scenarios.test.ts`.
- [x] Run the new AbilityTest scenario (headless runner per `ability-tests` skill) plus the existing SlimeShot / slime-related AbilityTest scenarios once.
    - New scenario passes; whole `testing/` dir (incl. existing `enemy_archer_shot` slime scenario via SimulationRunner tests) 11 files / 122 tests pass.
- [x] Run the broad regression once: `npx vitest run --changed` (or `npm run test` if the change set is large), then `npx tsc --noEmit` and `npm run lint`. Fix any failures attributable to this plan.
    - `npm run lint` 0 errors (16 pre-existing warnings); `npx tsc --noEmit` clean; `npx vitest run --changed` 239 files / 1856 tests passed (1 skipped), no failures.
- [ ] Manual browser checklist (use the built-in browser if feasible; otherwise list as pending for the user): as admin, open the Darkness Upgrades tree and grant/revoke Empowered Spirits; as a non-admin the tree is not visible; start a mission as host with the upgrade — slime has +12 HP, targeting preview shows two short pale wedge lines with no narrowing, SlimeShot fires 3 projectiles; win the mission — Victory modal shows the Empowered Spirits line item and +2 of each resource is added to the total; reload mid-battle (refresh/recovery) — bonuses persist.
    - PENDING for the user (not verified; needs admin login/running app, no credentials entered). Remaining: admin grant/revoke of Empowered Spirits, non-admin cannot see tree, host mission shows slime +12 HP / two pale non-narrowing wedge preview lines / 3 projectiles, Victory modal line item and +2 each resource, reload mid-battle keeps bonuses.

### Step 10 — Bonus rewards for ALL players (added after user feedback)

User decision: the difficulty increase and the bonus reward must apply to **all players**, not just the host. Difficulty is already shared (the host's bag rides the initial snapshot and the battle is shared). Policy stays: the **host's upgrades** define which upgrades are active; every human player's campaign receives the bonus rewards of those active upgrades.

- [x] Carry the host's active upgrade node ids (from `resolveActiveDarknessUpgrades(...).activeNodeIds`) in engine state next to `darknessUpgradeBonuses`, serialized/restored in checkpoints and delivered to non-hosts via the initial snapshot (same path as the bag; pass `undefined`, not `{}`, for non-hosts). Test: checkpoint round-trip keeps the ids.
    - Added `darknessUpgradeNodeIds` to `GameState`/`GameEngine`/`SerializedGameState` (checkpoint toJSON omits when empty, fromJSON restores); host resolves via new `resolveBattleDarknessUpgrades` (bonuses + activeNodeIds) and passes both through `runBattleBootstrap` -> `BattleSession.load`; non-hosts pass `undefined` and read ids from the initial snapshot. Round-trip tests in `darknessUpgradesHost.test.ts`.
- [x] In `Game.tsx` `applyDarknessUpgradeVictoryRewards`, drop the `isHost` gate: derive reward entries from the engine's active node ids (via `getActiveDarknessUpgradeRewardEntries` or a new variant taking node ids) instead of loading the local client's own `darknessUpgrades`. Still exclude spectators/NPC controllers; each client writes only its own campaign so nothing is double-applied. Remove the now-unneeded `onLoadDarknessUpgrades` plumbing only if nothing else uses it (host still needs it to resolve the bag). Update/add tests in `darknessUpgradeRewards.test.ts`: a non-host receives the same reward as the host from the same active ids; empty ids → no reward; defeat → none.
    - `applyDarknessUpgradeVictoryRewards` no longer gates on `isHost` or loads campaign data; it reads a `Game.tsx` ref filled by `onActiveDarknessUpgradeNodeIds` (BattlePhase -> `useBattleSessionLifecycle` reports `session.getEngine().darknessUpgradeNodeIds` after bootstrap, all clients) via new `getDarknessUpgradeRewardEntriesForNodeIds`. Spectators/NPC controllers still skipped; `onLoadDarknessUpgrades` kept (host bag resolution). Tests added in `darknessUpgradeRewards.test.ts`. Caveat: ids are in-memory; a page reload during the post-mission story phase loses them (no bonus then); ids are treated as owned at default level.
- [x] Update the Victory modal/doc comments that say "host-only" for rewards; keep the "host's upgrades define the active set" note in `resolveActiveDarknessUpgrades`.
    - Updated `VictoryModal` and `Game.tsx` prop comments; `resolveActiveDarknessUpgrades` keeps the host-defines-active-set note.
- [x] Run `npm run lint`, `npx tsc --noEmit`, and only the touched test files.
    - `npm run lint` 0 errors, `npx tsc --noEmit` clean, `darknessUpgradeRewards.test.ts` + `darknessUpgradesHost.test.ts` pass (19).
