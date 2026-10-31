# Armory Core colour themes

A choice of primary and secondary for the Armory Core, shown on the three surfaces that already carry its steel: the research-tree badge, the Charge resource, and the core icon. The kit conjures a sword (four blades orbit, then the weapon swaps in) or plants a cone turret, and spent weapons stay on the ground. The research node says "The armory is not a room. It is the moment the weapon arrives." Its cost includes metal.

Primary is the mass: the tree chip, the turret body, and the core icon's disc. Secondary is the event: Charge, the conjure orbit, a loaded shot pip, and the core icon's border. On the tree list today only the border takes the colour, and the icon is the generic tree image. These cards colour a swords mark the way Charge colours its own icon, so both roles stay visible.

Each item has a complexity estimate:

- **Low**: a few changes to a few files.
- **Medium**: overhauls a small subsystem.
- **Large**: touches many parts of the code and likely needs a data migration.

Baseline: `RESEARCH_TREE_COLOUR_ARMORY` in `researchTreeChrome.ts` is `#a8a29e`. `CHARGE_RESOURCE_COLOR` in `Charge.ts` is `#d6d3d1`. The turret body in `armoryConstants.ts` is the same stone as the tree chip, and the core icon is `023_core_armory.svg`. Starting-weapon trees are `#9ca3af`, so the current chip sits in that gray. The other cores already own Earth `#b45309`, Light `#eab308`, Command `#f59e0b`, Gravity `#a855f7`, Blood Mage `#f87171`, Darkness `#6366f1`, and Training `#7dd3fc`.

---

## P0: Must do

Shipped steel is the pair already in the game. The four after it are the candidates.

> [!PALETTE] Shipped steel
> primary: #a8a29e Stone
> secondary: #d6d3d1 Bone
>
> The tree chip, the turret body, and the icon crossguard. Charge is the bone. The slash trail is `#e7e5e4` and the blade is `#f5f5f4`, the same family. At chip size this primary sits on the weapon gray `#9ca3af`.

> [!PALETTE] Quench
> primary: #4f6d8c Blue-steel
> secondary: #e7e5e4 Bone edge
>
> The arrival is hot metal hitting water. The icon disc is blue-steel and the border is bone edge. The tree chip leaves the weapon gray. Quiet, and machined. If the blue is muddied it falls back into that gray.

> [!PALETTE] Spark
> primary: #44403c Iron
> secondary: #e29a6a Copper
>
> The icon's dark stop is already this iron. The arrival is one copper flash, then the sword or turret cools and stays. Copper sits between Earth brown and Command amber, so a small chip can read as a third warm tree. Iron alone disappears next to the weapon gray, which means the copper has to carry the badge.

> [!PALETTE] Brass
> primary: #5c564e Gunmetal
> secondary: #b9975b Aged brass
>
> The conjured blade stays silver. The core is the hardware around it: casings, turret, crossguard. Brass is duller and more olive than Light's gold or Command's amber, so a full swatch separates. A 12px chip is the size where the three warm metals blur. The upgrades list would then show three warm-metal trees.

> [!PALETTE] Left behind
> primary: #8d9aa3 Weathered steel
> secondary: #2f6f62 Verdigris
>
> Dropped swords never expire, and the turret fires and then falls silent. The colour is metal that stayed and weathered. No other research tree uses this teal. Earth's tremor ring is a brighter `#27d3c8`. This pair is about the weapon after it arrives, which argues with the flavor line, and verdigris can read as growth if the steel is too light.

### [x] P0.1 Choose the Armory primary and secondary

**Complexity:** Low

**Decided:** Quench. Primary `#4f6d8c` blue-steel, secondary `#e7e5e4` bone edge. The core icon disc is the primary and its border is the secondary.

---

## P1: Good to do

### [x] P1.1 Paint the chosen pair through the existing chrome

**Complexity:** Low. Depends on P0.1.

**Done:** `ARMORY_PRIMARY_COLOR` and `ARMORY_SECONDARY_COLOR` live in `armoryConstants.ts`. The tree chip, Charge, the turret footprint, barrel, and pips, the slash trail, the turret card, and `023_core_armory.svg` read that pair. Create Sword and Charge Sword (formerly Improvised Sword) use `chargeSword.svg`, a ghostly copy of the sword icon in the same colours. Throw Sword's card uses `chargeSwordThrow.svg`, that blade tipped with a short trail. The throw's flight, the orbit, and the dropped token keep the upright sword.

One pair, every surface reading it. Add `ARMORY_PRIMARY_COLOR` and `ARMORY_SECONDARY_COLOR` in `armoryConstants.ts` (hex for CSS, and the `0x` form the turret draw already uses). Point these at them:

- `RESEARCH_TREE_COLOUR_ARMORY` in `researchTreeChrome.ts` (the tree-list border).
- `CHARGE_RESOURCE_COLOR` in `Charge.ts` (the resource disc and the bar).
- `TURRET_BODY_COLOR`, `TURRET_BARREL_COLOR`, and `TURRET_PIP_COLOR` in `armoryConstants.ts`. Keep `TURRET_HULL_COLOR` black and `TURRET_PIP_EMPTY_COLOR` the darker iron.
- `SLASH_TRAIL_COLOR` in `1002_ImprovisedSword/1002Ability.ts`.
- The inline turret picture in `1004_DeployTurret/1004Ability.ts`.
- The stops in `character_defs/items/assets/023_core_armory.svg`. The SVG cannot import the constants, so it is painted to the same hexes by hand.

`researchTreeChrome.test.ts` already asserts the armory tree colour. Update that expectation to the chosen primary.

---

## Suggested order

- P0.1, then P1.1.
