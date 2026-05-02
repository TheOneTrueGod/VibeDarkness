import React from 'react';
import type { DialoguePhrase } from '../../../storylines/storyTypes';
import { getNpc } from '../../../constants/npcs';
import CharacterPortrait from '../../components/CharacterPortrait';

interface DialoguePortraitRowProps {
    phrase: DialoguePhrase;
}

export default function DialoguePortraitRow({ phrase }: DialoguePortraitRowProps) {
    return (
        <div className="flex shrink-0 justify-between gap-4 pt-4 pb-0 h-[140px] items-end">
            <div className="flex gap-2 items-end">
                {(phrase.portraits?.left ?? (phrase.speakerId ? [phrase.speakerId] : [])).slice(0, 2).map((npcId) => {
                    const npc = getNpc(npcId);
                    const isActive = phrase.speakerId === npcId;
                    return npc?.portrait ? (
                        <CharacterPortrait
                            key={npcId}
                            picture={npc.portrait}
                            size="large"
                            className={`border-2 flex-shrink-0 ${isActive ? 'border-primary shadow-lg' : 'border-border-custom opacity-70'}`}
                        />
                    ) : (
                        <div
                            key={npcId}
                            className="rounded-lg border-2 border-border-custom w-24 h-24 shrink-0 opacity-70"
                            style={{ backgroundColor: npc?.color ?? '#333' }}
                        />
                    );
                })}
            </div>
            <div className="flex gap-2 items-end">
                {(phrase.portraits?.right ?? []).slice(0, 2).map((npcId) => {
                    const npc = getNpc(npcId);
                    const isActive = phrase.speakerId === npcId;
                    return npc?.portrait ? (
                        <CharacterPortrait
                            key={npcId}
                            picture={npc.portrait}
                            size="small"
                            className={`border-2 flex-shrink-0 ${isActive ? 'border-primary shadow-lg' : 'border-border-custom opacity-70'}`}
                        />
                    ) : (
                        <div
                            key={npcId}
                            className="rounded-lg border-2 border-border-custom w-24 h-24 shrink-0 opacity-70"
                            style={{ backgroundColor: npc?.color ?? '#333' }}
                        />
                    );
                })}
            </div>
        </div>
    );
}
