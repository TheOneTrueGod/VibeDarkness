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
- `list.ts` — registry of all trees
- `evaluator.ts` — `canResearchNode`, `applyResearchEffects`, `prereqClosure`, `meetsRequirement`, `computeEffectiveResourcesForTree`
- `descriptiveValue.ts` — `DescriptiveValue` magnitude labels (Tiny/Small/Medium/Large/Huge)
- `trees/` — one file per tree; each exports its tree ID constants and a `ResearchTreeDef`

### Node relationships
- `prereqNodeIds` — nodes that must be researched before this one is available
- `exclusiveWithNodeIds` — nodes that conflict; only one of the group may be researched

### Persistence
Research is stored on `CampaignCharacter` as `researchTrees: Record<treeId, nodeId[]>` — a map from tree ID to the array of researched node IDs. See `character_defs/CampaignCharacter.ts`.

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
| `ResearchNodeCard.tsx` | Individual node: title, description, cost pills, requirement badges, research button |

### Node states
`researched` · `enabled` · `blocked` · `default`

### Eligibility gating
`eligibleResearchTrees` filters which trees are shown based on account knowledge, campaign resource minimums, equipped items, and character traits. An admin "show all" debug flag renders all trees at reduced opacity.

### Text formatting
Use `{highlighted}` token syntax in node description strings to render magnitude words in yellow. Use `DescriptiveValue` enum values (`DescriptiveValue.Tiny`, etc.) from `researchTrees/descriptiveValue.ts` for consistent magnitude labels.
