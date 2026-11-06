# Storm Core (Ability group **13**)

All Storm cards use 4-digit ids starting with `13` (`AbilityGroupId.Storm`). Shared tuning lives in `stormConstants.ts`; shared visuals in `stormVfx.ts`. The research tree is `app/js/researchTrees/trees/storm.ts`; the core item is `character_defs/items/core/024_core_storm.ts`.

## Player profile

Storm is the **skirmisher** core. Its resource trickles in on its own; the burst of it comes from Thunderclap drawing charge back out of marked enemies. The kit plays as a loop of *move, tag, cash in*: dart around the fight tagging enemies Conductive, then spend the marks with a chain or a burst that pays off every tag at once. It is ranged-ish damage and setup, not control (that is Gravity) and not sustain (Light / Blood Mage).

## Ability spine

Every Storm card refills all its uses at round start (no `recoveries`, the engine default).

| Card | Ability | Research | Cost | Uses | Role |
|------|---------|----------|------|------|------|
| **1301** | **Arc Bolt** | Storm Core | free | 3 | Fast poke projectile (`arc_bolt`). From a Conductive enemy, always jumps **once**, least Conductive enemy first, then nearest (`stepDown: 'preferLower'`). 6 damage, 4 on the jump. Only an unmarked last enemy gains Conductive (`markOnlyUnmarked`). Spends nothing; the last enemy reached gets Conductive 1 |
| **1303** | **Chain Lightning** | Storm Core | 2 Static | 2 | Unit-target bolt: 6 damage, hits 5 enemies: the target plus 4 leaps (Forked Lightning: +2, so 7), Conductive first; a Conductive enemy loses all its stacks, takes +2 (flat) and is staggered; relays through conductors (not in the tooltip) |
| **1302** | **Static Step** | Static Step (tier 2) | 1 Static + 1 Movement Point | 2 | {Dodge} dash (iFrames from its `'iframe'` interval); 1 damage and Conductive to every enemy passed through, in a touch circle 1.5x the body's radius, filled with arcs that ride the caster |
| **1304** | **Thunderclap** | Thunderclap (tier 2) | 1 Static | 1 | Ring burst: 4 damage to each enemy, +4 to a Conductive one, which loses 1 stack and gives 1 Static back; enemies without Conductive gain 1. Knockback 1, Bright 1 (fixed) |
| — | **Forked Lightning** | tier 3, after the core | — | — | Chain Lightning reaches 2 more enemies (`hasResearchNode`, like Blood Splinters) |

## Mechanics

### Static (`resources/Static.ts`, id `static`)

- 0 to 6 pips (`barStyle: 'pips'`), electric cyan with a yellow crackle on filled orbs (`pipCrackleColor`, drawn by `PipResourceBar`), `CloudLightning` icon. Mission start: 2 (Storm Core node).
- **Passive recovery**: +1 Static every half round (`STATIC_RECOVERY_SECONDS`, 5 s); shown as the +N/s tooltip (`perSecondGain`). Moving or standing still changes nothing.
- **Burst**: Thunderclap is the burst source, returning 1 Static per Conductive stack it draws out.
- **World modifiers**: `WorldModifierDef.resourceGainMultipliers` scales the passive recovery (Rainy Storm doubles it). Read through `WorldModifierManager.getResourceGainMultiplier`.
- `recoverySeconds` is serialized with the resource.

### Conductive (mark)

A mark (`buffs/MarkBuff.ts`, def in `buffs/marks/conductiveMark.ts`): stacking to 3, 8 s from the last refresh.

- Applied by Static Step (`applyMarkToPrimaryTarget`) and by Arc Bolt to the last enemy it reaches (`resolveMarkBounce`).
- Read as ladder rungs by Arc Bolt (not spent), spent one stack per enemy by Thunderclap (`spendMarkStacks`), and all at once by Chain Lightning (`consumeMark`, which also reads `getMarkStacks` to steer).
- Visual: **one arc crawling over the body per stack**, each in its own slice of the edge, so the number of arcs alive at once is the stack count. Conductive sets no `pipColor`, so `buffVisuals` draws no pips.

### Mark ladder (`abilities/markBounce.ts`)

`resolveMarkBounce` is the engine rule behind Arc Bolt. Stack counts are rungs: from an enemy with N stacks the hit may leap to an unvisited, less-marked enemy in reach (nearest first), up to `maxBounces` times. `stepDown: 'nextRung'` (default) allows only N - 1; `'anyLower'` allows anything below N; `'preferLower'` allows any enemy, fewest stacks first. Arc Bolt uses `'preferLower'`, one leap and `markOnlyUnmarked`. Nothing is spent; the last enemy reached gains the mark (only if unmarked, with `markOnlyUnmarked`). The content deals each leap (`onBounce`) with `tryDamageOrBlock(..., { fireAbilityEvents: false })` so the ON_ATTACK_HIT handler that started the chain does not re-enter.

### Conductors

Deployables tagged `conductor` (all dropped weapons and placed deployables, i.e. Armory swords, maces, shields and turrets) are relays for `abilities/chainHops.ts`. When no enemy is in leap range, the bolt may pass through an own-team conductor that has an enemy beyond it. A relay is a free hop (up to 3 per cast) and the conductor is not consumed.

## Interplay with other systems

- **Armory**: dropped weapon tokens and turrets carry Chain Lightning across gaps.
- **Gravity**: Gravity Locus and Collapse pile enemies together, which is exactly what Arc Bolt bounces, Chain Lightning and Thunderclap want.
- **Light / darkness**: Thunderclap always leaves a Bright 1 light.
- **World**: Rainy Storm doubles Static's passive recovery.
- **Crowd control**: Chain Lightning's payoff is a Stagger (`tryApplyStagger`), so bosses' CC armour applies as usual.

## Visual language (secondary `#a5f3fc`, primary `#3b5bdb`)

Every Storm visual is a **jagged bolt with a white-hot core and a cyan glow** (`LightningBolt` effect, `drawLightningPath`) and every hit is a **spark burst** (`StormSpark`). Area mass (rings, telegraphs) is storm blue. Bolts re-fork a few times a second from a hash, never from engine RNG. Static's yellow crackle is the one exception: it marks the resource, not an attack.

| Ability | Projectile / trail | Hit |
|---------|--------------------|-----|
| Arc Bolt | `arc_bolt`: glowing head dragging a crackling two-strand tail (no BulletTrail) | `StormSpark`; each leap is a bolt between the two enemies plus a spark |
| Static Step | afterimages + a bolt pinned at the start whose far end rides the caster | spark at start and arrival |
| Chain Lightning | contracting gather ring, then hop-by-hop bolts (`Effect.delay`) | spark per target, bigger per stack spent; conductors flare |
| Thunderclap | contracting ring windup; storm-blue shock ring + 8 radial bolts; a bolt from each enemy it drew charge from back to the caster | Bright light |

## Where Storm diverges from common patterns

- **A trickle resource with an ability-driven burst.** Static only refills on a timer; the burst comes from Thunderclap, not from a refill effect.
- **Copy**: player voice ("You learn to..."), talk about charge, hum, air before a storm, the sky. Keep it low tech: no "electricity", "voltage" or "ions".
- **Conductive stack use is never spelled out in tooltips.** The Conductive reminder already says "Abilities use conductive charge for bonus effects", so a card names only the bonus ("Conductive enemies take 4 extra damage and give you 1 Static"), not that stacks are lost.
