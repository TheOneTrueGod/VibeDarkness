---
name: creating-an-ability
description: Guides creating new abilities and card definitions in Minion Battles. Use when adding a new ability, card, or skill to app/js/games/minion_battles, or when the user asks how to create an ability.
---

# Creating an Ability

**See [`app/js/games/minion_battles/card_defs/SKILL.md`](../../../app/js/games/minion_battles/card_defs/SKILL.md) for the full guide** — folder layout, stable IDs, **`abilityTimings`** (half-open intervals), **`AbilityGroupId` / skill-tree folders**, registration, **`abilityEvents`** authoring order, and the implementation checklist.

When implementing or reviewing a new ability, also read **`## Juicing the game`** in that file: treat feel and readability (anticipation, impact, aftermath) as part of the work, not an afterthought.

For `abilityEvents` authoring, follow the policy in the full guide: prefer reusable presets, then inline event rules, and use custom handlers only as a last resort with a short explanatory comment.
