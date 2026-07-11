/**
 * ColumnSlotChat - the Right Column slot's content: the lobby chat panel.
 * Thin wrapper around Chat; Chat already scrolls only its message list internally.
 */
import React from 'react';
import Chat from '../Chat';
import type { MessageEntry } from '../Chat';

interface ColumnSlotChatProps {
    messages: MessageEntry[];
    connectionStatus: 'disconnected' | 'connecting' | 'connected';
    enabled: boolean;
    onSend: (message: string) => void;
    topContent?: React.ReactNode;
    headerRightContent?: React.ReactNode;
}

export default function ColumnSlotChat(props: ColumnSlotChatProps) {
    return <Chat {...props} />;
}
