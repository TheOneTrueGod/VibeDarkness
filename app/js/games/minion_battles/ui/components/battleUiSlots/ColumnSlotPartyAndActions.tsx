/**
 * ColumnSlotPartyAndActions - the Left Column slot's content: the party/enemy action timeline.
 * Thin wrapper around BattleTimeline; it already self-scrolls its unit list internally.
 */
import React from 'react';
import BattleTimeline from '../BattleTimeline';

type ColumnSlotPartyAndActionsProps = Omit<React.ComponentProps<typeof BattleTimeline>, 'layout'>;

export default function ColumnSlotPartyAndActions(props: ColumnSlotPartyAndActionsProps) {
    return <BattleTimeline {...props} layout="rail" />;
}
