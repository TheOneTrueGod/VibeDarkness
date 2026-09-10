---
name: research-trees
description: Research tree definitions, node structure, evaluator logic, and the Upgrades tab UI in the Character Editor. Use when adding or modifying research trees, nodes, costs/requirements/effects, or the Upgrades tab rendering in Minion Battles.
---

# Research Trees & Upgrades UI

## Concept

The **Upgrades** tab in the Character Editor displays research trees. Each tree is a set of nodes; each node has prerequisites, exclusions, requirements, a cost, and effects that modify a character's abilities or equipment.

Research trees are a **meta-game** system — they belong to campaign characters, not to battles. **Design principle: apply research effects before battle starts, not during.** One in-battle check exists in `GameEngine.ts` (`applyChargedRocksLightChargePulse`) — treat this as tech debt to eliminate.

## Definitions

All tree and node definitions live in `app/js/researchTrees/`:

- `types.ts` — `ResearchTreeDef`, `ResearchNodeDef`, `Requirement`, `ResearchEffect`
- `researchTreeChrome.ts` — shared tree colours and icons (`assets/tree-*.png`)
- `list.ts` — registry of all trees
- `evaluator.ts` — `canResearchNode`, `applyResearchEffects`, `prereqClosure`, `meetsRequirement`, `computeEffectiveResourcesForTree`, `getAvailableResearchNodes`
- `descriptiveValue.ts` — `DescriptiveValue` magnitude labels (Tiny/Small/Medium/Large/Huge)
- `trees/` — one file per tree; each exports its tree ID constants and a `ResearchTreeDef`

Each tree has `colour` and `icon`. Cards and the Upgrades sidebar use those fields — do not keep a separate research-type enum.

### Node relationships
- `prereqNodeIds` — nodes that must be researched before this one is available
- `exclusiveWithNodeIds` — nodes that conflict; only one of the group may be researched
- `draft` — when `true`, the node is WIP: hidden from Upgrades selection UI and excluded from `getAvailableResearchNodes` / filter-style mission reward discovery

### Persistence
Research is stored on `CampaignCharacter` as `researchTrees` (node ids), `researchNodeLevels`, and `researchSources` (per-level `Purchased` / `Admin` / `QuestReward`). Missing sources on legacy characters count as Purchased. Effective resources subtract **only Purchased** costs. Mission/quest grants persist `QuestReward`; player clicks on Upgrades persist `Purchased`; admin clicks persist `Admin`. The Upgrades Resources row has **Reset Research** (strips Purchased) and an admin-only **Reset Admin Research** button.

## Querying available nodes

`getAvailableResearchNodes(researchedTrees, { treeId?, tier? })` in `evaluator.ts` returns nodes the character hasn't researched yet and can structurally unlock:
- all `prereqNodeIds` are satisfied
- no `exclusiveWithNodeIds` entry has been researched
- `anyResearched` / `notResearched` requirements pass

External requirements (accountKnowledge, equipment, costs) are intentionally ignored — the function needs no account or character context. Pass `treeId` to scope to one tree, `tier` to scope to one display tier. Both are optional.

## Mission reward slots (`researchRewardSlots`)

Post-mission choice phrases can set `researchRewardSlots` on a `ChoicePhrase` instead of hard-coding `options`. The resolver (`storylines/researchRewardSlots.ts`) turns each slot into one `StoryChoiceOptionRow`.

Two slot forms (defined in `storyTypes.ts` as `ResearchRewardSlot`):
- **Specific** (`treeId` + `nodeId`): always resolves to that exact node. Prereqs and exclusivity are intentionally bypassed — this is a deliberate designer grant.
- **Filter** (no `nodeId`): picks the first unresearched node matching optional `treeId` and `minTier`/`maxTier`. By default also enforces `prereqNodeIds` and `exclusiveWithNodeIds` so players only see nodes they could structurally unlock. Set `respectRequirements: false` on the slot to revert to bypass behaviour.

Both forms check `node.requirements` (e.g. `characterHasEquippedItem`, `anyResearched`). Neither checks cost — mission rewards bypass cost gating.

**Adding a requirement to a node**: if a node should only appear as a randomized reward when certain conditions are met (e.g. a tier-2 upgrade that prereqs a core node), add an `anyResearched` entry to `node.requirements` mirroring the structural `prereqNodeIds`. Example:
```ts
requirements: [{ type: 'anyResearched', treeId: MY_TREE_ID, nodeIds: [MY_NODE_CORE] }],
```

## Pre-battle application

Research effects are applied to player units in `storylines/BaseMissionDef.ts`:
- Stat bonuses (health, damage, stamina recovery) via research callback helpers
- Ability runtime modifiers via `applyXxxResearchToAbilityRuntime(unit, getResearchNodes)`

When adding new research effects that affect battle, wire them here — not via in-battle lookups.

## Upgrades Tab UI

Components (all under `app/js/games/minion_battles/ui/components/`):

| Component | Role |
|-----------|------|
| `CharacterEditor.tsx` | Hosts the Upgrades tab; passes character + campaign state down |
| `ResearchTreePanel.tsx` | Outer container for the tab content |
| `ResearchTreeList` | Sidebar selector listing eligible trees with node-count badges |
| `ResearchTreeContent` | SVG graph rendering nodes at their `(x, y)` positions with edges |
| `ResearchedNodesGrid` | Shared Upgrades right-panel grid: eligible, possessed, and (admins) remaining unowned; sorted by node tier |
| `researchNodeGrid.ts` | Sort-by-tier helpers, missing-prereq line text, eligible / possessed / unowned collections |
| `ResearchNodeCard.tsx` | Individual node: tree icon + title, description, cost pills, then requirements strip. Border colour comes from the owning tree. Comfortable Upgrades cards add a 3-line description, ResourcePill cost, and a missing-prereq strip. |

### Node states
`researched` · `enabled` · `blocked` · `default`

### Upgrades grid cards
Comfortable cards show title, a 3-line description, ResourcePill cost, then a dark **Requirements** strip (2 lines). The strip lists only unowned research prereqs (`prereqNodeIds` + `anyResearched`) and CSS-ellipsis-truncates; hover lists every required node (missing red, possessed green). The grid starts with **Resources** (effective campaign pills), then **Eligible research** (prereqs + non-cost requirements met, cost ignored), then **Possessed research**, then (admins) **Unowned research** excluding eligible. All lists sort by `tier` (then `order`). Cards the player can afford (`canResearchNode`) use a pointer cursor and click to purchase.

### Eligibility gating
`eligibleResearchTrees` filters which trees are shown based on account knowledge, campaign resource minimums, equipped items, and character traits. Players then only see trees they have abilities in (or already researched). Admins always see every tree, with ability-matching trees sorted first; trees the player would not see are dimmed.

### Text formatting
Use `{highlighted}` token syntax in node description strings to render magnitude words in yellow. Use `DescriptiveValue` enum values (`DescriptiveValue.Tiny`, etc.) from `researchTrees/descriptiveValue.ts` for consistent magnitude labels.
