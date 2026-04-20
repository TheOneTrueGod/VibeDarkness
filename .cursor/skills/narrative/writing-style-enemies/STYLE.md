# Enemy writing — style template

Append **`[Canon]`**, **`[Draft]`**, or **`[Open]`** to each **section heading** that carries binding guidance. See `narrative-hub` for tier rules.

## Naming conventions [Draft]

- **Pattern:** (e.g. concrete vs abstract, threat level in the name or not, faction prefixes.)
- **Avoid:** (e.g. joke names in horror zones—tune to your game.)

## Short descriptions (UI / codex) [Draft]

- **Length:** target word count or line budget.
- **Voice:** second vs third person, tense, whether the narrator “knows” mechanics.

## Factions and themes [Draft]

- **Factions:** group names by **role in the story or biome**, not a full roster table.
- **Themes:** recurring motifs (corruption, order, hunger, etc.) agents should reinforce—not a list of every unit ID.

## Creature types (enemy tone + presentation) [Draft]

These align with optional **`creatureType`** on unit defs (`app/js/games/minion_battles/game/units/unit_defs/unitDef.ts`, type `CreatureType`). Use them when naming, describing, or staging enemies; when adding a new enemy def, set `creatureType` if obvious—**if not, stop and ask the user** before treating headcanon as canon. Death VFX for dark creatures is built from **`darkCreatureDissolutionDeathEffect`** in `game/deathEffects/darkCreatureDissolutionDef.ts` (purple particle puff—no specific unit name in docs).

### Dark creature [Draft]

Spawned by the **Darkness**; looks almost like a natural animal but **wrong** (extra eyes or limbs, wrong sounds). **Visuals:** dark purple palette, **no blood**, on death **dissolve in purple smoke** (particle dissolution). **Behaviour:** no self-preservation; single-minded purpose (usually killing the player), pursued at any cost.

### Beast [Draft]

A **real** creature. **Blood** on injury, **corpse** on death (when the engine supports it—intent for future VFX). Some self-preservation: may be aggressive, passive, or flee.

## Mission and bark tone [Open]

- When enemies speak or are described in missions, how **grim**, **dry**, or **darkly comic** should copy be?

## Examples to mimic (pointers, not pasted text) [Draft]

Point to **existing** enemy definitions in the repo (folders or file patterns) as references; do not duplicate long strings here.
