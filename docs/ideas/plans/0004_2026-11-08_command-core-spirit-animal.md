# Command Core: the spirit animal

The Command Core becomes a **spirit animal** that the player commands. The pet dog stops being a literal dog and becomes a tiny spirit. Wisp-like particles drift up and away from it. The same wisps become the tree's visual language: its spell circle, its projectile trails, and its ability effects. This plan picks the colours and the particle style before anything is built, then lists the engine work.

Each item has a complexity estimate:

- **Low**: a few changes to a few files.
- **Medium**: overhauls a small subsystem.
- **Large**: touches many parts of the code and likely needs a data migration.

Baseline: `COMMAND_THEME` in `themes/abilityThemes.ts` is primary-only, `#f59e0b`. The core icon `020_core_command.svg` is an amber disc with a `#fcd34d` to `#b45309` fill. The pet draws `assets/characters/dog.png` (a white dog on a black disc) through `unitSprites.ts`. Spell circles exist for Storm, Earth and Light (`spellCircleEffects.ts`) and Armory (the weapon orbit). Command has none. Reusable particle sources already exist: `SpriteFountainEmitter` (data-driven plumes with upward drift) and `buffParticleAura.ts` (render-only orbs off a unit). Other trees own Earth `#b45309`, Light `#eab308`, Gravity `#a855f7`, Blood Mage `#f87171`, Darkness `#6366f1`, Training `#7dd3fc`, Storm `#3b5bdb` / `#a5f3fc`, and Armory `#4f6d8c` / `#e7e5e4`. No tree is green.

Primary is the **mass**: the spirit's halo, the ring's fill and edge, the larger and dimmer particles. Secondary is the **event**: the bright particles, the rune dashes, the projectile core. The spirit's body is the secondary lifted toward white.

---

## P0: Must do

The cards below show each palette on the spirit dog, its ring, and a mote trail. Use **Try in studio** to load one into the studio, which shows all four particle styles in all three contexts. The studio's colour pickers let you nudge either colour; edits are not saved.

> [!FX_PALETTE] Hearth
> primary: #f59e0b Amber
> secondary: #fcd34d Honey
>
> The shipped Command amber, kept. Warm and loyal, a campfire dog. Amber wisps sit close to Light's gold and Earth's brown, so a small ring can read as the wrong tree. On lit ground the honey particles lose contrast.

> [!FX_PALETTE] Verdant
> primary: #15803d Moss
> secondary: #bbf7d0 Mint breath
>
> A forest spirit. The kit already throws thorns and plants Bramble Patch, so green ties the pet and the plants into one nature. No other tree owns green, so the ring is unambiguous at any size. Risk: green is the usual "heal" colour, and the mint can read as a buff.

> [!FX_PALETTE] Moonlit
> primary: #475569 Slate
> secondary: #e2e8f0 Moon-white
>
> The most ghostly: a pale shade of an animal, almost colourless. Wisps read as breath or mist, which suits "spirit". It is the weakest tree identity. It sits near Armory's bone edge, and the slate halo disappears in darkness.

> [!FX_PALETTE] Ember fox
> primary: #c2410c Rust
> secondary: #fed7aa Pale ember
>
> A fox-fire spirit. Embers drifting off the animal feel hot and alive and are strongest on dark ground. It is close to Earth's `#b45309` and blurs at chip size. It is a shift from the shipped amber, not a break.

> [!FX_PALETTE] Aurora
> primary: #0f766e Deep pine
> secondary: #d9f99d Lime glow
>
> Two hues, like northern lights: a teal halo with lime sparks. It reads as otherworldly rather than natural, and it is the most distinct from every other tree. Teal is near Earth's tremor ring `#27d3c8`, and a two-hue spirit is more to paint by hand in SVGs.

> [!FX_STUDIO] Particle studio
> Each row is one particle style, each column one place the tree will use it. In the game these are Pixi particles, so speeds and counts here are only roughly right; the shapes, colours and motion are what to judge.

### [x] P0.1 Choose the spirit palette

**Complexity:** Low

Once chosen, the pair becomes `COMMAND_THEME`'s primary and secondary. That is the first secondary for Command, so the steps in `themes/AGENTS.md` ("Giving a group its first secondary") apply: audit Command's archetype callers, repaint the group's SVGs, and let `svgPalette.test.ts` start guarding the folder.

**Decided:** Aurora. Primary `#0f766e` deep pine, secondary `#d9f99d` lime glow.

