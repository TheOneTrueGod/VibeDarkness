---
name: working-with-hitboxes
description: Guides using and creating hitbox classes for ability hit detection in Minion Battles. Use when an ability needs collision/overlap detection against enemy units, or when adding a new hitbox shape.
---

# Working with Hitboxes

**See `app/js/games/minion_battles/hitboxes/SKILL.md` for the full guide.**

Combat hit lists must come from hitbox `getUnitsInHitbox` / `resolveHitbox` (or helpers that wrap them). IFrames are filtered in that pipeline by default; environment damage stays outside it.
