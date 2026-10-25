/**
 * Character art URLs, keyed by sprite key. The one place unit art is imported.
 *
 * - `UnitDefEntry.sprite` points at one of these (Bestiary, timeline icons).
 * - `UnitDefEntry.characterSpriteKey` names one of these keys for the in-battle texture; several
 *   defs may share a key (e.g. `displacer_clone` reuses `displacer_spirit`).
 * - `AssetRegistry` preloads a texture per entry, so adding art here is the only wiring needed.
 */

import slime from '../../../assets/characters/slime.svg';
import wolfHead from '../../../assets/characters/dark_animals/wolf-head.svg';
import wolfHowl from '../../../assets/characters/dark_animals/wolf-howl.svg';
import boar from '../../../assets/characters/dark_animals/boar.svg';
import swarmling from '../../../assets/characters/dark_animals/swarmling.svg';
import swarmNest from '../../../assets/characters/dark_animals/swarm_nest.svg';
import displacerSpirit from '../../../assets/characters/dark_animals/displacer_spirit.svg';
import thornbinder from '../../../assets/characters/thornbinder.svg';
import lanternite from '../../../assets/characters/lanternite.svg';
import lanterniteNest from '../../../assets/characters/lanternite_nest.svg';
import curlingVines from '../../../assets/characters/curling_vines.svg';
import dog from '../../../assets/characters/dog.png';

export const UNIT_SPRITE_URLS = {
    slime,
    dark_wolf: wolfHead,
    alpha_wolf: wolfHowl,
    boar,
    swarmling,
    swarm_nest: swarmNest,
    displacer_spirit: displacerSpirit,
    thornbinder,
    lanternite,
    lanternite_nest: lanterniteNest,
    curling_vines: curlingVines,
    dog,
} as const;

export type UnitSpriteKey = keyof typeof UNIT_SPRITE_URLS;
