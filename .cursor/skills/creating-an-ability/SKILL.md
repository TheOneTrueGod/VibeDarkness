---
name: creating-an-ability
description: Guides creating new abilities and card definitions in Minion Battles. Use when adding a new ability, card, or skill to app/js/games/minion_battles, or when the user asks how to create an ability.
---

# Creating an Ability

**See `app/js/games/minion_battles/card_defs/SKILL.md` for the full guide** (including **`abilityTimings` half-open intervals**, stable `id` conventions, **`AbilityGroupId` / skill-tree folders** (e.g. **`05_earth_core/`** for Earth **`05`**, `utility/`)).

For `abilityEvents` authoring, follow the policy in that guide: prefer reusable presets, then inline event rules, and use custom handlers only as a last resort with a short explanatory comment.

