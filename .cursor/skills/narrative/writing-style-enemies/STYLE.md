# Enemy writing — style template

Append **`[Canon]`**, **`[Draft]`**, or **`[Open]`** to each **section heading** that carries binding guidance. See `narrative-hub` for tier rules.

## Naming conventions [Draft]

- **Pattern:** (e.g. concrete vs abstract, threat level in the name or not, faction prefixes.)
- **Avoid:** (e.g. joke names in horror zones—tune to your game.)

## No enemy names in narrative text [Canon]

Story text never names enemy unit types. The characters do not know what the game calls these creatures, so narrative describes what they see.

- **Applies to:** pre/post-mission story phrases, dialogue, mission `description`s, quest descriptions, location-card and random-story text, research `flavorText`, and any other in-world prose.
- **Use generic descriptors instead:** "glowing insects" / "the little lights" (not Lanternites), "the nest" (not Swarm Nest / Lanternite Nest), "skittering things" / "the swarm" (not Swarmlings), "bramble-weaving creatures" (not Thornbinders), "thorny creatures" (not Thornlings), "the pack leader" (not Alpha Wolf). Plain animal words that are also unit names ("wolves", "a boar") are fine.
- **Allowed:** UI labels that exist to identify a unit or system — card and ability titles, unit nameplates, objective labels in the objectives panel, mission and quest titles, `uiDescription`, world-modifier/tooltips text, and the bestiary.
- **When in doubt:** if a line is spoken, narrated, or read as story, use a descriptor.

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
