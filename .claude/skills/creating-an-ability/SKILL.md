---
name: creating-an-ability
description: Guides creating new abilities and card definitions in Minion Battles. Use when adding a new ability, card, or skill to app/js/games/minion_battles, or when the user asks how to create an ability.
---

# Creating an Ability

**See [`app/js/games/minion_battles/card_defs/SKILL.md`](../../../app/js/games/minion_battles/card_defs/SKILL.md) for the full guide** — folder layout, stable IDs, **`abilityTimings`** (half-open intervals), **`AbilityGroupId` / group-folder convention** (which `NN_slug/` folder and id a new weapon, core-crossover, enemy or super-move ability gets), registration, **`abilityEvents`** authoring order, and the implementation checklist.

**Combat hit discovery** — Shape damage/CC must go through a hitbox or a helper that wraps one (see **Hitboxes (combat)** in the full guide and `hitboxes/SKILL.md`). Do not hand-roll enemy radius loops for combat.

When implementing or reviewing a new ability, also read **`## Juicing the game`** in that file: treat feel and readability (anticipation, impact, aftermath) as part of the work, not an afterthought.

**Spell circles** — a spell circle is the tree-styled visual a caster draws around themselves while a cast charges: roughly circular, roughly symmetrical, following the caster on the caster's clock, frozen at a pause plane, and fizzling out if the cast is cut. Add one with `CastBehaviours.SpellCircle({ style })` on the windup interval (`timingStart: 'start', timingEnd: 'end'`); it lands on the window's end, or pass `castSeconds` when the payoff lands later (Stone Tomb lands on stage 1, after its pick). Styles, one per core tree, live in `game/spellCircles/spellCircles.ts`; painters in `game/effect_defs/spellCircleEffects.ts`.
- **When**: medium windups (roughly 0.4 to 1.5 s) on medium-scale effects. They read as a symbol of power and a longer charge, so use them sparingly, especially on early-tree cards. No circle on quick jabs, basic attacks or short dodges.
- **Styles**: `storm` (a lightning ring crackles in from the top, then bolts join a pair at a time, up to six, racing round until the cast flares; Thunderclap, Chain Lightning), `earth` (pebbles and stones lift off the ground in mirrored pairs, hover, and slam down on the cast; Stone Tomb), `earth_light` (the light preset: fewer, smaller stones that hop up and drop quickly, for short beats; Rock Slide draws one on each of its two charge beats), `light` (a soft glow swells under a faint halo and breathes while motes gather in mirrored pairs, then blooms outward on the cast; Gather Light when it imbues, gated with `when`), `armory` (pictures of the forged weapon orbit out and back; every Create ability, via `startConjureCast`).
- **Conditional circles**: `when: (ctx) => ...` draws the circle only when it holds at window open, e.g. only when research makes the cast stronger.
- **Presets**: a lighter or heavier take on a tree's circle is another style id with the same effect type and different `data` (see `earth_light` and the earth painter's `EarthCircleTiming`), not a new painter.
- **A tree without a style** gets one before its first circle: a `SpellCircleStyleDef` (effect type, radius, linger, theme-role colours) plus a painter that reads `radius`, `castAt` and fades with `castBoundAlpha`. Keep it distinct from the other trees and mirror-symmetric, and use hashes, not `Math.random`.
- Any other windup visual that should die with its cast can use the same fizzle: set `effectData.castBound = { abilityId }` and `ownerActorId` on the effect (`game/effects/castBound.ts`).

**Enemy projected hitbox timing** — If the ability is an **enemy** cast and `renderActivePreview` shows a **non-line** hit area (cone, disk, quad, arc fill, etc.), use the shared telegraph in `abilities/previewHelpers.ts` (`drawEnemyConeHitboxTelegraph`, `drawEnemyConvexQuadHitboxTelegraph`, or follow the same pattern) so players get a **faint red outline**, a **vibrant red fill expanding from the shape’s center** until the strike, and a **fully red outline from `prefireTime` through any short “still firing” linger** (see the full guide’s **Enemy hitbox telegraph** hook). **Do not** replace the existing **line / thick-capsule** timing previews (e.g. slime archer aim lines, `ChargeAttack` lunge line); those already communicate timing. If it is unclear how the real hit geometry maps to this preview, **ask the player** before shipping.

For `abilityEvents` authoring, follow the policy in the full guide: prefer reusable presets, then inline event rules, and use custom handlers only as a last resort with a short explanatory comment.

**Player-facing copy** — When writing `getTooltipText`, keyword lines follow the standalone-line rule in **writing-style-abilities** (`STYLE.md` → Keyword lines [Canon]): one `{Keyword value}` per array entry, no prose or punctuation on that line.

**Command / pet abilities** — when `abilitySource: 'pet'` delegates a dash to another card (Sic 'em → Pounce), read **`## Command cards and delegated abilities`** and **`## Targeting preview helper choice`** in the full guide before touching `renderTargetingPreview`.

**Time and haste/slow** - read cast elapsed with `getCastElapsed(unit, active, engine)` (local time), never `engine.gameTime - startTime` (a guard test fails on it). Faster/slower casting, movement and flight come from the time-dilation system (`TimeDilationBuff` presets, `Buff.timeModifier`), not ability code. See the **time-dilation** skill.

**Research costs** — if the ability is unlocked from a campaign research node, set that node's cost with named constants (see **research-trees** and `app/js/researchTrees/researchCostPolicy.ts`). Starting-weapon identity nodes stay free. Stick & Sword / Tech Shield / Throw Rock upgrades are metal-only (`weaponResearchCosts.ts`: standard vs premium). Core trees except Light: about 20 total resources at tier 10 and about 30 at tier 15, interpolated between, with variety. Tier 10 needs at least 10 attunement and 5 vigor; tier 15 needs at least 15 attunement and 5 vigor. Remaining lean: Earth → metal, Command → vigor, Gravity → attunement, Blood Mage → attunement and vigor. Do not retune Light.
