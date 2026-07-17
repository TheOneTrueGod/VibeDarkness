# Plan: torch_copy research node for non-lightbearers

> **Completed 2026-06-26.** All four steps implemented and verified. Added `torch_copy` node to `misc.ts` (same torch effects as `lightbearer`, mutually exclusive); added `skipIfResearched` to `GrantResearchAutoPhrase` with client-side enforcement in `PostMissionStoryPhase.tsx`; updated mission 002 to grant `torch_copy` to non-vote-winners; added `throw_torch_hits_dummy` ability test (now 112 passing, up from 111). Follow-up: fill in the `TODO: story title` / `TODO: story description` placeholders in `misc.ts` with the intended story text.


## Context

In mission 002, a pre-mission group vote chooses one player as the Lightbearer (grants
`MISC_NODE_LIGHTBEARER`). A `grant_research_auto` phrase then silently grants `lightbearer`
to every player — making the vote a cosmetic distinction.

The goal: give the vote winner `lightbearer` and give everyone else a new node `torch_copy`
that grants the same in-battle torch ability but carries different story text, enabling
future story branching based on which node a player holds.

---

## Agent Instructions

This plan is executed by the **jp-implement-plan** chain. Each agent reads
`.claude/skills/jp-implement-plan/SKILL.md`, implements exactly **one step** (the first
step in document order with unchecked items), verifies it, then hands off with:

> Read `.claude/skills/jp-implement-plan/SKILL.md` and follow it for the plan at
> `docs/plans/torch-copy-research-node.md`.

Rules for all steps:
- **Read every file listed in "Touches" before writing a single line.** Do not assume types or signatures.
- Run `npx tsc --noEmit` after any change that crosses a type boundary.
- Run `npx vitest run --changed` after each step to catch regressions.
- After verifying, change `- [ ]` to `- [x]` and add a one-line summary of what changed.

Relevant skills: `working-on-minion-battles`, `research-trees`, `ability-tests`.

---

## Architecture

| Concern | Location |
|---|---|
| Research tree & node defs | `app/js/researchTrees/trees/misc.ts` |
| Story phrase types | `app/js/games/minion_battles/storylines/storyTypes.ts` |
| `grant_research_auto` handler | `app/js/games/minion_battles/ui/pages/PostMissionStoryPhase.tsx` |
| Mission 002 story def | `app/js/games/minion_battles/storylines/WorldOfDarkness/missions/002_towards_the_light.ts` |
| Ability test scenarios | `app/js/games/minion_battles/testing/scenarios/abilities/` |
| Ability test registry | `app/js/games/minion_battles/testing/scenarios/registry.ts` |

**Current grant flow in mission 002:**
1. Pre-mission `groupVote` → `grant_research_to_player` for `lightbearer` → winner only.
2. Post-mission `grant_research_auto` → `grant_research_to_player` for `lightbearer` → all players
   (idempotent; winner already has it, so they get a no-op).

**New grant flow:**
1. Pre-mission `groupVote` → `lightbearer` → winner only. *(unchanged)*
2. Post-mission `grant_research_auto` → `torch_copy` → all players **except** those who already
   hold `lightbearer` (checked client-side via `playerResearchTreesByPlayer` before sending the
   message).

The PHP backend `applyStoryChoice` does NOT check exclusivity; it only checks idempotency on
the exact node being granted. The skip logic must live in the TypeScript frontend.

---

## Step 1 — Add `torch_copy` node to the research tree

**Touches**: `app/js/researchTrees/trees/misc.ts`

- [x] Export `export const MISC_NODE_TORCH_COPY = 'torch_copy';` alongside the other constants.
  Added after `MISC_NODE_LIGHTBEARER` on line 5 of misc.ts.
- [x] Add the node to `nodes[]` with:
  - `id: MISC_NODE_TORCH_COPY`
  - Placeholder `title` and `description` (author fills in story text later).
  - `order: 6, tier: 1`
  - `position: { x: 120, y: 160 }` (above `MISC_NODE_LIGHTBEARER` in the tree canvas)
  - `prereqNodeIds: []`
  - `exclusiveWithNodeIds: [MISC_NODE_LIGHTBEARER]` (prevents UI from offering `torch_copy`
    when `lightbearer` is already held, and vice versa)
  - `requirements: [], cost: {}`
  - `effects: [{ type: 'equipItem', itemId: '005' }]`
  - `overrideCurrentEquipment: true`
  - `modifiesAbility: { from: '0601', to: '0601' }`
  Node inserted directly after the `lightbearer` node in `nodes[]`.
