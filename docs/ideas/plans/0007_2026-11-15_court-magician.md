# The Court Magician: super attacks

The first Chapter 3 boss, fought in the wizard's tower (`court_magician_tower`). Already built, and it introduces **super attacks**. Part of [Chapter 3](plan:0006). Next: [The Garden Heart](plan:0008).

---

## The fight {section}

### Overview

**Status:** built (abilities `1401` to `1407` and `1490` in `card_defs/14_enemy_court_magician/`, AI in `game/units/unitAI/courtMagician/`, setup in `castle/castleBosses.ts`).

He keeps his distance and fights through dark crystals that cannot be hurt. They only move or ram when he commands them. He starts with two and conjures one more at each 10% of health lost from 90% down to 50% (five more). Every 10% he also swaps places with the crystal farthest from the party (Mirror Swap), so the party's focus is always pulled away from him. When the party catches up and lands a few hits he blinks across the arena. Below 50% he enrages: denser novas, longer volleys, and the Crystal Laser.

> [!FX_PALETTE] Court Magician
> primary: #3b0764 Crystal mass
> secondary: #f0abfc Orchid
> art: cm-crystals, cm-rearrange, cm-nova
>
> The fight's two colours, the same pair the Court Magic theme uses in the game (`COURT_MAGIC_THEME`). The stills are drawn from the fight's numbers rather than captured from the renderer; the icons below are the real ability icons.

### How the fight works

- **Rearrange** (`1401`): he sweeps a hand and every crystal glides into a new shape: a line pointing at a player, a line across him, a cage round a player, a guard ring round himself, or a wide ring round a player. Each crystal that lands shocks a small area for 3 damage, and the glide previews it.
- **Shard Nova** (`1402`): every crystal flares and bursts a ring of 8 slow shards (12 enraged). Neighbouring crystals are offset by half a step, so the rings interleave into a field to walk through. Where Rearrange just put the crystals decides where the field is thick.
- **Crystal Volley** (`1403`): the crystals nearest a player answer one by one, each doing Crystal Ram (`1404`) at where that player stands when its turn comes. Four crystals, six enraged.
- **Blink** (`1405`) and **Mirror Swap** (`1406`): how he gets away. Swap is cast by the `hpStep` component every 10% lost, and waits while a Crystal Laser is being built, since the laser is made from the crystals.
- **Conjure Crystal** (`1407`): adds a crystal at each of the first five 10% steps.

The loop is that Rearrange decides the shape of the next Shard Nova or Volley, so the party reads the crystals to know what is coming.

> [!FX_PALETTE] Court Magician abilities
> primary: #3b0764 Crystal mass
> secondary: #f0abfc Orchid
> art: cm-rearrange-icon, cm-nova-icon, cm-volley-icon, cm-ram-icon, cm-blink-icon, cm-swap-icon, cm-conjure-icon, cm-laser-icon
>
> The eight ability icons, taken straight from the game's `.svg` files.

## The super {section}

### The super: Crystal Laser

This is where the party meets a super attack. Below 50% he casts Crystal Laser (`1490`), and it is shaped differently from everything else he does: it commits time and resources and has a large battlefield effect.

- **Time stops** for 2.2 s while he gathers violet light and every crystal glides into a tight wall in front of him, facing a player. He is exempt from his own Time Stop.
- **Aim**: time resumes with red sight-lines showing the lane, and the party has 1.2 s to react.
- **Fire**: the wall fires one huge laser, a ray from every crystal, for half a round, slowly turning to follow that player. Each ray stops on the first body it meets, burning and pushing it. A raised shield stops it cold and covers everyone behind, so the party wins by taking turns in front with their shields.

> [!FX_PALETTE] Crystal Laser
> primary: #3b0764 Crystal mass
> secondary: #f0abfc Orchid
> art: cm-laser
>
> Aim on the left, fire on the right. The red sight-lines are the telegraph; the shield on the right is the answer.

**What the fight teaches.** The party sees a super from the receiving end: a long, loud commitment with a clear telegraph and a clear answer. It sets up the Fallen King's regenerating shield, where the party has to make the same kind of commitment themselves. Crystal Laser is also the first attack flagged Reactable in the [Garden Heart](plan:0008) plan, which stays inert until the party has learned Reactions.

**Open point.** How the party learns to use supers of their own on this boss is not decided here. The fight already tells them what a super looks like, but nothing in it needs one from them.

> [!DECISION] Should the Court Magician require a player super?
> The fight shows a super, but beating him needs none. Options:
> - **Leave it as is.** The party only sees a super. Cheapest, and the Fallen King is the first fight to need one.
> - **Give him a regenerating shield for a short phase.** Breaking it needs burst damage, a small taste of the Fallen King's version. Costs a new shield mechanic that the Fallen King needs anyway.
> - **Make his crystals vulnerable only to burst damage.** Reuses the crystals, but undoes the "cannot be hurt" rule that makes them read as fixtures.
>
> Recommendation: the short shield phase, since it builds the Fallen King's shield early and cheaply.
