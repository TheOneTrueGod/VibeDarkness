---
name: creating-an-ability
description: Guides creating new abilities and card definitions in Minion Battles. Use when adding a new ability, card, or skill to app/js/games/minion_battles, or when the user asks how to create an ability.
---

# Creating an Ability

**See [`app/js/games/minion_battles/card_defs/SKILL.md`](../../../app/js/games/minion_battles/card_defs/SKILL.md) for the full guide** — folder layout, stable IDs, **`abilityTimings`** (half-open intervals), **`AbilityGroupId` / skill-tree folders**, registration, **`abilityEvents`** authoring order, and the implementation checklist.

When implementing or reviewing a new ability, also read **`## Juicing the game`** in that file: treat feel and readability (anticipation, impact, aftermath) as part of the work, not an afterthought.

**Enemy projected hitbox timing** — If the ability is an **enemy** cast and `renderActivePreview` shows a **non-line** hit area (cone, disk, quad, arc fill, etc.), use the shared telegraph in `abilities/previewHelpers.ts` (`drawEnemyConeHitboxTelegraph`, `drawEnemyConvexQuadHitboxTelegraph`, or follow the same pattern) so players get a **faint red outline**, a **vibrant red fill expanding from the shape’s center** until the strike, and a **fully red outline from `prefireTime` through any short “still firing” linger** (see the full guide’s **Enemy hitbox telegraph** hook). **Do not** replace the existing **line / thick-capsule** timing previews (e.g. slime archer aim lines, `ChargeAttack` lunge line); those already communicate timing. If it is unclear how the real hit geometry maps to this preview, **ask the player** before shipping.

For `abilityEvents` authoring, follow the policy in the full guide: prefer reusable presets, then inline event rules, and use custom handlers only as a last resort with a short explanatory comment.

**Command / pet abilities** — when `abilitySource: 'pet'` delegates a dash to another card (Sic 'em → Pounce), read **`## Command cards and delegated abilities`** and **`## Targeting preview helper choice`** in the full guide before touching `renderTargetingPreview`.