- [x] Add `exclusiveWithNodeIds: [MISC_NODE_TORCH_COPY]` to the existing `MISC_NODE_LIGHTBEARER` node.
  Updated `exclusiveWithNodeIds: []` → `[MISC_NODE_TORCH_COPY]` on the lightbearer node.
- [x] Add `MISC_NODE_TORCH_COPY` to the `accessRequirements.nodeIds` array so players who hold
  `torch_copy` (not `lightbearer`) can still see the tree in the Upgrades tab.
  Added after `MISC_NODE_LIGHTBEARER` in the nodeIds array.

---

## Step 2 — Add `skipIfResearched` to `GrantResearchAutoPhrase` and enforce it

**Touches**:
- `app/js/games/minion_battles/storylines/storyTypes.ts`
- `app/js/games/minion_battles/ui/pages/PostMissionStoryPhase.tsx`

**storyTypes.ts**

- [x] Extend `GrantResearchAutoPhrase` with an optional field:
  ```ts
  skipIfResearched?: { treeId: string; nodeIds: string[] }[];
  ```
  Added with JSDoc comment to storyTypes.ts after the `nodeId` field.

**PostMissionStoryPhase.tsx**

The `useEffect` at ~line 187 handles `grant_research_auto`. It already receives
`playerResearchTreesByPlayer` as a prop (line ~107/119 of the component).

- [x] After the `amSpectator` guard and before `api.sendMessage(...)`, add skip check.
  Inserted `myResearch`/`shouldSkip` guard block using `playerResearchTreesByPlayer[playerId]` before `sendMessage`.

---

## Step 3 — Update mission 002 to grant `torch_copy` to non-lightbearers

**Touches**: `app/js/games/minion_battles/storylines/WorldOfDarkness/missions/002_towards_the_light.ts`

- [x] Import `MISC_NODE_TORCH_COPY` from `'../../../../../researchTrees/trees/misc'` alongside
  the existing `MISC_TREE_ID` and `MISC_NODE_LIGHTBEARER` imports.
  Added to the named import on line 31.
- [x] Replace the existing `grant_research_auto` phrase (currently grants `lightbearer` to all)
  with one that grants `torch_copy` to non-lightbearers, with `skipIfResearched` guard.
  `nodeId` changed from `MISC_NODE_LIGHTBEARER` to `MISC_NODE_TORCH_COPY`; `skipIfResearched` field added.

---

## Step 4 — Add ability test for Throw Torch

No existing ability tests cover card `0601` (Throw Torch). Add a scenario to close this gap.

**Touches** (create new, then update registry):
- `app/js/games/minion_battles/testing/scenarios/abilities/throwTorchScenario.ts` *(new)*
- `app/js/games/minion_battles/testing/scenarios/registry.ts`

**throwTorchScenario.ts** — one scenario:

`throw_torch_hits_dummy` — player with ability `'0601'` throws at a target dummy; assert
the dummy takes damage. Use `buildTinyBattleEngine` + `placePlayerAndDummy` following the
same pattern as `punchResearch.ts`. Set `maxDurationMs: 6000` (the torch is a projectile).

**registry.ts**

- [x] Import `throwTorchHitsDummyScenario` and add it to `ALL_ABILITY_TEST_SCENARIOS`.
  Created `throwTorchScenario.ts`; imported and added to `ALL_ABILITY_TEST_SCENARIOS` in registry.ts.
  Also added explicit `it()` block to `SimulationRunner.test.ts` (the test file uses curated individual tests, not auto-discovery).
- [x] Add `{ treeId: 'lightbearer', label: 'Torch', selectorKey: 'tree:lightbearer', abilityIds: ['0601'] }`
  to `ABILITY_TREE_GROUPS` so the scenario appears in the Ability Test UI under the Lightbearer tree.
  Added as the first entry in `ABILITY_TREE_GROUPS` in registry.ts.
- [x] Add `if (id.startsWith('throw_torch_')) return '0601';` to `inferScenarioAbilityId`.
  Added as the first check in `inferScenarioAbilityId` in registry.ts.

---

## Verification

1. `npx tsc --noEmit` — no errors.
2. `npx vitest run --changed` — all tests pass, including `throw_torch_hits_dummy`.
3. Manual: In a 2-player lobby run mission 002.
   - Player A wins the pre-mission vote → ends up with `lightbearer` only.
   - Player B (non-winner) → ends up with `torch_copy` only.
   - Both have card `0601` (Throw Torch) available in battle.
   - Upgrades tab for each character shows the researched node and the other as blocked (exclusive).
