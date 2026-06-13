import React, { useState } from 'react';
import type { EnemyUnitId } from '../games/minion_battles/game/units/unit_defs/unitDef';
import { getUnitDefEntry } from '../games/minion_battles/game/units/unit_defs/unitDef';
import { getAbility } from '../games/minion_battles/abilities/AbilityRegistry';
import slimeIcon from '../games/minion_battles/assets/characters/slime.svg';
import swordwomanIcon from '../games/minion_battles/assets/characters/swordwoman.svg';
import wolfHeadIcon from '../games/minion_battles/assets/characters/dark_animals/wolf-head.svg';
import wolfHowlIcon from '../games/minion_battles/assets/characters/dark_animals/wolf-howl.svg';
import boarIcon from '../games/minion_battles/assets/characters/dark_animals/boar.svg';
import swarmlingIcon from '../games/minion_battles/assets/characters/dark_animals/swarmling.svg';
import thornbinderIcon from '../games/minion_battles/assets/characters/thornbinder.svg';
import lanterniteIcon from '../games/minion_battles/assets/characters/lanternite.svg';
import lanterniteNestIcon from '../games/minion_battles/assets/characters/lanternite_nest.svg';
import dogIcon from '../games/minion_battles/assets/characters/dog.png';

const SPRITE_ICONS: Record<string, string> = {
    enemy_melee: swordwomanIcon,
    enemy_ranged: slimeIcon,
    dark_wolf: wolfHeadIcon,
    alpha_wolf: wolfHowlIcon,
    boar: boarIcon,
    swarmling: swarmlingIcon,
    thornbinder: thornbinderIcon,
    lanternite: lanterniteIcon,
    lanternite_nest: lanterniteNestIcon,
    dog: dogIcon,
};

type Faction = 'dark_creature' | 'beast' | 'other';

type BestiaryEntry = {
    id: EnemyUnitId;
    name: string;
    abilityIds: string[];
    faction: Faction;
};

const BESTIARY_ENTRIES: BestiaryEntry[] = [
    { id: 'enemy_ranged',    name: 'Ranged Enemy',   abilityIds: ['0001'],                         faction: 'dark_creature' },
    { id: 'dark_wolf',       name: 'Wolf',            abilityIds: ['0003'],                         faction: 'dark_creature' },
    { id: 'alpha_wolf',      name: 'Alpha Wolf',      abilityIds: ['0005', '0007', '0011', '0012'], faction: 'dark_creature' },
    { id: 'thornbinder',     name: 'Thornbinder',     abilityIds: ['0008'],                         faction: 'dark_creature' },
    { id: 'husk_artillery',  name: 'Husk Artillery',  abilityIds: ['0009'],                         faction: 'dark_creature' },
    { id: 'huskling',        name: 'Huskling',        abilityIds: ['0002'],                         faction: 'dark_creature' },
    { id: 'swarmling',       name: 'Swarmling',       abilityIds: ['0013'],                         faction: 'dark_creature' },
    { id: 'lanternite',      name: 'Lanternite',      abilityIds: ['0010'],                         faction: 'beast' },
    { id: 'lanternite_nest', name: 'Lanternite Nest', abilityIds: ['0014'],                         faction: 'beast' },
    { id: 'thornling',       name: 'Thornling',       abilityIds: ['0015'],                         faction: 'beast' },
    { id: 'thornling_nest',  name: 'Thornling Nest',  abilityIds: [],                               faction: 'beast' },
    { id: 'dog',             name: 'Dog',             abilityIds: ['0701'],                         faction: 'beast' },
    { id: 'enemy_melee',     name: 'Melee Enemy',     abilityIds: ['0002'],                         faction: 'other' },
    { id: 'boar',            name: 'Boar',            abilityIds: ['0006'],                         faction: 'other' },
];

const FACTION_SECTIONS: { faction: Faction; label: string }[] = [
    { faction: 'dark_creature', label: 'Dark Creatures' },
    { faction: 'beast',         label: 'Beasts' },
    { faction: 'other',         label: 'Other' },
];

const ICON_SIZE = 58;

function getSpriteUrl(id: EnemyUnitId): string | undefined {
    const spriteKey = getUnitDefEntry(id)?.characterSpriteKey;
    return spriteKey ? SPRITE_ICONS[spriteKey] : undefined;
}

