# Weapons

How swords and maces should feel. Swing Sword (`app/js/games/minion_battles/card_defs/0112_SwingSword`) and Swing Mace (`app/js/games/minion_battles/card_defs/0115_SwingBat`) are the reference swings. A conjured copy, such as Charge Sword or Charge Mace, follows that swing rather than a third profile.

Swords are a little faster. Their hit band is thinner than a mace's, and the step in is a little longer so that shallower band still connects. They inflict bleed and a smaller knockback. Combos and extra attacks belong to swords, and are not built yet. The band widths and the sword lunge live in `app/js/games/minion_battles/card_defs/weaponSwingProfile.ts`.

Maces are a little slower. Their hit band is wider and they can strike more targets. They knock back harder, and the stuns associated with them last longer.