### [x] P0.2 Choose the particle style

**Complexity:** Low

The four styles are:

- **Wisps**: soft blurred puffs that sway as they climb. Quiet, and it reads as "spirit" without much noise. It is the style the brief describes.
- **Motes**: pin-sharp flickering sparks. The only style that stays legible on a tiny unit or at full zoom-out.
- **Ribbons**: curling smoke strands. Very "spirit", but busy, and the strands tangle when many units overlap.
- **Ghost-fire**: teardrop flames. The strongest silhouette, but it reads as fire, which other trees may want later.

**Decided:** Motes, the same style in every context (ring, trail, unit).

### [x] P0.3 Make the dog a tiny spirit

**Complexity:** Medium (sprite tint plus a new emitter; the pet's size is gameplay data, so check hitboxes)

**Done:** the dog unit def is now **Spirit Dog**, size `Tiny` (radius 18 to 12, which also shrinks its hitbox), with `spectralSprite: themedSpectralSprite('command')` (the sprite drawn additive and lime-tinted, so the white dog glows and the black disc drops out, over a translucent pine body) and `particleAura: BUFF_PARTICLE_AURA_PRESETS.spiritMotes()`. Both are generic unit-def properties.

Shrink the pet's drawn size, and draw `dog.png` as a glowing silhouette: the white turns into the spirit colour and the black disc drops out. The studio's "Off a unit" column shows the look. Add a render-only particle source on the unit, built on `buffParticleAura.ts` or `SpriteFountainEmitter`, rather than a one-off painter. Decide whether "tiny" is visual only or also changes the pet's collision radius; the second is a balance change.

---

## P1: Good to do

### [x] P1.1 One "spirit wisp" particle def reused everywhere

**Complexity:** Medium. **Prerequisite for P1.2 and P1.3.**

**Done:** `game/effects/motes.ts` (`MoteSpec`, `themedMoteSpec`, `createMote`, `drawMote`), used by particle auras (`motes`), projectile trails (`particleTrail` / `projectileParticleTrails.ts`), the Command spell circle and the command cue.

Define the chosen style once, as data: shape, colour roles, rise, sway, lifetime and count. Give it three entry points that read it: around a ring, behind a moving point, and off a unit. The ring, the trail and the unit then cannot drift apart. Extend `SpriteFountainConfig` or add a sibling config, and avoid a Command-only emitter class.

### [x] P1.2 Command spell circle

**Complexity:** Medium

**Done:** `SPELL_CIRCLE_STYLE_COMMAND`, painted by `SpellCircleCommand` in `effect_defs/commandEffects.ts`. Bramble Patch (0706) draws it on its 1 s windup.

Register a `command` style in `game/spellCircles/spellCircles.ts`, with a painter in `effect_defs/spellCircleEffects.ts` beside Storm, Earth and Light. The painter is a ring with rotating rune dashes and the P1.1 wisps rising off its rim, which is the studio's "Ring" column.

### [x] P1.3 Command projectile trails and ability effects

**Complexity:** Medium

**Done:** Fling Thorn (0705) flies lime with a mote trail. Every pet command (Pet, Sic 'em, Bramble Patch, Order: Attack, Order: Move) now plays one **command cue**, a stream of motes from the player to the pet and a burst round it (`game/effects/commandCue.ts`). It replaces the old green and red pulses.

Fling Thorn and the other Command projectiles take the P1.1 trail. Abilities that pass explicit colours should read the theme roles instead.

### P1.4 Unify how the player commands tokens

**Complexity:** Large (unconfirmed: needs an investigation pass first)

Commanding the spirit is the third case of the player directing a token on the field: the Armory's orbit and dropped weapons, and the Court Magician's crystals in Rearrange are the other two. This item is an investigation: list how each one targets, orders and moves its token today, and propose one shared building block. Write it as its own browser plan before any code.

---

## P2: Nice to do

### [x] P2.1 Repaint the Command art

**Complexity:** Low

**Done for the core icon:** `020_core_command.svg` is a pine disc with a lime rim and rising motes. The card art (Pet, Sic 'em) is PNG and unchanged.

Repaint `020_core_command.svg` and the Command card SVGs to the chosen pair, so the core icon shows a small spirit silhouette instead of a plain disc.

---

## Suggested order

- P0.1 and P0.2 (decisions), then P0.3.
- P1.1, then P1.2 and P1.3 in either order.
- P1.4 as a separate investigation.
- P2.1 any time after P0.1.