function UnitIcon({ id, size }: { id: EnemyUnitId; size: number }) {
    const url = getSpriteUrl(id);
    if (!url) return <div style={{ width: size, height: size }} className="rounded bg-surface-light flex-shrink-0" />;
    return (
        <img
            src={url}
            alt=""
            style={{ width: size, height: size, objectFit: 'contain', flexShrink: 0 }}
        />
    );
}

function BestiaryList({
    selectedId,
    onSelect,
}: {
    selectedId: EnemyUnitId | null;
    onSelect: (id: EnemyUnitId) => void;
}) {
    return (
        <div className="p-3 overflow-y-auto h-full">
            {FACTION_SECTIONS.map(({ faction, label }) => {
                const entries = BESTIARY_ENTRIES.filter((e) => e.faction === faction);
                if (entries.length === 0) return null;
                return (
                    <div key={faction} className="mb-5">
                        <h2 className="text-xs font-semibold uppercase tracking-wider text-muted mb-2 border-b border-border-custom pb-1">
                            {label}
                        </h2>
                        <div className="grid grid-cols-2 gap-1">
                            {entries.map((entry) => {
                                const isSelected = entry.id === selectedId;
                                return (
                                    <button
                                        key={entry.id}
                                        type="button"
                                        onClick={() => onSelect(entry.id)}
                                        className={`flex flex-row items-center gap-3 px-2 py-1.5 rounded border transition-colors text-left w-full ${
                                            isSelected
                                                ? 'border-primary bg-surface-light'
                                                : 'border-transparent hover:border-border-custom hover:bg-surface-light'
                                        }`}
                                    >
                                        <UnitIcon id={entry.id} size={ICON_SIZE} />
                                        <span className="text-sm text-white font-medium">{entry.name}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
    );
}

function BestiaryDetail({ entry }: { entry: BestiaryEntry }) {
    const def = getUnitDefEntry(entry.id);
    const abilities = entry.abilityIds
        .map((id) => getAbility(id))
        .filter((a): a is NonNullable<typeof a> => a != null);

    return (
        <div className="p-6 overflow-y-auto h-full">
            <div className="flex items-start gap-6 mb-6">
                <UnitIcon id={entry.id} size={128} />
                <div className="flex flex-col gap-2">
                    <h2 className="text-2xl font-bold text-white">{entry.name}</h2>
                    {def?.hp != null && (
                        <p className="text-sm text-muted">
                            <span className="text-white font-medium">HP:</span> {def.hp}
                        </p>
                    )}
                    {def?.uiDescription && (
                        <p className="text-sm text-gray-300 max-w-md">{def.uiDescription}</p>
                    )}
                </div>
            </div>

            {abilities.length > 0 && (
                <div>
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mb-3 border-b border-border-custom pb-1">
                        Abilities
                    </h3>
                    <div className="flex flex-wrap gap-3">
                        {abilities.map((ability) => {
                            const tooltipLines = ability.getTooltipText?.() ?? [];
                            const firstLine = tooltipLines[0] ?? '';
                            return (
                                <div
                                    key={ability.id}
                                    className="flex flex-col items-center gap-1 p-2 rounded border border-border-custom bg-surface w-28"
                                >
                                    <div
                                        className="w-14 h-14 flex items-center justify-center"
                                        dangerouslySetInnerHTML={{ __html: ability.image }}
                                    />
                                    <span className="text-xs text-white font-medium text-center leading-tight">
                                        {ability.name}
                                    </span>
                                    {firstLine && (
                                        <span className="text-[10px] text-muted text-center leading-tight">
                                            {firstLine}
                                        </span>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function EmptyDetail() {
    return (
        <div className="flex items-center justify-center h-full text-muted text-sm">
            Select a unit to view details.
        </div>
    );
}

export default function BestiaryPanel() {
    const [selectedId, setSelectedId] = useState<EnemyUnitId | null>(null);

    const selectedEntry = selectedId ? BESTIARY_ENTRIES.find((e) => e.id === selectedId) : null;

    return (
        <div className="flex rounded-lg border border-border-custom bg-surface overflow-hidden min-w-[60rem] h-[calc(100vh-200px)]">
            {/* Left panel — unit list, scrolls independently */}
            <div className="w-96 flex-shrink-0 border-r border-border-custom overflow-y-auto">
                <BestiaryList selectedId={selectedId} onSelect={setSelectedId} />
            </div>

            {/* Right panel — unit details, scrolls independently */}
            <div className="flex-1 min-w-[36rem] overflow-y-auto">
                {selectedEntry ? <BestiaryDetail entry={selectedEntry} /> : <EmptyDetail />}
            </div>
        </div>
    );
}
